// GET /api/app/bookings?from=&to=&status=&search=&limit=
// Lists every booking — pending, in_progress, done, no_show, cancelled —
// so admins can see incoming website orders before the /board team marks
// them done. Session auth via /api/app prefix RBAC.

export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../../lib/db';
import { listBookingsForCrm } from '../../../lib/db/bookings';

const STATUS_VALUES = ['pending', 'in_progress', 'done', 'no_show', 'cancelled'] as const;

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  search: z.string().max(80).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const parsed = QuerySchema.safeParse({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return json({ error: 'Invalid query', issues: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const items = await listBookingsForCrm(db, parsed.data);

  // Lightweight aggregates the UI can render without a second round-trip.
  let revenuePence = 0;
  const statusCounts: Record<string, number> = {};
  for (const r of items) {
    if (r.status === 'done') revenuePence += r.price;
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }

  return json({
    items,
    summary: {
      count: items.length,
      revenue_pence: revenuePence,
      status_counts: statusCounts,
    },
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
