// GET /api/admin/staff/[id] — full profile + monthly summary + recent
// attendance + recent payments.

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

export const GET: APIRoute = async ({ params, url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'Invalid id' }, 400);
  }

  const monthParam = url.searchParams.get('month');
  const month =
    monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonth();
  const { start, end } = monthBounds(month);

  const db = getDb();
  const worker = await getWorkerById(db, id);
  if (!worker) return json({ error: 'Not found' }, 404);

  const [summary, attendance, payments] = await Promise.all([
    getWorkerMonthlySummary(db, id, start, end),
    listAttendanceForWorker(db, id, 60),
    listPaymentsForWorker(db, id, 60),
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
