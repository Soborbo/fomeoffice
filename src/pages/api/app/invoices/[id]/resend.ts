// POST /api/app/invoices/[id]/resend — admin+ resend an existing invoice email.
// Reuses the same Resend pipeline; updates send_status accordingly.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb, getEnv } from '../../../../../lib/db';
import {
  getInvoice,
  markInvoiceFailed,
  markInvoiceSent,
  parseLineItems,
} from '../../../../../lib/db/invoices';
import { sendInvoiceEmail } from '../../../../../lib/email/invoice';
import { getSettingsBatch } from '../../../../../lib/db/daily';
import { auditLog } from '../../../../../lib/audit/log';
import { isVatRegistered } from '../../../../../lib/utils/vat';

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  const db = getDb();
  const env = getEnv();
  const invoice = await getInvoice(db, id);
  if (!invoice) return json({ error: 'Not found' }, 404);

  if (!env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY not configured' }, 503);
  }

  const settings = await getSettingsBatch(db, [
    'business_name',
    'business_address',
    'business_phone',
    'business_email',
    'business_vat_number',
    'vat_registered',
  ]);

  const result = await sendInvoiceEmail({
    resendApiKey: env.RESEND_API_KEY,
    invoice,
    items: parseLineItems(invoice.items_json),
    businessName: settings.business_name || 'Bristol Car Wash',
    businessAddress: settings.business_address || '',
    businessPhone: settings.business_phone || '',
    businessEmail: settings.business_email || '',
    businessVatNumber: isVatRegistered(settings.vat_registered)
      ? (settings.business_vat_number || '').trim() || undefined
      : undefined,
    fromAddress: settings.business_email
      ? `${settings.business_name || 'Bristol Car Wash'} <${settings.business_email}>`
      : 'Foam Office <bookings@foamoffice.co.uk>',
  });

  if (result.ok) {
    await markInvoiceSent(db, id);
  } else {
    await markInvoiceFailed(db, id, result.error ?? 'unknown');
  }

  await auditLog(db, {
    performedBy: locals.user.id,
    action: 'invoice.resend',
    entityType: 'invoice',
    entityId: id,
    after: { ok: result.ok, error: result.error ?? null },
    request,
  });

  return json({ success: result.ok, error: result.error });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
