// GET /api/app/invoices/[id]/html
// Renders the same HTML body that gets emailed to the customer, so admins
// can save / print / forward a copy. Add `?download=1` to force a file
// attachment with the invoice number as filename.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db';
import { getInvoice, parseLineItems } from '../../../../../lib/db/invoices';
import { renderInvoiceHtml } from '../../../../../lib/email/invoice';
import { getSettingsBatch } from '../../../../../lib/db/daily';
import { isVatRegistered } from '../../../../../lib/utils/vat';

export const GET: APIRoute = async ({ params, url, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid id' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const db = getDb();
  const invoice = await getInvoice(db, id);
  if (!invoice) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const settings = await getSettingsBatch(db, [
    'business_name',
    'business_address',
    'business_phone',
    'business_email',
    'business_vat_number',
    'vat_registered',
  ]);

  const html = renderInvoiceHtml(invoice, parseLineItems(invoice.items_json), {
    // resendApiKey is unused in render — pass an empty string to satisfy
    // the SendInvoiceParams contract without leaking the real key.
    resendApiKey: '',
    invoice,
    items: parseLineItems(invoice.items_json),
    businessName: settings.business_name || 'Bristol Car Wash',
    businessAddress: settings.business_address || '',
    businessPhone: settings.business_phone || '',
    businessEmail: settings.business_email || '',
    businessVatNumber: isVatRegistered(settings.vat_registered)
      ? (settings.business_vat_number || '').trim() || undefined
      : undefined,
    fromAddress: '',
  });

  const wantsDownload = url.searchParams.get('download') === '1';
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    // Internal page — never let a CDN cache it.
    'cache-control': 'private, no-store',
  };
  if (wantsDownload) {
    // Strip anything weird from invoice_number before putting it in a
    // Content-Disposition filename.
    const safeName = invoice.invoice_number.replace(/[^A-Za-z0-9._-]/g, '_');
    headers['content-disposition'] = `attachment; filename="${safeName}.html"`;
  }

  return new Response(html, { status: 200, headers });
};
