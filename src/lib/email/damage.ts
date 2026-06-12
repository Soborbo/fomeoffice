// Resend email for damage report notifications.
// Recipients come from settings:
//   - damage_notification_emails (JSON array of strings; preferred)
//   - super_admin_email (single string; fallback)
// If both empty, the email step is skipped (no error — DB record still saved).

import { Resend } from 'resend';
import type { DamageReportListItem } from '../db/damage';
import { parseCategories } from '../db/damage';

const CATEGORY_LABEL: Record<string, string> = {
  scratch: 'Scratch',
  mirror_damage: 'Mirror damage',
  dent: 'Dent',
  paint_damage: 'Paint damage',
  wheel_damage: 'Wheel damage',
  interior_damage: 'Interior damage',
  glass_damage: 'Glass damage',
  other: 'Other',
};

export interface SendDamageEmailParams {
  resendApiKey: string;
  toEmails: string[];
  replyTo?: string | null;
  report: DamageReportListItem;
  photoKeys: string[];
  appOrigin: string; // e.g. https://carwash.golaxo.workers.dev
}

export interface SendDamageEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendDamageEmail(
  params: SendDamageEmailParams,
): Promise<SendDamageEmailResult> {
  const { resendApiKey, toEmails, replyTo, report, photoKeys, appOrigin } = params;

  if (!resendApiKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  if (toEmails.length === 0) {
    return { ok: false, error: 'No recipients configured' };
  }

  const resend = new Resend(resendApiKey);

  const occurredAtDisplay = formatDateTime(report.occurred_at);
  const categoryList = parseCategories(report.categories, report.category)
    .map((c) => CATEGORY_LABEL[c] ?? c)
    .join(', ');
  const subject = `Damage report: ${report.reported_by_name} - ${categoryList} - ${occurredAtDisplay}`;

  const detailUrl = `${appOrigin}/app/damage/${report.id}`;
  const photoLinks = photoKeys.map(
    (key) => `${appOrigin}/api/app/r2/get?key=${encodeURIComponent(key)}`,
  );

  const html = renderHtml({ report, occurredAtDisplay, photoLinks, detailUrl });

  try {
    const result = await resend.emails.send({
      from: 'Foam Office CRM <bookings@foamoffice.co.uk>',
      to: toEmails,
      replyTo: replyTo ?? undefined,
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
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatDateTime(iso: string): string {
  // Best-effort: turn '2026-04-29T14:30' or '2026-04-29 14:30:00' into
  // '29 Apr 2026, 14:30'. If parsing fails, fall back to the raw string.
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

function renderHtml(params: {
  report: DamageReportListItem;
  occurredAtDisplay: string;
  photoLinks: string[];
  detailUrl: string;
}): string {
  const { report, occurredAtDisplay, photoLinks, detailUrl } = params;
  const r = (s: string | null | undefined) =>
    s ? escapeHtml(s) : '<span style="color:#999">(none)</span>';
  const compensation =
    report.compensation_amount != null
      ? `&pound;${(report.compensation_amount / 100).toFixed(2)}`
      : '<span style="color:#999">(none)</span>';

  const photoListHtml =
    photoLinks.length === 0
      ? '<p style="color:#999;margin:8px 0 0 0;">No photos attached.</p>'
      : `<ul style="margin:8px 0 0 0;padding-inline-start:20px;">${photoLinks
          .map(
            (url, i) =>
              `<li style="margin:4px 0;"><a href="${escapeHtml(url)}">Photo ${i + 1}</a> (sign in required)</li>`,
          )
          .join('')}</ul>`;

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#b91c1c;padding:24px;color:#fff;">
      <h1 style="margin:0;font-size:20px;">Damage report - ${escapeHtml(parseCategories(report.categories, report.category).map((c) => CATEGORY_LABEL[c] ?? c).join(', '))}</h1>
      <p style="margin:4px 0 0 0;font-size:14px;">Occurred: ${escapeHtml(occurredAtDisplay)}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#6b7280;width:40%;">Reported by</td><td style="padding:8px 0;font-weight:600;">${r(report.reported_by_name)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Worker responsible</td><td style="padding:8px 0;">${r(report.worker_responsible_name)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Customer name</td><td style="padding:8px 0;">${r(report.customer_name)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Customer phone</td><td style="padding:8px 0;">${r(report.customer_phone)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Vehicle reg</td><td style="padding:8px 0;font-family:monospace;">${r(report.vehicle_registration)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Resolution status</td><td style="padding:8px 0;">${escapeHtml(report.resolution_status)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Compensation</td><td style="padding:8px 0;">${compensation}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px 0;color:#19576d;font-size:14px;">Description</h3>
      <p style="margin:0;white-space:pre-wrap;">${escapeHtml(report.description)}</p>

      ${
        report.resolution
          ? `<h3 style="margin:24px 0 8px 0;color:#19576d;font-size:14px;">Resolution</h3>
             <p style="margin:0;white-space:pre-wrap;">${escapeHtml(report.resolution)}</p>`
          : ''
      }

      <h3 style="margin:24px 0 8px 0;color:#19576d;font-size:14px;">Photos</h3>
      ${photoListHtml}

      <p style="margin:24px 0 0 0;">
        <a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#19576d;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Open in CRM</a>
      </p>
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

// Read the recipient list from settings — preferring the JSON array, falling
// back to super_admin_email. Empty result means "skip email".
export function resolveDamageRecipients(settings: {
  damage_notification_emails?: string;
  super_admin_email?: string;
}): string[] {
  const out = new Set<string>();

  if (settings.damage_notification_emails) {
    try {
      const parsed = JSON.parse(settings.damage_notification_emails);
      if (Array.isArray(parsed)) {
        for (const e of parsed) {
          if (typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
            out.add(e.toLowerCase());
          }
        }
      }
    } catch {
      // ignore — fall through to super_admin_email
    }
  }

  if (out.size === 0 && settings.super_admin_email) {
    const e = settings.super_admin_email.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) out.add(e);
  }

  return Array.from(out);
}
