// GET /api/app/invoices/[id] — admin+ detail (parsed line items + raw row)

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { getInvoice, parseLineItems } from '../../../../lib/db/invoices';

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  const db = getDb();
  const row = await getInvoice(db, id);
  if (!row) return json({ error: 'Not found' }, 404);

  return json({
    invoice: row,
    items: parseLineItems(row.items_json),
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
