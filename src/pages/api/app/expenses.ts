// Expenses API.
//   GET /api/app/expenses?from=&to=&category=&limit=
//   POST /api/app/expenses

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import {
  getCategoryTotals,
  insertExpense,
  insertStaffPaymentExpense,
  listExpenses,
} from '../../../lib/db/expenses';
import { getWorkerById } from '../../../lib/db/staff';
import { getSettingsBatch } from '../../../lib/db/daily';
import { auditLog } from '../../../lib/audit/log';
import {
  CreateExpenseSchema,
  ListExpensesQuerySchema,
} from '../../../lib/validation/expenses';
import { calcVatFromGross, isVatRegistered, parseVatRate } from '../../../lib/utils/vat';

// ----------------------------------------------------------------------------
// GET — list + category totals
// ----------------------------------------------------------------------------
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const parsed = ListExpensesQuerySchema.safeParse({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return json(
      { error: 'Invalid query', issues: parsed.error.flatten() },
      400,
    );
  }

  const db = getDb();
  const [items, totals] = await Promise.all([
    listExpenses(db, parsed.data),
    getCategoryTotals(db, parsed.data),
  ]);

  return json({
    items,
    totals: totals.totals,
    grand_total: totals.grand_total,
    count: totals.count,
  });
};

// ----------------------------------------------------------------------------
// POST — create
// ----------------------------------------------------------------------------
export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const user = locals.user;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = CreateExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: 'Invalid input', issues: parsed.error.flatten() },
      400,
    );
  }
  const input = parsed.data;
  const db = getDb();

  // Staff branch — atomic combo.
  if (input.category === 'staff') {
    const worker = await getWorkerById(db, input.worker_id);
    if (!worker) {
      return json({ error: 'Unknown worker' }, 400);
    }

    const result = await insertStaffPaymentExpense(db, {
      date: input.date,
      amount: input.amount,
      expense_method: input.expense_method,
      payment_method: input.payment_method,
      worker_id: input.worker_id,
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
        worker_id: input.worker_id,
        worker_name: worker.name,
        amount: input.amount,
        method: input.payment_method,
        paid_at: input.date,
        covers_period_start: input.covers_period_start || null,
        covers_period_end: input.covers_period_end || null,
        linked_expense_id: result.expense_id,
      },
      request,
    });

    await auditLog(db, {
      performedBy: user.id,
      action: 'expense.create',
      entityType: 'expense',
      entityId: result.expense_id,
      after: {
        date: input.date,
        amount: input.amount,
        method: input.expense_method,
        category: 'staff',
        staff_payment_id: result.staff_payment_id,
        worker_id: input.worker_id,
      },
      request,
    });

    return json({
      success: true,
      expense_id: result.expense_id,
      staff_payment_id: result.staff_payment_id,
    });
  }

  // Non-staff branch — single expense insert.
  // Server-side VAT auto-calc: if the business is VAT-registered and the
  // client didn't supply VAT (or sent 0), derive it from the gross amount
  // using the configured rate. Defense-in-depth — the form pre-fills too.
  let finalVatAmount = input.vat_amount;
  let finalVatRate = input.vat_rate;
  if (!finalVatAmount || finalVatAmount === 0) {
    const settings = await getSettingsBatch(db, ['vat_registered', 'vat_rate']);
    if (isVatRegistered(settings.vat_registered)) {
      const rate = parseVatRate(settings.vat_rate);
      if (rate > 0) {
        const breakdown = calcVatFromGross(input.amount, rate);
        finalVatAmount = breakdown.vat;
        finalVatRate = rate;
      }
    }
  }

  const expenseId = await insertExpense(db, {
    date: input.date,
    amount: input.amount,
    method: input.expense_method,
    category: input.category,
    description: (input.description ?? '').trim() || null,
    vendor: (input.vendor ?? '').trim() || null,
    vat_amount: finalVatAmount,
    vat_rate: finalVatRate,
    receipt_r2_key: (input.receipt_r2_key ?? '') || null,
    recorded_by: user.id,
  });

  await auditLog(db, {
    performedBy: user.id,
    action: 'expense.create',
    entityType: 'expense',
    entityId: expenseId,
    after: {
      date: input.date,
      amount: input.amount,
      method: input.expense_method,
      category: input.category,
      vendor: input.vendor || null,
      vat_amount: finalVatAmount,
      vat_rate: finalVatRate,
      has_receipt: !!input.receipt_r2_key,
    },
    request,
  });

  return json({ success: true, expense_id: expenseId });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
