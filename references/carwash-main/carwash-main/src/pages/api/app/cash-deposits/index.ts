// Cash deposits API.
//   GET  /api/app/cash-deposits?from=&to=&limit=
//   POST /api/app/cash-deposits
//
// admin+ via /api/app RBAC. Soft-delete on the [id] route is super_admin only.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import {
  getCashFlowSummary,
  insertCashDeposit,
  listCashDeposits,
} from '../../../../lib/db/cash-deposits';
import { auditLog } from '../../../../lib/audit/log';
import {
  CreateCashDepositSchema,
  ListCashDepositsQuerySchema,
} from '../../../../lib/validation/cash-deposits';

// ----------------------------------------------------------------------------
// GET — list + cash-flow summary for the same range
// ----------------------------------------------------------------------------
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const parsed = ListCashDepositsQuerySchema.safeParse({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return json({ error: 'Invalid query', issues: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const items = await listCashDeposits(db, parsed.data);

  // The summary needs an explicit range — when the caller didn't pass one we
  // pick the widest sensible window so the totals reflect the visible list.
  const from = parsed.data.from ?? '0001-01-01';
  const to = parsed.data.to ?? '9999-12-31';
  const summary = await getCashFlowSummary(db, from, to);

  return json({ items, summary });
};

// ----------------------------------------------------------------------------
// POST — create
// ----------------------------------------------------------------------------
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const user = locals.user;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = CreateCashDepositSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid input', issues: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const id = await insertCashDeposit(db, {
    deposit_date: parsed.data.deposit_date,
    amount: parsed.data.amount,
    reference: parsed.data.reference || null,
    note: parsed.data.note || null,
    recorded_by: user.id,
  });

  await auditLog(db, {
    performedBy: user.id,
    action: 'cash_deposit.create',
    entityType: 'cash_deposit',
    entityId: id,
    after: {
      deposit_date: parsed.data.deposit_date,
      amount: parsed.data.amount,
      reference: parsed.data.reference || null,
    },
    request,
  });

  return json({ success: true, cash_deposit_id: id });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
