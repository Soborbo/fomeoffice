// Daily summary cron task.
// Sends an end-of-day rollup email to the super admin: revenue, expense,
// profit, daily-form status, walkin/booking count, top damages, etc.
//
// Idempotent — guarded by daily_email_log (UNIQUE on date). If today's row
// already exists, the task is a no-op and returns 'already_sent'.

import { Resend } from 'resend';
import type { DB } from '../db';
import { getSettingsBatch } from '../db/daily';
import {
  getKpiBlock,
  getRecentDamage,
  todayInTimezone,
  weekStartFor,
} from '../db/dashboard';
import { currentMonth, monthBounds } from '../db/staff';

export type DailySummaryResult =
  | { ok: true; status: 'sent'; date: string; recipient: string; message_id?: string }
  | { ok: true; status: 'already_sent'; date: string }
  | { ok: false; reason: 'no_recipient' | 'no_resend_key' | 'send_failed'; error?: string };

export interface RunDailySummaryOptions {
  db: DB;
  resendApiKey: string;
  /** Override the target date (defaults to today in business tz). */
  date?: string;
  /** Set to skip the daily_email_log idempotency check (for manual re-runs). */
  force?: boolean;
}

export async function runDailySummary(
  opts: RunDailySummaryOptions,
): Promise<DailySummaryResult> {
  const { db, resendApiKey, force } = opts;
  const date = opts.date ?? todayInTimezone();

  if (!force) {
    const existing = await db
      .prepare(`SELECT id FROM daily_email_log WHERE date = ? LIMIT 1`)
      .bind(date)
      .first<{ id: number }>();
    if (existing) {
      return { ok: true, status: 'already_sent', date };
    }
  }

  const settings = await getSettingsBatch(db, [
    'super_admin_email',
    'business_name',
    'business_address',
    'business_phone',
    'business_email',
  ]);
  const recipient = (settings.super_admin_email ?? '').trim().toLowerCase();
  if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return { ok: false, reason: 'no_recipient' };
  }
  if (!resendApiKey) return { ok: false, reason: 'no_resend_key' };

  const month = currentMonth();
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const weekStart = weekStartFor(date);

  const [kpis, damage, summary] = await Promise.all([
    getKpiBlock(db, date, weekStart, monthStart, monthEnd),
    getRecentDamage(db, 5),
    db
      .prepare(
        `SELECT cash_total, card_total, expected_cash, expected_card,
                cash_variance, card_variance, notes, is_locked
         FROM live_daily_summary WHERE date = ? LIMIT 1`,
      )
      .bind(date)
      .first<{
        cash_total: number;
        card_total: number;
        expected_cash: number | null;
        expected_card: number | null;
        cash_variance: number | null;
        card_variance: number | null;
        notes: string | null;
        is_locked: number;
      }>(),
  ]);

  const html = renderHtml({
    date,
    businessName: settings.business_name || 'Bristol Car Wash',
    businessAddress: settings.business_address || '',
    kpis,
    damage,
    summary,
  });

  const resend = new Resend(resendApiKey);
  const fromAddress = settings.business_email
    ? `${settings.business_name || 'Bristol Car Wash'} <${settings.business_email}>`
    : 'Foam Office <bookings@foamoffice.co.uk>';

  let messageId: string | undefined;
  let sendError: string | undefined;
  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject: `Daily summary - ${date} - ${settings.business_name || 'Bristol Car Wash'}`,
      html,
    });
    if ('error' in result && result.error) {
      sendError = JSON.stringify(result.error);
    } else if ('data' in result && result.data?.id) {
      messageId = result.data.id;
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
  }

  // Always log the attempt to daily_email_log so re-runs are guarded.
  await db
    .prepare(
      `INSERT INTO daily_email_log (date, recipient, resend_message_id, status, error_message)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         recipient = excluded.recipient,
         resend_message_id = excluded.resend_message_id,
         status = excluded.status,
         error_message = excluded.error_message,
         sent_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      date,
      recipient,
      messageId ?? null,
      sendError ? 'failed' : 'sent',
      sendError ?? null,
    )
    .run();

  if (sendError) {
    return { ok: false, reason: 'send_failed', error: sendError };
  }
  return { ok: true, status: 'sent', date, recipient, message_id: messageId };
}

interface DailySummaryHtmlContext {
  date: string;
  businessName: string;
  businessAddress: string;
  kpis: ReturnType<typeof getKpiBlock> extends Promise<infer T> ? T : never;
  damage: Awaited<ReturnType<typeof getRecentDamage>>;
  summary: {
    cash_total: number;
    card_total: number;
    expected_cash: number | null;
    expected_card: number | null;
    cash_variance: number | null;
    card_variance: number | null;
    notes: string | null;
    is_locked: number;
  } | null;
}

function fmtMoney(p: number | null | undefined): string {
  if (p == null) return '—';
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  const pounds = Math.floor(abs / 100);
  const pennies = abs % 100;
  return sign + '£' + pounds + '.' + (pennies < 10 ? '0' + pennies : pennies);
}

function renderHtml(ctx: DailySummaryHtmlContext): string {
  const { date, kpis, damage, summary } = ctx;
  const profit = kpis.today.profit;
  const profitColor = profit >= 0 ? '#15803d' : '#b91c1c';

  const summaryStatus = summary
    ? `<span style="color:${summary.cash_variance != null && summary.cash_variance < -500 ? '#b91c1c' : '#15803d'};">Filled${summary.is_locked ? ' &amp; locked' : ''}. Variance ${fmtMoney(summary.cash_variance)} cash, ${fmtMoney(summary.card_variance)} card.</span>`
    : '<span style="color:#b91c1c;font-weight:600;">⚠ NOT filled in.</span>';

  const damageRows = damage.length === 0
    ? '<p style="margin:0;color:#9ca3af;">No open reports.</p>'
    : damage
        .map(
          (d) =>
            `<li style="padding:6px 0;border-bottom:1px solid #eee;"><strong>${escapeHtml(d.category.replace('_', ' '))}</strong> - ${escapeHtml(d.description.slice(0, 120))}</li>`,
        )
        .join('');

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#19576d;padding:24px;color:#fff;">
      <h1 style="margin:0;font-size:20px;">Daily summary - ${escapeHtml(date)}</h1>
      <p style="margin:4px 0 0 0;font-size:13px;opacity:0.9;">${escapeHtml(ctx.businessName)}</p>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#19576d;">Today</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:40%;">Revenue</td><td style="padding:6px 0;font-weight:600;">${fmtMoney(kpis.today.revenue)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Expense</td><td style="padding:6px 0;font-weight:600;">${fmtMoney(kpis.today.expense)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Profit</td><td style="padding:6px 0;font-weight:700;color:${profitColor};">${fmtMoney(profit)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Bookings done</td><td style="padding:6px 0;">${kpis.today.bookings}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Walk-ins</td><td style="padding:6px 0;">${kpis.today.walkins}</td></tr>
      </table>

      <h2 style="margin:24px 0 12px 0;font-size:16px;color:#19576d;">Daily reconciliation</h2>
      <p style="margin:0;font-size:14px;">${summaryStatus}</p>
      ${summary?.notes ? `<p style="margin:8px 0 0 0;color:#6b7280;font-size:13px;font-style:italic;">"${escapeHtml(summary.notes)}"</p>` : ''}

      <h2 style="margin:24px 0 12px 0;font-size:16px;color:#19576d;">This month so far</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:40%;">Revenue</td><td style="padding:6px 0;font-weight:600;">${fmtMoney(kpis.month.revenue)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Expense</td><td style="padding:6px 0;font-weight:600;">${fmtMoney(kpis.month.expense)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Profit</td><td style="padding:6px 0;font-weight:700;color:${kpis.month.profit >= 0 ? '#15803d' : '#b91c1c'};">${fmtMoney(kpis.month.profit)}</td></tr>
      </table>

      <h2 style="margin:24px 0 12px 0;font-size:16px;color:#19576d;">Open damage reports (top 5)</h2>
      <ul style="margin:0;padding-inline-start:20px;font-size:14px;list-style:none;padding:0;">${damageRows}</ul>
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
