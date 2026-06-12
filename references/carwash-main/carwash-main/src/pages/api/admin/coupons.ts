// GET /api/admin/coupons?source=&customer_id=&limit=
//
// super_admin only via /api/admin RBAC. List + summary aggregate so the
// /admin/coupons page can render with one round-trip.

export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../../lib/db';
import {
  getCouponSummary,
  listCoupons,
  type CouponSource,
} from '../../../lib/db/coupons';
import { todayInTimezone } from '../../../lib/db/dashboard';

const QuerySchema = z.object({
  source: z.enum(['loyalty', 'promo', 'referral', 'manual']).optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const parsed = QuerySchema.safeParse({
    source: url.searchParams.get('source') ?? undefined,
    customer_id: url.searchParams.get('customer_id') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return json({ error: 'Invalid query', issues: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const today = todayInTimezone();
  const [items, summary] = await Promise.all([
    listCoupons(db, {
      source: parsed.data.source as CouponSource | undefined,
      customer_id: parsed.data.customer_id,
      limit: parsed.data.limit,
    }),
    getCouponSummary(db, today),
  ]);

  return json({ items, summary, today });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
