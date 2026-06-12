// Walk-in transaction helpers. Reads must go through live_walkin_transactions.

import type { DB } from './index';

export type CarSize = 'small' | 'large' | 'suv' | 'camper' | 'sports';
export type WalkinServiceType = 'inside_only' | 'outside_only' | 'inside_and_outside';
export type WalkinPaymentMethod = 'cash' | 'card';

export interface InsertWalkinInput {
  date: string;                // ISO YYYY-MM-DD
  carSize: CarSize;
  serviceType: WalkinServiceType;
  pricePence: number;
  paymentMethod: WalkinPaymentMethod;
  customerEmail?: string | null;
  customerId?: number | null;
  marketingOptIn?: boolean;
  recordedBy?: number | null;
  bayId?: number | null;
}

export async function insertWalkin(db: DB, input: InsertWalkinInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO walkin_transactions
        (date, car_size, service_type, price, payment_method,
         customer_email, customer_id, marketing_opt_in,
         recorded_by, bay_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.date,
      input.carSize,
      input.serviceType,
      input.pricePence,
      input.paymentMethod,
      input.customerEmail ? input.customerEmail.toLowerCase() : null,
      input.customerId ?? null,
      input.marketingOptIn ? 1 : 0,
      input.recordedBy ?? null,
      input.bayId ?? null,
    )
    .run();

  return Number(result.meta.last_row_id);
}

export interface TodayWalkinsSummary {
  count: number;
  cash_total: number;          // pence
  card_total: number;          // pence
}

export async function getTodayWalkinsSummary(db: DB, today: string): Promise<TodayWalkinsSummary> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN price ELSE 0 END), 0) AS cash_total,
         COALESCE(SUM(CASE WHEN payment_method = 'card' THEN price ELSE 0 END), 0) AS card_total
       FROM live_walkin_transactions
       WHERE date = ?`,
    )
    .bind(today)
    .first<TodayWalkinsSummary>();

  return row ?? { count: 0, cash_total: 0, card_total: 0 };
}

export interface RecentWalkin {
  id: number;
  created_at: string;
  car_size: CarSize;
  service_type: WalkinServiceType;
  price: number;
  payment_method: WalkinPaymentMethod;
  customer_email: string | null;
}

export async function listTodayWalkins(db: DB, today: string, limit = 50): Promise<RecentWalkin[]> {
  const result = await db
    .prepare(
      `SELECT id, created_at, car_size, service_type, price, payment_method, customer_email
       FROM live_walkin_transactions
       WHERE date = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(today, limit)
    .all<RecentWalkin>();
  return result.results ?? [];
}

// ---------------------------------------------------------------------------
// Walk-in log — the worker-entry audit surface shown on the board's "Walk-in
// Log" menu. Every row carries who entered it (recorded_by -> worker name),
// when (created_at) and the full transaction detail, and the query is
// filterable by date range, recorder and payment method.
// ---------------------------------------------------------------------------

export interface WalkinLogFilters {
  from?: string | null;          // YYYY-MM-DD inclusive (matches `date`)
  to?: string | null;            // YYYY-MM-DD inclusive (matches `date`)
  recordedBy?: number | null;
  paymentMethod?: WalkinPaymentMethod | null;
  limit?: number;
}

export interface WalkinLogRow {
  id: number;
  date: string;
  created_at: string;
  car_size: CarSize;
  service_type: WalkinServiceType;
  price: number;
  payment_method: WalkinPaymentMethod;
  customer_email: string | null;
  marketing_opt_in: number;
  recorded_by: number | null;
  recorded_by_name: string | null;
}

export async function listWalkinLog(
  db: DB,
  filters: WalkinLogFilters = {},
): Promise<WalkinLogRow[]> {
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (filters.from) {
    conditions.push('w.date >= ?');
    binds.push(filters.from);
  }
  if (filters.to) {
    conditions.push('w.date <= ?');
    binds.push(filters.to);
  }
  if (typeof filters.recordedBy === 'number') {
    conditions.push('w.recorded_by = ?');
    binds.push(filters.recordedBy);
  }
  if (filters.paymentMethod) {
    conditions.push('w.payment_method = ?');
    binds.push(filters.paymentMethod);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // Join the base workers table (not live_workers) so a recorder who has since
  // been removed still resolves to their name in the historical log.
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  binds.push(limit);

  const result = await db
    .prepare(
      `SELECT w.id, w.date, w.created_at, w.car_size, w.service_type, w.price,
              w.payment_method, w.customer_email, w.marketing_opt_in,
              w.recorded_by, wk.name AS recorded_by_name
       FROM live_walkin_transactions w
       LEFT JOIN workers wk ON wk.id = w.recorded_by
       ${where}
       ORDER BY w.created_at DESC
       LIMIT ?`,
    )
    .bind(...binds)
    .all<WalkinLogRow>();

  return result.results ?? [];
}

// Distinct set of workers who have ever recorded a walk-in. Powers the
// "recorded by" filter dropdown independently of the active filters.
export async function listWalkinRecorders(
  db: DB,
): Promise<{ id: number; name: string }[]> {
  const result = await db
    .prepare(
      `SELECT DISTINCT wk.id AS id, wk.name AS name
       FROM live_walkin_transactions w
       JOIN workers wk ON wk.id = w.recorded_by
       WHERE w.recorded_by IS NOT NULL
       ORDER BY wk.name ASC`,
    )
    .all<{ id: number; name: string }>();
  return result.results ?? [];
}

// Find or create a customer record from a walk-in email capture.
// Differs slightly from the booking flow — for walk-ins we don't have a name,
// so the customer.name defaults to the local-part of the email.
export async function findOrCreateCustomerByEmailMinimal(
  db: DB,
  email: string,
  marketingOptIn: boolean,
): Promise<number> {
  const lc = email.toLowerCase();
  const existing = await db
    .prepare(`SELECT id FROM live_customers WHERE email = ? LIMIT 1`)
    .bind(lc)
    .first<{ id: number }>();

  if (existing) {
    if (marketingOptIn) {
      await db
        .prepare(
          `UPDATE customers
           SET marketing_consent = 1,
               marketing_consent_at = COALESCE(marketing_consent_at, datetime('now'))
           WHERE id = ?`,
        )
        .bind(existing.id)
        .run();
    }
    return existing.id;
  }

  // INSERT OR IGNORE + re-select so a concurrent walkin/booking for the same
  // brand-new email doesn't throw on the customers(email) unique index.
  const namePlaceholder = lc.split('@')[0] ?? lc;
  await db
    .prepare(
      `INSERT OR IGNORE INTO customers (name, email, marketing_consent, marketing_consent_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(
      namePlaceholder,
      lc,
      marketingOptIn ? 1 : 0,
      marketingOptIn ? new Date().toISOString() : null,
    )
    .run();

  const row = await db
    .prepare(`SELECT id FROM live_customers WHERE email = ? LIMIT 1`)
    .bind(lc)
    .first<{ id: number }>();
  if (!row) throw new Error('Failed to find or insert customer for ' + lc);
  return row.id;
}

export function todayInTimezone(timezone = 'Europe/London'): string {
  // YYYY-MM-DD in the target timezone (UK ops timezone)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}
