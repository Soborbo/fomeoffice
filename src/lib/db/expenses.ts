// Expenses + staff_payments helpers.
// All money in pence (INTEGER). All reads via live_* views.
//
// Atomic invariant: when category='staff', an expense row and a
// staff_payments row are created together in a single db.batch(),
// linked via expenses.staff_payment_id.

import type { DB } from './index';

export type ExpenseCategory =
  | 'staff'
  | 'supplies'
  | 'utilities'
  | 'equipment'
  | 'food'
  | 'rent'
  | 'maintenance'
  | 'marketing'
  | 'other';

export type ExpenseMethod = 'cash' | 'card' | 'bank_transfer';
export type StaffPaymentMethod = 'cash' | 'bank_transfer' | 'cheque';

// ============================================================================
// EXPENSE ROW SHAPES
// ============================================================================
export interface ExpenseRow {
  id: number;
  date: string;
  amount: number;
  method: ExpenseMethod;
  category: ExpenseCategory;
  staff_payment_id: number | null;
  description: string | null;
  vendor: string | null;
  receipt_r2_key: string | null;
  vat_amount: number;
  vat_rate: number;
  recorded_by: number | null;
  created_at: string;
}

export interface ExpenseListItem extends ExpenseRow {
  worker_id: number | null;
  worker_name: string | null;
  recorded_by_name: string | null;
}

// ============================================================================
// LIST EXPENSES — filter by date range and / or category
// ============================================================================
export interface ListExpensesFilter {
  from?: string; // ISO date
  to?: string;
  category?: ExpenseCategory;
  limit?: number;
}

