// Invoice orchestrator — called from the booking-status-done flow and the
// walkin-create flow. Best-effort: every step that fails is logged but does
// not throw; the caller's primary write must not be undone.

import type { DB } from './db';
import {
  insertCustomerVisit,
  insertInvoice,
  issueInvoiceNumber,
  markInvoiceFailed,
  markInvoiceSent,
  type InvoiceLineItem,
} from './db/invoices';
import { sendInvoiceEmail } from './email/invoice';
import { getSettingsBatch } from './db/daily';
import { calcVatFromGross, isVatRegistered, parseVatRate } from './utils/vat';
import {
  issueLoyaltyCoupon,
  parseLoyaltyConfig,
  shouldIssueLoyaltyCoupon,
} from './loyalty/tracker';

export type IssueOutcome =
  | {
      ok: true;
      invoice_id: number;
      invoice_number: string;
      email_status: 'sent' | 'failed' | 'no_resend_key' | 'draft';
    }
  | { ok: false; reason: 'no_email' | 'unsupported' | 'error'; error?: string };

export interface IssueInvoiceContext {
  db: DB;
  resendApiKey: string;
  customer_id: number | null;
  customer_email: string | null | undefined;
  customer_name: string | null;
  marketing_opt_in?: boolean;
  amount_pence: number;
  vat_amount_pence?: number;
  items: InvoiceLineItem[];
  booking_id?: number | null;
  walkin_id?: number | null;
  visit_date: string;
  package_used?: string | null;
}

/**
 * Issue + send an invoice, plus insert a customer_visits row for loyalty.
 * Returns success even if Resend fails (the DB record is still created
 * with send_status='failed' so it can be retried via the resend endpoint).
 */
export async function issueInvoice(
  ctx: IssueInvoiceContext,
): Promise<IssueOutcome> {
  if (!ctx.customer_email) {
    return { ok: false, reason: 'no_email' };
  }
  if (!ctx.booking_id && !ctx.walkin_id) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const settings = await getSettingsBatch(ctx.db, [
      'invoice_number_prefix',
      'invoice_auto_send',
      'business_name',
      'business_address',
      'business_phone',
      'business_email',
      'business_vat_number',
      'vat_registered',
      'vat_rate',
      'loyalty_enabled',
      'loyalty_visits_for_reward',
      'loyalty_reward_percent',
      'loyalty_coupon_validity_days',
    ]);
    const prefix = settings.invoice_number_prefix || 'INV';
    // Auto-send is opt-in via the 'invoice_auto_send' setting; absent or '1'
    // keeps the historical behaviour, '0' parks the invoice as a draft.
    const autoSend = (settings.invoice_auto_send ?? '1') === '1';

    // Auto-fill VAT for registered businesses when the caller didn't supply it.
    // Prices on the wash side are gross — we derive the VAT slice and store it
    // alongside the gross amount. The DB has a generated `net_amount` column.
    let vatAmountPence = ctx.vat_amount_pence ?? 0;
    if (vatAmountPence === 0 && isVatRegistered(settings.vat_registered)) {
      const rate = parseVatRate(settings.vat_rate);
      if (rate > 0) {
        vatAmountPence = calcVatFromGross(ctx.amount_pence, rate).vat;
      }
    }

    const { invoice_number } = await issueInvoiceNumber(ctx.db, prefix);

    const invoiceId = await insertInvoice(ctx.db, {
      invoice_number,
      booking_id: ctx.booking_id ?? null,
      walkin_id: ctx.walkin_id ?? null,
      customer_id: ctx.customer_id,
      customer_email: ctx.customer_email,
      customer_name: ctx.customer_name,
      amount: ctx.amount_pence,
      vat_amount: vatAmountPence,
      items: ctx.items,
      marketing_opt_in: !!ctx.marketing_opt_in,
    });

    if (ctx.customer_id) {
      try {
        await insertCustomerVisit(
          ctx.db,
          ctx.customer_id,
          ctx.visit_date,
          ctx.amount_pence,
          ctx.booking_id ?? null,
          ctx.walkin_id ?? null,
          ctx.package_used ?? null,
        );
      } catch (err) {
        console.error('[invoice-orchestrator] customer_visit insert failed:', err);
      }

      // Loyalty engine — issues a coupon every Nth visit when enabled+configured.
      // Best-effort: a failure here must not block the invoice flow. The
      // customer_visits trigger has already bumped customers.visit_count by 1,
      // so we re-read the fresh value rather than tracking it ourselves.
      try {
        const loyaltyCfg = parseLoyaltyConfig(settings);
        if (loyaltyCfg.enabled) {
          const fresh = await ctx.db
            .prepare(`SELECT visit_count FROM customers WHERE id = ? LIMIT 1`)
            .bind(ctx.customer_id)
            .first<{ visit_count: number }>();
          const visitCount = fresh?.visit_count ?? 0;
          if (shouldIssueLoyaltyCoupon(loyaltyCfg, visitCount, ctx.customer_id)) {
            const coupon = await issueLoyaltyCoupon({
              db: ctx.db,
              customerId: ctx.customer_id,
              visitCount,
              rewardPercent: loyaltyCfg.rewardPercent,
              validityDays: loyaltyCfg.validityDays,
              visitDate: ctx.visit_date,
            });
            console.log(
              `[invoice-orchestrator] loyalty coupon ${coupon.code} issued for customer ${ctx.customer_id} (visit #${visitCount})`,
            );
          }
        }
      } catch (err) {
        console.error('[invoice-orchestrator] loyalty issue failed:', err);
      }
    }

    if (!autoSend) {
      // Draft mode — record exists, customer is NOT emailed. An admin can
      // hit "Send email" from /app/invoices/<id> when ready.
      return { ok: true, invoice_id: invoiceId, invoice_number, email_status: 'draft' };
    }

    if (!ctx.resendApiKey) {
      return { ok: true, invoice_id: invoiceId, invoice_number, email_status: 'no_resend_key' };
    }

    // Re-read the invoice row so the email helper has timestamps + send_status.
    const fresh = await ctx.db
      .prepare(`SELECT * FROM live_invoices WHERE id = ? LIMIT 1`)
      .bind(invoiceId)
      .first<import('./db/invoices').InvoiceRow>();
    if (!fresh) {
      return { ok: true, invoice_id: invoiceId, invoice_number, email_status: 'failed' };
    }

    const sent = await sendInvoiceEmail({
      resendApiKey: ctx.resendApiKey,
      invoice: fresh,
      items: ctx.items,
      businessName: settings.business_name || 'Bristol Car Wash',
      businessAddress: settings.business_address || '',
      businessPhone: settings.business_phone || '',
      businessEmail: settings.business_email || '',
      businessVatNumber: isVatRegistered(settings.vat_registered)
        ? (settings.business_vat_number || '').trim() || undefined
        : undefined,
      fromAddress:
        (settings.business_email
          ? `${settings.business_name || 'Bristol Car Wash'} <${settings.business_email}>`
          : 'Bristol Car Wash <bookings@bristolcarwash.co.uk>'),
    });

    if (sent.ok) {
      await markInvoiceSent(ctx.db, invoiceId);
      return { ok: true, invoice_id: invoiceId, invoice_number, email_status: 'sent' };
    }
    await markInvoiceFailed(ctx.db, invoiceId, sent.error ?? 'unknown');
    return { ok: true, invoice_id: invoiceId, invoice_number, email_status: 'failed' };
  } catch (err) {
    console.error('[invoice-orchestrator] failed:', err);
    return {
      ok: false,
      reason: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
