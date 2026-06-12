// Cash deposit ledger — paying-in slips, bank deposits.
// All reads via live_cash_deposits view. Money in pence (INTEGER).

import type { DB } from './index';

export interface CashDepositRow {
  id: number;
  deposit_date: string;
  amount: number;
  reference: string | null;
  note: string | null;
  recorded_by: number | null;
  created_at: string;
  is_confirmed: number;
  confirmed_at: string | null;
  confirmed_by: number | null;
}

export interface CashDepositListItem extends CashDepositRow {
  recorded_by_name: string | null;
  confirmed_by_name: string | null;
}

// ============================================================================
// LIST — by date range
// ============================================================================
export interface ListCashDepositsFilter {
  from?: string;
  to?: string;
  limit?: number;
}

export async function listCashDeposits(
  db: DB,
  filter: ListCashDepositsFilter,
): Promise<CashDepositListItem[]> {
  const conditions: string[] = [];
  const args: unknown[] = [];

  if (filter.from) {
    conditions.push('cd.deposit_date >= ?');
    args.push(filter.from);
  }
  if (filter.to) {
    conditions.push('cd.deposit_date <= ?');
    args.push(filter.to);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  args.push(limit);

  const result = await db
    .prepare(
      `SELECT
         cd.id, cd.deposit_date, cd.amount, cd.reference, cd.note,
         cd.recorded_by, cd.created_at,
         cd.is_confirmed, cd.confirmed_at, cd.confirmed_by,
         rec.name AS recorded_by_name,
         cnf.name AS confirmed_by_name
       FROM live_cash_deposits cd
       LEFT JOIN workers rec ON rec.id = cd.recorded_by
       LEFT JOIN workers cnf ON cnf.id = cd.confirmed_by
       ${where}
       ORDER BY cd.deposit_date DESC, cd.id DESC
       LIMIT ?`,
    )
    .bind(...args)
    .all<CashDepositListItem>();
  return result.results ?? [];
}

// ============================================================================
// GET SINGLE
// ============================================================================
export async function getCashDeposit(
  db: DB,
  id: number,
): Promise<CashDepositRow | null> {
  return db
    .prepare(`SELECT * FROM live_cash_deposits WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<CashDepositRow>();
}

// ============================================================================
// INSERT
// ============================================================================
export interface InsertCashDepositInput {
  deposit_date: string;
  amount: number;
  reference?: string | null;
  note?: string | null;
  recorded_by: number;
  // When false (the default), the new deposit lands as a draft and stays
  // out of the reconciliation summary until somebody confirms it.
  auto_confirm?: boolean;
}

export async function insertCashDeposit(
  db: DB,
  input: InsertCashDepositInput,
): Promise<number> {
  const confirmed = input.auto_confirm ? 1 : 0;
  const result = await db
    .prepare(
      `INSERT INTO cash_deposits
         (deposit_date, amount, reference, note, recorded_by,
          is_confirmed, confirmed_at, confirmed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.deposit_date,
      input.amount,
      (input.reference ?? '').trim() || null,
      (input.note ?? '').trim() || null,
      input.recorded_by,
      confirmed,
      confirmed ? new Date().toISOString() : null,
      confirmed ? input.recorded_by : null,
    )
    .run();
  return Number(result.meta.last_row_id);
}

// Promote a draft deposit to confirmed. Returns true if the row was found
// and was still a draft; false otherwise (already confirmed or missing).
export async function confirmCashDeposit(
  db: DB,
  id: number,
  confirmedBy: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE cash_deposits
         SET is_confirmed = 1,
             confirmed_at = CURRENT_TIMESTAMP,
             confirmed_by = ?
       WHERE id = ? AND is_confirmed = 0 AND deleted_at IS NULL`,
    )
    .bind(confirmedBy, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// ============================================================================
// SOFT DELETE
// ============================================================================
export async function softDeleteCashDeposit(
  db: DB,
  id: number,
  deletedBy: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE cash_deposits
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(deletedBy, id)
    .run();
}

// ============================================================================
// AGGREGATES — used by the dashboard reconciliation card
// ============================================================================
export interface CashFlowSummary {
  collected: number;     // cash from bookings (done) + walkin cash
  deposited: number;     // cash actually banked (confirmed deposits only)
  on_hand: number;       // collected - deposited
  deposit_count: number; // confirmed deposits in the range
  draft_total: number;   // unconfirmed deposits sitting as drafts
  draft_count: number;
}

export async function getCashFlowSummary(
  db: DB,
  from: string,
  to: string,
): Promise<CashFlowSummary> {
  const [collectedRow, confirmedRow, draftRow] = await db.batch<{
    total?: number;
    count?: number;
  }>([
    // "Cash collected" = cash bookings (done) + cash walk-ins.
    // Matches the daily-form expected_cash definition (daily.ts): legacy
    // `done` bookings with NULL payment_method count as cash, so the
    // dashboard reconciliation stays aligned with the daily reconciliation.
    db
      .prepare(
        `SELECT
           COALESCE((
             SELECT SUM(price) FROM live_bookings
             WHERE date >= ? AND date <= ?
               AND status = 'done'
               AND (payment_method = 'cash' OR payment_method IS NULL)
           ), 0) +
           COALESCE((
             SELECT SUM(price) FROM live_walkin_transactions
             WHERE date >= ? AND date <= ?
               AND payment_method = 'cash'
           ), 0) AS total`,
      )
      .bind(from, to, from, to),
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
         FROM live_cash_deposits
         WHERE deposit_date >= ? AND deposit_date <= ?
           AND is_confirmed = 1`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
         FROM live_cash_deposits
         WHERE deposit_date >= ? AND deposit_date <= ?
           AND is_confirmed = 0`,
      )
      .bind(from, to),
  ]);

  const collected = collectedRow.results?.[0]?.total ?? 0;
  const deposited = confirmedRow.results?.[0]?.total ?? 0;
  const deposit_count = confirmedRow.results?.[0]?.count ?? 0;
  const draft_total = draftRow.results?.[0]?.total ?? 0;
  const draft_count = draftRow.results?.[0]?.count ?? 0;

  return {
    collected,
    deposited,
    on_hand: collected - deposited,
    deposit_count,
    draft_total,
    draft_count,
  };
}