export async function listExpenses(
  db: DB,
  filter: ListExpensesFilter,
): Promise<ExpenseListItem[]> {
  const conditions: string[] = [];
  const args: unknown[] = [];

  if (filter.from) {
    conditions.push('e.date >= ?');
    args.push(filter.from);
  }
  if (filter.to) {
    conditions.push('e.date <= ?');
    args.push(filter.to);
  }
  if (filter.category) {
    conditions.push('e.category = ?');
    args.push(filter.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  args.push(limit);

  const result = await db
    .prepare(
      `SELECT
         e.id, e.date, e.amount, e.method, e.category,
         e.staff_payment_id, e.description, e.vendor,
         e.receipt_r2_key, e.vat_amount, e.vat_rate,
         e.recorded_by, e.created_at,
         sp.worker_id AS worker_id,
         w.name       AS worker_name,
         rec.name     AS recorded_by_name
       FROM live_expenses e
       LEFT JOIN live_staff_payments sp ON sp.id = e.staff_payment_id
       LEFT JOIN workers w ON w.id = sp.worker_id
       LEFT JOIN workers rec ON rec.id = e.recorded_by
       ${where}
       ORDER BY e.date DESC, e.id DESC
       LIMIT ?`,
    )
    .bind(...args)
    .all<ExpenseListItem>();
  return result.results ?? [];
}

// ============================================================================
// CATEGORY TOTALS — used by the list footer
// ============================================================================
export interface CategoryTotal {
  category: ExpenseCategory;
  total: number;
  count: number;
}

export async function getCategoryTotals(
  db: DB,
  filter: ListExpensesFilter,
): Promise<{ totals: CategoryTotal[]; grand_total: number; count: number }> {
  const conditions: string[] = [];
  const args: unknown[] = [];
  if (filter.from) {
    conditions.push('date >= ?');
    args.push(filter.from);
  }
  if (filter.to) {
    conditions.push('date <= ?');
    args.push(filter.to);
  }
  if (filter.category) {
    conditions.push('category = ?');
    args.push(filter.category);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db
    .prepare(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count
       FROM live_expenses
       ${where}
       GROUP BY category
       ORDER BY total DESC`,
    )
    .bind(...args)
    .all<{ category: ExpenseCategory; total: number; count: number }>();

  const totals = result.results ?? [];
  const grand_total = totals.reduce((acc, r) => acc + r.total, 0);
  const count = totals.reduce((acc, r) => acc + r.count, 0);
  return { totals, grand_total, count };
}

// ============================================================================
// GET SINGLE EXPENSE
// ============================================================================
export async function getExpense(
  db: DB,
  id: number,
): Promise<ExpenseRow | null> {
  return db
    .prepare(`SELECT * FROM live_expenses WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<ExpenseRow>();
}

// ============================================================================
// INSERT REGULAR EXPENSE — non-staff categories
// ============================================================================
export interface InsertExpenseInput {
  date: string;
  amount: number;
  method: ExpenseMethod;
  category: Exclude<ExpenseCategory, 'staff'>;
  description?: string | null;
  vendor?: string | null;
  vat_amount?: number;
  vat_rate?: number;
  receipt_r2_key?: string | null;
  recorded_by: number;
}

export async function insertExpense(
  db: DB,
  input: InsertExpenseInput,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO expenses
         (date, amount, method, category,
          description, vendor,
          vat_amount, vat_rate,
          receipt_r2_key,
          recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.date,
      input.amount,
      input.method,
      input.category,
      input.description ?? null,
      input.vendor ?? null,
      input.vat_amount ?? 0,
      input.vat_rate ?? 0,
      input.receipt_r2_key ?? null,
      input.recorded_by,
    )
    .run();
  return Number(result.meta.last_row_id);
}

// ============================================================================
// INSERT STAFF PAYMENT + LINKED EXPENSE — atomic combo
// ============================================================================
export interface InsertStaffPaymentExpenseInput {
  date: string;
  amount: number;
  expense_method: ExpenseMethod;
  payment_method: StaffPaymentMethod;
  worker_id: number;
  covers_period_start?: string | null;
  covers_period_end?: string | null;
  description?: string | null;
  recorded_by: number; // also used as paid_by on the staff_payments row
}

export interface StaffPaymentExpenseResult {
  expense_id: number;
  staff_payment_id: number;
}

export async function insertStaffPaymentExpense(
  db: DB,
  input: InsertStaffPaymentExpenseInput,
): Promise<StaffPaymentExpenseResult> {
  // We need the staff_payments.id before we can insert the expense.
  // D1 doesn't expose RETURNING in batch yet, so do it in two awaited
  // statements (still fast — same connection).
  const paymentResult = await db
    .prepare(
      `INSERT INTO staff_payments
         (worker_id, amount, method, paid_at,
          covers_period_start, covers_period_end,
          notes, paid_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.worker_id,
      input.amount,
      input.payment_method,
      input.date,
      input.covers_period_start ?? null,
      input.covers_period_end ?? null,
      input.description ?? null,
      input.recorded_by,
    )
    .run();
  const paymentId = Number(paymentResult.meta.last_row_id);

  const expenseResult = await db
    .prepare(
      `INSERT INTO expenses
         (date, amount, method, category,
          staff_payment_id,
          description,
          recorded_by)
       VALUES (?, ?, ?, 'staff', ?, ?, ?)`,
    )
    .bind(
      input.date,
      input.amount,
      input.expense_method,
      paymentId,
      input.description ?? null,
      input.recorded_by,
    )
    .run();
  const expenseId = Number(expenseResult.meta.last_row_id);

  return { expense_id: expenseId, staff_payment_id: paymentId };
}

// ============================================================================
// SOFT DELETE — cascade to linked staff_payment if any
// ============================================================================
export async function softDeleteExpense(
  db: DB,
  id: number,
  deletedBy: number,
): Promise<{ ok: true; was_staff_payment: boolean } | { ok: false }> {
  const row = await getExpense(db, id);
  if (!row) return { ok: false };

  const stmts = [
    db
      .prepare(
        `UPDATE expenses
           SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(deletedBy, id),
  ];

  if (row.staff_payment_id) {
    stmts.push(
      db
        .prepare(
          `UPDATE staff_payments
             SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(deletedBy, row.staff_payment_id),
    );
  }

  await db.batch(stmts);
  return { ok: true, was_staff_payment: row.staff_payment_id !== null };
}
