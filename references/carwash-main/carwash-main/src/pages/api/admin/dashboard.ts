// GET /api/admin/dashboard — single-call aggregate for the /admin landing page.
// super_admin only via /api/admin RBAC.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import {
  getDailyRevenueExpense,
  getExpectedVsActual,
  getKpiBlock,
  getRecentDamage,
  shiftDateUtc,
  todayInTimezone,
  weekStartFor,
} from '../../../lib/db/dashboard';
import {
  currentMonth,
  listWorkersWithMonthlyAggregates,
  monthBounds,
} from '../../../lib/db/staff';
import { getCashFlowSummary } from '../../../lib/db/cash-deposits';

const MONTH_RE = /^\d{4}-\d{2}$/;

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const monthParam = url.searchParams.get('month');
  const month =
    monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonth();
  const { start: monthStart, end: monthEnd } = monthBounds(month);

  const today = todayInTimezone();
  const weekStart = weekStartFor(today);
  const series30From = shiftDateUtc(today, -29);
  const expectedFrom = shiftDateUtc(today, -13);

  const db = getDb();

  const [kpis, daily, expected, staff, damage, cashFlow] = await Promise.all([
    getKpiBlock(db, today, weekStart, monthStart, monthEnd),
    getDailyRevenueExpense(db, series30From, today),
    getExpectedVsActual(db, expectedFrom, today),
    listWorkersWithMonthlyAggregates(db, monthStart, monthEnd),
    getRecentDamage(db, 5),
    getCashFlowSummary(db, monthStart, monthEnd),
  ]);

  return json({
    today,
    week_start: weekStart,
    month,
    month_start: monthStart,
    month_end: monthEnd,
    kpis,
    daily_series: daily,
    expected_vs_actual: expected,
    staff,
    recent_damage: damage,
    cash_flow: cashFlow,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
