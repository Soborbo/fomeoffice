// DELETE /api/app/expenses/[id] — super_admin only, soft-delete with cascade
// to the linked staff_payments row when category='staff'.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { getExpense, softDeleteExpense } from '../../../../lib/db/expenses';
import { auditLog } from '../../../../lib/audit/log';

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  if (locals.user.role !== 'super_admin') {
    return json({ error: 'Super admin only' }, 403);
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'Invalid id' }, 400);
  }

  const db = getDb();
  const before = await getExpense(db, id);
  if (!before) return json({ error: 'Not found' }, 404);

  const result = await softDeleteExpense(db, id, locals.user.id);
  if (!result.ok) return json({ error: 'Not found' }, 404);

  await auditLog(db, {
    performedBy: locals.user.id,
    action: 'expense.delete',
    entityType: 'expense',
    entityId: id,
    before,
    notes: result.was_staff_payment
      ? `also soft-deleted staff_payment ${before.staff_payment_id}`
      : undefined,
    request,
  });

  if (result.was_staff_payment && before.staff_payment_id) {
    await auditLog(db, {
      performedBy: locals.user.id,
      action: 'staff_payment.delete',
      entityType: 'staff_payment',
      entityId: before.staff_payment_id,
      notes: `cascaded from expense ${id}`,
      request,
    });
  }

  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
