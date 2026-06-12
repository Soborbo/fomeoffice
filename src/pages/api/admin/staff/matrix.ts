// GET /api/admin/staff/matrix?from=&to=
//
// Returns the attendance matrix for super_admins: who worked which days in
// the requested range, plus per-worker earned-in-range / paid-in-range /
// owed-lifetime totals. Used by /admin/staff/matrix.

export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../../../lib/db';
import { getAttendanceMatrix } from '../../../../lib/db/staff';

const QuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((q) => q.from <= q.to, { message: '`from` must be on or before `to`' });

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const parsed = QuerySchema.safeParse({
    from: url.searchParams.get('from') ?? '',
    to: url.searchParams.get('to') ?? '',
  });
  if (!parsed.success) {
    return json({ error: 'Invalid query', issues: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const rows = await getAttendanceMatrix(db, parsed.data.from, parsed.data.to);

  // Build the list of dates in the range — pre-computed so the UI can render
  // a stable column header even when nobody worked on a given day.
  const days: string[] = [];
  for (let d = parsed.data.from; d <= parsed.data.to; d = shiftDate(d, 1)) {
    days.push(d);
  }

  return json({
    from: parsed.data.from,
    to: parsed.data.to,
    days,
    workers: rows,
  });
};

function shiftDate(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
