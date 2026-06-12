// DELETE /api/app/cash-deposits/[id] — super_admin only (soft delete)
// PATCH  /api/app/cash-deposits/[id] — admin+ confirm a draft deposit

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import {
  confirmCashDeposit,
  getCashDeposit,
  softDeleteCashDeposit,
} from '../../../../lib/db/cash-deposits';
import { auditLog } from '../../../../lib/audit/log';

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  if (locals.user.role !== 'super_admin') {
    return json({ error: 'Forbidden — super_admin only' }, 403);
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  const db = getDb();
  const existing = await getCashDeposit(db, id);
  if (!existing) return json({ error: 'Not found' }, 404);

  await softDeleteCashDeposit(db, id, locals.user.id);

  await auditLog(db, {
    performedBy: locals.user.id,
    action: 'cash_deposit.delete',
    entityType: 'cash_deposit',
    entityId: id,
    before: existing,
    request,
  });

  return json({ success: true });
};

// PATCH body: { action: 'confirm' }. Currently the only PATCH operation —
// admins flip a draft deposit to confirmed so it counts in the cash
// reconciliation summary.
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  let body: { action?: string } = {};
  try {
    body = await request.clone().json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  if (body.action !== 'confirm') {
    return json({ error: 'Unsupported action' }, 400);
  }

  const db = getDb();
  const existing = await getCashDeposit(db, id);
  if (!existing) return json({ error: 'Not found' }, 404);
  if (existing.is_confirmed === 1) {
    return json({ error: 'Already confirmed' }, 409);
  }

  const ok = await confirmCashDeposit(db, id, locals.user.id);
  if (!ok) {
    // Race with another admin or already-deleted row.
    return json({ error: 'Could not confirm' }, 409);
  }

  await auditLog(db, {
    performedBy: locals.user.id,
    action: 'cash_deposit.confirm',
    entityType: 'cash_deposit',
    entityId: id,
    after: { amount: existing.amount, deposit_date: existing.deposit_date },
    request,
  });

  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
