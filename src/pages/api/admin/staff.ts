// GET  /api/admin/staff — list of active workers + monthly aggregates.
// POST /api/admin/staff — create a new worker (super_admin only via the
// /api/admin RBAC gate).

export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../../lib/db';
import {
  currentMonth,
  insertWorker,
  listWorkersWithMonthlyAggregates,
  monthBounds,
} from '../../../lib/db/staff';
import { hashSecret } from '../../../lib/auth/password';
import { auditLog } from '../../../lib/audit/log';

const MONTH_RE = /^\d{4}-\d{2}$/;

const CreateWorkerSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.enum(['worker', 'admin', 'super_admin']).default('worker'),
  email: z.string().email().max(254).optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  // Pence values; the UI form accepts pounds and converts before submitting.
  full_day_pay: z.coerce.number().int().nonnegative().max(1_000_000).default(10_000),
  half_day_pay: z.coerce.number().int().nonnegative().max(1_000_000).default(5_000),
  hired_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  pin: z.string().regex(/^\d{4,8}$/).optional().or(z.literal('')),
});

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const monthParam = url.searchParams.get('month');
  const month =
    monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonth();
  const { start, end } = monthBounds(month);

  const db = getDb();
  const workers = await listWorkersWithMonthlyAggregates(db, start, end);

  return json({
    month,
    month_start: start,
    month_end: end,
    workers,
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const user = locals.user;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = CreateWorkerSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid input', issues: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  const db = getDb();
  let pin_hash: string | null = null;
  let pin_salt: string | null = null;
  if (input.pin) {
    const hashed = await hashSecret(input.pin);
    pin_hash = hashed.hash;
    pin_salt = hashed.salt;
  }

  let id: number;
  try {
    id = await insertWorker(db, {
      name: input.name.trim(),
      role: input.role,
      email: (input.email || '').trim().toLowerCase() || null,
      phone: (input.phone || '').trim() || null,
      full_day_pay: input.full_day_pay,
      half_day_pay: input.half_day_pay,
      hired_at: input.hired_at || null,
      pin_hash,
      pin_salt,
    });
  } catch (err) {
    // Most likely a unique-email collision. Surface it clearly.
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|constraint/i.test(msg)) {
      return json({ error: 'Email is already used by another worker' }, 409);
    }
    throw err;
  }

  await auditLog(db, {
    performedBy: user.id,
    action: 'staff.create',
    entityType: 'worker',
    entityId: id,
    after: {
      name: input.name,
      role: input.role,
      email: input.email || null,
      phone: input.phone || null,
      full_day_pay: input.full_day_pay,
      half_day_pay: input.half_day_pay,
      hired_at: input.hired_at || null,
      pin_set: !!input.pin,
    },
    request,
  });

  return json({ success: true, id });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
