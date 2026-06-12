// Daily reconciliation helpers. All reads via live_* views.
//
// Phase 2 — Daily form + variance banner.
// Money: INTEGER pence. Variance is stored as a VIRTUAL generated column on
// the underlying table; SELECTs against live_daily_summary expose it directly.

import type { DB } from './index';

// ============================================================================
// EXPECTED TOTALS — sum of paid bookings + walk-ins for the date
// ============================================================================
export interface ExpectedTotals {
  expected_cash: number;
  expected_card: number;
  bookings_done: number;
  walkins_count: number;
}

export async function computeExpectedTotals(
  db: DB,
  date: string,
): Promise<ExpectedTotals> {
  // Bookings: every `done` row counts toward expected revenue. Pending /
  // in_progress / cancelled / no_show are excluded. Cards are bucketed by
  // payment_method; legacy `done` rows from before the board captured a
  // payment method (NULL) fall back to cash, the safer default for a
  // mostly-cash forecourt.
  // Walk-ins: every live row counts (they're cash-on-the-spot transactions).
  const [bookings, walkins] = await db.batch<{
    cash_total: number;
    card_total: number;
    n: number;
  }>([
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN payment_method = 'card' THEN 0 ELSE price END), 0) AS cash_total,
           COALESCE(SUM(CASE WHEN payment_method = 'card' THEN price ELSE 0 END), 0) AS card_total,
           COUNT(*) AS n
         FROM live_bookings
         WHERE date = ? AND status = 'done'`,
      )
      .bind(date),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN price ELSE 0 END), 0) AS cash_total,
           COALESCE(SUM(CASE WHEN payment_method = 'card' THEN price ELSE 0 END), 0) AS card_total,
           COUNT(*) AS n
         FROM live_walkin_transactions
         WHERE date = ?`,
      )
      .bind(date),
  ]);

  const b = bookings.results?.[0] ?? { cash_total: 0, card_total: 0, n: 0 };
  const w = walkins.results?.[0] ?? { cash_total: 0, card_total: 0, n: 0 };

  return {
    expected_cash: b.cash_total + w.cash_total,
    expected_card: b.card_total + w.card_total,
    bookings_done: b.n,
    walkins_count: w.n,
  };
}

// ============================================================================
// DAILY SUMMARY ROW
// ============================================================================
export interface DailySummaryRow {
  id: number;
  date: string;
  cash_total: number;
  card_total: number;
  cars_inside: number;
  cars_outside: number;
  expected_cash: number | null;
  expected_card: number | null;
  cash_variance: number | null;
  card_variance: number | null;
  notes: string | null;
  filled_by: number | null;
  filled_at: string;
  is_locked: number;
  locked_at: string | null;
  locked_by: number | null;
}

export async function getDailySummary(
  db: DB,
  date: string,
): Promise<DailySummaryRow | null> {
  return db
    .prepare(`SELECT * FROM live_daily_summary WHERE date = ? LIMIT 1`)
    .bind(date)
    .first<DailySummaryRow>();
}

// ============================================================================
// UPSERT — insert or update the daily summary for a given date.
// Refuses to write if the row exists and is_locked=1.
// Always re-snapshots expected_cash / expected_card from current D1 state.
// ============================================================================
export interface UpsertDailySummaryInput {
  date: string;
  cash_total: number;
  card_total: number;
  cars_inside: number;
  cars_outside: number;
  expected_cash: number;
  expected_card: number;
  notes: string | null;
  filled_by: number;
}

export type UpsertResult =
  | { ok: true; row: DailySummaryRow; wasUpdate: boolean }
  | { ok: false; reason: 'locked' };

export async function upsertDailySummary(
  db: DB,
  input: UpsertDailySummaryInput,
): Promise<UpsertResult> {
  const existing = await getDailySummary(db, input.date);

  if (existing && existing.is_locked === 1) {
    return { ok: false, reason: 'locked' };
  }

  if (existing) {
    await db
      .prepare(
        `UPDATE daily_summary
           SET cash_total = ?, card_total = ?,
               cars_inside = ?, cars_outside = ?,
               expected_cash = ?, expected_card = ?,
               notes = ?,
               filled_by = ?, filled_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        input.cash_total,
        input.card_total,
        input.cars_inside,
        input.cars_outside,
        input.expected_cash,
        input.expected_card,
        input.notes,
        input.filled_by,
        existing.id,
      )
      .run();
    const row = await getDailySummary(db, input.date);
    return { ok: true, row: row!, wasUpdate: true };
  }

  await db
    .prepare(
      `INSERT INTO daily_summary
         (date, cash_total, card_total,
          cars_inside, cars_outside,
          expected_cash, expected_card,
          notes, filled_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.date,
      input.cash_total,
      input.card_total,
      input.cars_inside,
      input.cars_outside,
      input.expected_cash,
      input.expected_card,
      input.notes,
      input.filled_by,
    )
    .run();

  const row = await getDailySummary(db, input.date);
  return { ok: true, row: row!, wasUpdate: false };
}

// ============================================================================
// RECENT SUMMARIES — for the variance banner week-view
// ============================================================================
export interface RecentSummaryRow {
  date: string;
  cash_total: number;
  card_total: number;
  expected_cash: number | null;
  expected_card: number | null;
  cash_variance: number | null;
  card_variance: number | null;
  is_locked: number;
}

export async function getRecentSummaries(
  db: DB,
  todayDate: string,
  days: number,
): Promise<RecentSummaryRow[]> {
  // Use a date-range filter: [today-(days-1), today]
  const startDate = shiftDateUtc(todayDate, -(days - 1));
  const result = await db
    .prepare(
      `SELECT date, cash_total, card_total,
              expected_cash, expected_card,
              cash_variance, card_variance, is_locked
       FROM live_daily_summary
       WHERE date >= ? AND date <= ?
       ORDER BY date ASC`,
    )
    .bind(startDate, todayDate)
    .all<RecentSummaryRow>();
  return result.results ?? [];
}

// ============================================================================
// PATTERN DETECTION — N consecutive short days (negative cash_variance) of
// at least `thresholdPence` pence shortfall.
// Used by the banner to flag a recurring shortage to super_admin.
// ============================================================================
export interface PatternResult {
  triggered: boolean;
  consecutiveShortDays: number;
  totalShortfall: number; // sum of |cash_variance| over the run, pence
}

export function detectShortPattern(
  rows: RecentSummaryRow[],
  thresholdDays: number,
  thresholdPence: number,
): PatternResult {
  // Walk the most recent rows backwards. A "short day" has cash_variance
  // <= -thresholdPence (e.g. -£5 = -500 pence).
  // Stop counting at the first non-short day.
  let consecutive = 0;
  let totalShortfall = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i]?.cash_variance;
    if (v !== null && v !== undefined && v <= -thresholdPence) {
      consecutive++;
      totalShortfall += Math.abs(v);
    } else {
      break;
    }
  }
  return {
    triggered: consecutive >= thresholdDays,
    consecutiveShortDays: consecutive,
    totalShortfall,
  };
}

// ============================================================================
// SETTINGS LOOKUP — small helper, just for daily-form related keys
// ============================================================================
export async function getSettingsBatch(
  db: DB,
  keys: string[],
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const placeholders = keys.map(() => '?').join(',');
  const result = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .bind(...keys)
    .all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const row of result.results ?? []) out[row.key] = row.value;
  return out;
}

// ============================================================================
// DATE HELPERS — pure UTC arithmetic on YYYY-MM-DD strings
// ============================================================================
function shiftDateUtc(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
