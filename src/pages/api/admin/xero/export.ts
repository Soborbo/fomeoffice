// GET /api/admin/xero/export?type=invoices|expenses&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns a CSV download. super_admin only via /api/admin RBAC.
//
// Format is intentionally generic — Xero's import wizard maps the columns
// at import time. We don't pre-bake AccountCodes / TaxType because those
// are tenant-specific.

export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../../../lib/db';
import { auditLog } from '../../../../lib/audit/log';
import {
  fetchExpenseRows,
  fetchSalesRows,
  rowsToCsv,
  type XeroExportType,
} from '../../../../lib/xero/csv-export';

const Schema = z.object({
  type: z.enum(['invoices', 'expenses']),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const GET: APIRoute = async ({ url, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const parsed = Schema.safeParse({
    type: url.searchParams.get('type') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });
  if (!parsed.success) {
    return json({ error: 'Invalid query', issues: parsed.error.flatten() }, 400);
  }

  const { type, from, to } = parsed.data;
  const db = getDb();
  const rows =
    type === 'invoices'
      ? await fetchSalesRows(db, from, to)
      : await fetchExpenseRows(db, from, to);

  const csv = rowsToCsv(rows, type as XeroExportType);

  await auditLog(db, {
    performedBy: locals.user.id,
    action: 'xero.export',
    entityType: 'csv',
    after: { type, from, to, row_count: rows.length },
    request,
  });

  const filename = `carwash-${type}-${from}-to-${to}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Cache disabled — exports reflect current data.
      'Cache-Control': 'no-store',
    },
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
