// Close-time reminder cron task.
// Runs N minutes after closing. If today's daily_summary row is missing,
// emails the on-shift admin (or super_admin as fallback) a nudge.
//
// Used both for the "5 min after close" reminder and the "20 min after close"
// super-admin escalation — same logic, different recipient resolution.

import { Resend } from 'resend';
import { getEnv, type DB } from '../db';
import { getSettingsBatch } from '../db/daily';
import { todayInTimezone } from '../db/dashboard';

export type ReminderResult =
  | { ok: true; status: 'already_filled'; date: string }
  | { ok: true; status: 'sent'; date: string; recipient: string; message_id?: string }
  | { ok: false; reason: 'no_recipient' | 'no_resend_key' | 'send_failed'; error?: string };

export interface RunReminderOptions {
  db: DB;
  resendApiKey: string;
  /** 'admin' uses business_email; 'super_admin' uses super_admin_email. */
  level: 'admin' | 'super_admin';
  date?: string;
}

export async function runCloseReminder(
  opts: RunReminderOptions,
): Promise<ReminderResult> {
  const { db, resendApiKey, level } = opts;
  const date = opts.date ?? todayInTimezone();

  const filled = await db
    .prepare(`SELECT id FROM live_daily_summary WHERE date = ? LIMIT 1`)
    .bind(date)
    .first<{ id: number }>();
  if (filled) {
    return { ok: true, status: 'already_filled', date };
  }

  const settings = await getSettingsBatch(db, [
    'business_name',
    'business_email',
    'super_admin_email',
    'closing_time',
  ]);

  const recipient =
    (level === 'super_admin'
      ? settings.super_admin_email
      : settings.business_email
    )?.trim().toLowerCase() ?? '';
  if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return { ok: false, reason: 'no_recipient' };
  }
  if (!resendApiKey) return { ok: false, reason: 'no_resend_key' };

  const businessName = settings.business_name || 'Bristol Car Wash';
  const closingTime = settings.closing_time || '19:00';
  const appOrigin = getEnv().SITE_URL || 'https://foamoffice.co.uk';

  const subject = level === 'super_admin'
    ? `Daily reconciliation overdue - ${date} - ${businessName}`
    : `Daily reconciliation reminder - ${date} - ${businessName}`;

  const tone = level === 'super_admin'
    ? `<p style="margin:0 0 12px 0;color:#b91c1c;font-weight:600;">Heads up — the daily reconciliation form for ${escapeHtml(date)} hasn't been filled in yet.</p>`
    : `<p style="margin:0 0 12px 0;">Closing time was ${escapeHtml(closingTime)}. Please fill in today's reconciliation form when you've cashed up.</p>`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#1f2937;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#19576d;padding:20px;color:#fff;">
      <h1 style="margin:0;font-size:18px;">Daily reconciliation - ${escapeHtml(date)}</h1>
    </div>
    <div style="padding:20px;font-size:14px;line-height:1.5;">
      ${tone}
      <p style="margin:0 0 12px 0;">Form: <a href="${appOrigin}/app/daily" style="color:#19576d;font-weight:600;">app/daily</a></p>
      <p style="margin:0;color:#6b7280;font-size:12px;">${escapeHtml(businessName)} - automated reminder</p>
    </div>
  </div>
</body>
</html>`;

  const resend = new Resend(resendApiKey);
  const fromAddress = settings.business_email
    ? `${businessName} <${settings.business_email}>`
    : 'Foam Office <bookings@foamoffice.co.uk>';

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject,
      html,
    });
    if ('error' in result && result.error) {
      return { ok: false, reason: 'send_failed', error: JSON.stringify(result.error) };
    }
    const messageId =
      'data' in result && result.data?.id ? result.data.id : undefined;
    return { ok: true, status: 'sent', date, recipient, message_id: messageId };
  } catch (err) {
    return {
      ok: false,
      reason: 'send_failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
