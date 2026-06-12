// Resend HTML invoice email helper.
// Caller is responsible for marking the invoices row sent/failed afterwards.

import { Resend } from 'resend';
import type { InvoiceRow } from '../db/invoices';
import type { InvoiceLineItem } from '../db/invoices';

export interface SendInvoiceParams {
  resendApiKey: string;
  invoice: InvoiceRow;
  items: InvoiceLineItem[];
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  businessVatNumber?: string;
  fromAddress: string;
}

export interface SendInvoiceResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendInvoiceEmail(
  params: SendInvoiceParams,
): Promise<SendInvoiceResult> {
  const { resendApiKey, invoice, items, fromAddress } = params;

  if (!resendApiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };
  if (!invoice.customer_email) return { ok: false, error: 'No customer email' };

  const resend = new Resend(resendApiKey);
  const subject = `Receipt ${invoice.invoice_number} - ${params.businessName}`;
  const html = renderInvoiceHtml(invoice, items, params);

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: invoice.customer_email,
      subject,
      html,
    });
    if ('error' in result && result.error) {
      return { ok: false, error: JSON.stringify(result.error) };
    }
    const messageId =
      'data' in result && result.data?.id ? result.data.id : undefined;
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function fmtMoney(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const pennies = abs % 100;
  return sign + '£' + pounds + '.' + (pennies < 10 ? '0' + pennies : pennies);
}

export function renderInvoiceHtml(
  invoice: InvoiceRow,
  items: InvoiceLineItem[],
  ctx: SendInvoiceParams,
): string {
  const issuedAt = new Date(
    invoice.created_at.includes('T') ? invoice.created_at : invoice.created_at.replace(' ', 'T'),
  );
  const issuedAtDisplay = isNaN(issuedAt.getTime())
    ? invoice.created_at
    : issuedAt.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/London',
      });

  const itemRows = items
    .map(
      (it) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;">${escapeHtml(it.description)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:end;">${it.qty}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:end;">${fmtMoney(it.unit_price)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:end;font-weight:600;">${fmtMoney(it.total)}</td>
      </tr>`,
    )
    .join('');

  const customerLine = invoice.customer_name
    ? `<p style="margin:0;font-size:14px;">Hi ${escapeHtml(invoice.customer_name)},</p>`
    : '';

  const marketingNote = invoice.marketing_opt_in
    ? `<p style="color:#6b7280;font-size:12px;margin:24px 0 0 0;">You're subscribed to occasional offers and loyalty rewards. <a href="mailto:${escapeHtml(ctx.businessEmail)}?subject=Unsubscribe">Unsubscribe</a>.</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#19576d;padding:24px;color:#fff;">
      <h1 style="margin:0;font-size:20px;">${escapeHtml(ctx.businessName)}</h1>
      <p style="margin:4px 0 0 0;font-size:13px;opacity:0.9;">${escapeHtml(ctx.businessAddress)}</p>
    </div>

    <div style="padding:24px;">
      ${customerLine}
      <p style="margin:8px 0 0 0;font-size:14px;color:#6b7280;">Thanks for stopping by — here's your receipt.</p>

      <table style="width:100%;margin-top:24px;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#6b7280;width:40%;">Receipt number</td>
          <td style="padding:6px 0;font-family:monospace;font-weight:600;">${escapeHtml(invoice.invoice_number)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;">Date</td>
          <td style="padding:6px 0;">${escapeHtml(issuedAtDisplay)}</td>
        </tr>
      </table>

      <h3 style="margin:24px 0 8px 0;color:#19576d;font-size:14px;">Items</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="padding:6px 0;text-align:start;color:#6b7280;font-weight:500;">Description</th>
            <th style="padding:6px 0;text-align:end;color:#6b7280;font-weight:500;">Qty</th>
            <th style="padding:6px 0;text-align:end;color:#6b7280;font-weight:500;">Unit</th>
            <th style="padding:6px 0;text-align:end;color:#6b7280;font-weight:500;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      ${
        invoice.vat_amount > 0
          ? `<table style="width:100%;margin-top:16px;border-collapse:collapse;font-size:13px;color:#6b7280;">
              <tr><td style="text-align:end;padding:2px 0;">Net</td><td style="text-align:end;padding:2px 0;width:120px;">${fmtMoney(invoice.amount - invoice.vat_amount)}</td></tr>
              <tr><td style="text-align:end;padding:2px 0;">VAT</td><td style="text-align:end;padding:2px 0;">${fmtMoney(invoice.vat_amount)}</td></tr>
            </table>`
          : ''
      }

      <p style="text-align:end;margin:16px 0 0 0;font-size:18px;font-weight:700;color:#19576d;">
        Total ${fmtMoney(invoice.amount)}
      </p>

      <p style="margin:32px 0 0 0;font-size:14px;color:#374151;">
        Book your next wash at <a href="https://foamoffice.co.uk" style="color:#19576d;">foamoffice.co.uk</a>.
      </p>

      ${marketingNote}

      <hr style="margin:24px 0;border:0;border-top:1px solid #e5e7eb;" />
      <p style="font-size:12px;color:#9ca3af;margin:0;">
        ${escapeHtml(ctx.businessName)} - ${escapeHtml(ctx.businessAddress)} - <a href="tel:${escapeHtml(ctx.businessPhone)}">${escapeHtml(ctx.businessPhone)}</a>
      </p>
      ${
        ctx.businessVatNumber
          ? `<p style="font-size:12px;color:#9ca3af;margin:4px 0 0 0;">VAT registration number: ${escapeHtml(ctx.businessVatNumber)}</p>`
          : ''
      }
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
