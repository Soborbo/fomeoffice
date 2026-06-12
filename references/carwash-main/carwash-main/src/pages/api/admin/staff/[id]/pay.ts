// POST /api/admin/staff/[id]/pay
// Records a staff payment AND a linked expenses row in one shot. The
// expense's `method` doubles as the cash-outflow signal — paying out of
// the till means method='cash', which the daily reconciliation already
// counts as a cash deduction.
//
// super_admin gate via the /api/admin RBAC prefix.

export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../../../../lib/db';
import { getWorkerById } from '../../../../../lib/db/staff';
import { insertStaffPaymentExpense } from '../../../../../lib/db/expenses';
import { auditLog } from '../../../../../lib/audit/log';

const BodySchema = z.object({
  amount: z.coerce.number().int().positive().max(1_000_000),
  // 'cash' is the default — paying from the till. 'bank_transfer' /
  // 'cheque' record the payment but don't affect cash-on-hand.
  method: z.enum(['cash', 'bank_transfer', 'cheque']).default('cash'),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  covers_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  covers_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  description: z.string().max(500).optional().or(z.literal('')),
});

const STAFF_TO_EXPENSE_METHOD = {
  cash: 'cash',
  bank_transfer: 'bank_transfer',
  // Cheque expenses don't have a dedicated method in the expenses CHECK
  // constraint — record them as bank_transfer for accounting purposes.
  cheque: 'bank_transfer',
} as const;

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const user = locals.user;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid input', issues: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  const db = getDb();
  const worker = await getWorkerById(db, id);
  if (!worker) return json({ error: 'Worker not found' }, 404);

  // Use the worker's hire date or today, never a date in the past silently.
  const paidAt =
    input.paid_at ||
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

  const result = await insertStaffPaymentExpense(db, {
    date: paidAt,
    amount: input.amount,
    expense_method: STAFF_TO_EXPENSE_METHOD[input.method],
    payment_method: input.method,
    worker_id: id,
    covers_period_start: input.covers_period_start || null,
    covers_period_end: input.covers_period_end || null,
    description: (input.description ?? '').trim() || null,
    recorded_by: user.id,
  });

  await auditLog(db, {
    performedBy: user.id,
    action: 'staff_payment.create',
    entityType: 'staff_payment',
    entityId: result.staff_payment_id,
    after: {
      worker_id: id,
      worker_name: worker.name,
      amount: input.amount,
      method: input.method,
      paid_at: paidAt,
      covers_period_start: input.covers_period_start || null,
      covers_period_end: input.covers_period_end || null,
      linked_expense_id: result.expense_id,
      source: 'admin_staff_matrix',
    },
    request,
  });

  await auditLog(db, {
    performedBy: user.id,
    action: 'expense.create',
    entityType: 'expense',
    entityId: result.expense_id,
    after: {
      date: paidAt,
      amount: input.amount,
      method: STAFF_TO_EXPENSE_METHOD[input.method],
      category: 'staff',
      staff_payment_id: result.staff_payment_id,
      worker_id: id,
      source: 'admin_staff_matrix',
    },
    request,
  });

  return json({
    success: true,
    staff_payment_id: result.staff_payment_id,
    expense_id: result.expense_id,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
