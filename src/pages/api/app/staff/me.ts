// GET /api/app/staff/me
//
// Returns the SIGNED-IN worker's own profile + monthly summary + recent
// attendance + recent payments. Mirrors /api/admin/staff/[id] but limited
// to the caller's own row — works for any role (worker / admin / super_admin)
// behind the standard /api/app session gate.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import {
  currentMonth,
  getWorkerById,
  getWorkerMonthlySummary,
  listAttendanceForWorker,
  listPaymentsForWorker,
  monthBounds,
} from '../../../../lib/db/staff';

const MONTH_RE = /^\d{4}-\d{2}$/;

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const meId = locals.user.id;

  const monthParam = url.searchParams.get('month');
  const month =
    monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonth();
  const { start, end } = monthBounds(month);

  const db = getDb();
  const worker = await getWorkerById(db, meId);
  if (!worker) return json({ error: 'Not found' }, 404);

  const [summary, attendance, payments] = await Promise.all([
    getWorkerMonthlySummary(db, meId, start, end),
    listAttendanceForWorker(db, meId, 60),
    listPaymentsForWorker(db, meId, 60),
  ]);

  return json({
    worker,
    month,
    summary,
    attendance,
    payments,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
