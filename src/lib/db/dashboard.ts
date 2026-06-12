// Dashboard aggregators. All reads via live_* views.
// One file, lots of small queries, run in a single db.batch where possible.

import type { DB } from './index';

// ============================================================================
// KPI BLOCK — today / this-week / this-month revenue + expenses + profit
// ============================================================================
export interface KpiBlock {
  today: {
    date: string;
    revenue: number; // pence (cash+card from done bookings + walkins)
    expense: number;
    profit: number;
    bookings: number;
    walkins: number;
  };
  week: {
    from: string;
    to: string;
    revenue: number;
    expense: number;
    profit: number;
  };
  month: {
    from: string;
    to: string;
    revenue: number;
    expense: number;
    profit: number;
  };
}

export async function getKpiBlock(
  db: DB,
  today: string,
  weekStart: string,
  monthStart: string,
  monthEnd: string,
): Promise<KpiBlock> {
  const stmts = [
    // today revenue (bookings done + walkins)
    db
      .prepare(
        `SELECT
           COALESCE((
             SELECT SUM(price) FROM live_bookings
             WHERE date = ? AND status = 'done'
           ), 0) +
           COALESCE((
             SELECT SUM(price) FROM live_walkin_transactions WHERE date = ?
           ), 0) AS revenue,
           (SELECT COUNT(*) FROM live_bookings
              WHERE date = ? AND status = 'done') AS bookings,
           (SELECT COUNT(*) FROM live_walkin_transactions WHERE date = ?) AS walkins`,
      )
      .bind(today, today, today, today),
    // today expense
    db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS expense FROM live_expenses WHERE date = ?`)
      .bind(today),
    // week revenue
    db
      .prepare(
        `SELECT
           COALESCE((
             SELECT SUM(price) FROM live_bookings
             WHERE date >= ? AND date <= ? AND status = 'done'
           ), 0) +
           COALESCE((
             SELECT SUM(price) FROM live_walkin_transactions
             WHERE date >= ? AND date <= ?
           ), 0) AS revenue`,
      )
      .bind(weekStart, today, weekStart, today),
    // week expense
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS expense FROM live_expenses WHERE date >= ? AND date <= ?`,
      )
      .bind(weekStart, today),
    // month revenue
    db
      .prepare(
        `SELECT
           COALESCE((
             SELECT SUM(price) FROM live_bookings
             WHERE date >= ? AND date <= ? AND status = 'done'
           ), 0) +
           COALESCE((
             SELECT SUM(price) FROM live_walkin_transactions
             WHERE date >= ? AND date <= ?
           ), 0) AS revenue`,
      )
      .bind(monthStart, monthEnd, monthStart, monthEnd),
    // month expense
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS expense FROM live_expenses WHERE date >= ? AND date <= ?`,
      )
      .bind(monthStart, monthEnd),
  ];

  const results = await db.batch<{
    revenue?: number;
    expense?: number;
    bookings?: number;
    walkins?: number;
  }>(stmts);

  const todayRev = results[0].results?.[0] ?? { revenue: 0, bookings: 0, walkins: 0 };
  const todayExp = results[1].results?.[0] ?? { expense: 0 };
  const weekRev = results[2].results?.[0] ?? { revenue: 0 };
  const weekExp = results[3].results?.[0] ?? { expense: 0 };
  const monthRev = results[4].results?.[0] ?? { revenue: 0 };
  const monthExp = results[5].results?.[0] ?? { expense: 0 };

  return {
    today: {
      date: today,
      revenue: todayRev.revenue ?? 0,
      expense: todayExp.expense ?? 0,
      profit: (todayRev.revenue ?? 0) - (todayExp.expense ?? 0),
      bookings: todayRev.bookings ?? 0,
      walkins: todayRev.walkins ?? 0,
    },
    week: {
      from: weekStart,
      to: today,
      revenue: weekRev.revenue ?? 0,
      expense: weekExp.expense ?? 0,
      profit: (weekRev.revenue ?? 0) - (weekExp.expense ?? 0),
    },
    month: {
      from: monthStart,
      to: monthEnd,
      revenue: monthRev.revenue ?? 0,
      expense: monthExp.expense ?? 0,
      profit: (monthRev.revenue ?? 0) - (monthExp.expense ?? 0),
    },
  };
}

// ============================================================================
// DAILY REVENUE + EXPENSE — per-day series for the bar chart
// ============================================================================
export interface DailySeriesRow {
  date: string;
  revenue: number;
  expense: number;
}

export async function getDailyRevenueExpense(
  db: DB,
  from: string,
  to: string,
): Promise<DailySeriesRow[]> {
  // Compose by date keys — left-side is revenue (bookings + walkins),
  // right-side is expenses; merged in JS.
  const [rev, exp] = await db.batch<{ date: string; total: number }>([
    db
      .prepare(
        `SELECT date, SUM(total) AS total FROM (
           SELECT date, SUM(price) AS total FROM live_bookings
             WHERE date >= ? AND date <= ? AND status = 'done'
             GROUP BY date
           UNION ALL
           SELECT date, SUM(price) AS total FROM live_walkin_transactions
             WHERE date >= ? AND date <= ?
             GROUP BY date
         )
         GROUP BY date
         ORDER BY date ASC`,
      )
      .bind(from, to, from, to),
    db
      .prepare(
        `SELECT date, SUM(amount) AS total FROM live_expenses
         WHERE date >= ? AND date <= ?
         GROUP BY date
         ORDER BY date ASC`,
      )
      .bind(from, to),
  ]);

  // Build a map keyed by date with whatever the DB returned…
  const map = new Map<string, DailySeriesRow>();
  for (const r of rev.results ?? []) {
    map.set(r.date, { date: r.date, revenue: r.total, expense: 0 });
  }
  for (const e of exp.results ?? []) {
    const existing = map.get(e.date);
    if (existing) existing.expense = e.total;
    else map.set(e.date, { date: e.date, revenue: 0, expense: e.total });
  }

  // …then pad in zero rows for every missing day in the requested range.
  // Without this the chart only shows the dates that had activity, which
  // looks like "the chart is stuck on April 29" when only one day has data.
  const filled: DailySeriesRow[] = [];
  for (let d = from; d <= to; d = shiftDateUtc(d, 1)) {
    filled.push(map.get(d) ?? { date: d, revenue: 0, expense: 0 });
  }
  return filled;
}

// ============================================================================
// EXPECTED VS ACTUAL — last N days, from live_daily_summary
// ============================================================================
export interface ExpectedVsActualRow {
  date: string;
  expected_cash: number | null;
  actual_cash: number | null;
  variance: number | null;
}

export async function getExpectedVsActual(
  db: DB,
  from: string,
  to: string,
): Promise<ExpectedVsActualRow[]> {
  const result = await db
    .prepare(
      `SELECT date, expected_cash, cash_total AS actual_cash, cash_variance AS variance
       FROM live_daily_summary
       WHERE date >= ? AND date <= ?
       ORDER BY date ASC`,
    )
    .bind(from, to)
    .all<ExpectedVsActualRow>();

  // Same padding logic as getDailyRevenueExpense — fill missing dates with
  // nulls so the chart shows the full window and Chart.js spanGaps connects
  // the points that exist.
  const map = new Map<string, ExpectedVsActualRow>();
  for (const r of result.results ?? []) {
    map.set(r.date, r);
  }
  const filled: ExpectedVsActualRow[] = [];
  for (let d = from; d <= to; d = shiftDateUtc(d, 1)) {
    filled.push(
      map.get(d) ?? { date: d, expected_cash: null, actual_cash: null, variance: null },
    );
  }
  return filled;
}

// ============================================================================
// RECENT DAMAGE — top 5 not-resolved
// ============================================================================
export interface RecentDamageRow {
  id: number;
  occurred_at: string;
  category: string;
  categories: string | null;
  description: string;
  resolution_status: string;
  reported_by_name: string;
  worker_responsible_name: string | null;
}

export async function getRecentDamage(
  db: DB,
  limit = 5,
): Promise<RecentDamageRow[]> {
  const result = await db
    .prepare(
      `SELECT d.id, d.occurred_at, d.category, d.categories, d.description, d.resolution_status,
              rb.name AS reported_by_name,
              wr.name AS worker_responsible_name
       FROM live_damage_reports d
       JOIN workers rb ON rb.id = d.reported_by
       LEFT JOIN workers wr ON wr.id = d.worker_responsible
       WHERE d.resolution_status NOT IN ('resolved', 'cancelled')
       ORDER BY d.occurred_at DESC, d.id DESC
       LIMIT ?`,
    )
    .bind(Math.min(Math.max(limit, 1), 50))
    .all<RecentDamageRow>();
  return result.results ?? [];
}

// ============================================================================
// DATE HELPERS
// ============================================================================
export function todayInTimezone(timezone = 'Europe/London'): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

export function shiftDateUtc(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Monday-as-week-start (UK convention) for the given date.
export function weekStartFor(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  // getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
