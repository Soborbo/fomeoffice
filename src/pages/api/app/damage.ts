// Damage reports API.
//   GET /api/app/damage?from=&to=&status=
//   POST /api/app/damage  → insert + Resend notification

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb, getEnv } from '../../../lib/db';
import {
  getDamageReport,
  insertDamageReport,
  listDamageReports,
  markNotificationSent,
  parsePhotoKeys,
} from '../../../lib/db/damage';
import { getWorkerById } from '../../../lib/db/staff';
import { getSettingsBatch } from '../../../lib/db/daily';
import { auditLog } from '../../../lib/audit/log';
import {
  CreateDamageSchema,
  ListDamageQuerySchema,
} from '../../../lib/validation/damage';
import { resolveDamageRecipients, sendDamageEmail } from '../../../lib/email/damage';

// ----------------------------------------------------------------------------
// GET — list
// ----------------------------------------------------------------------------
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const parsed = ListDamageQuerySchema.safeParse({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return json({ error: 'Invalid query', issues: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const items = await listDamageReports(db, parsed.data);
  return json({ items });
};

// ----------------------------------------------------------------------------
// POST — create + email notify
// ----------------------------------------------------------------------------
export const POST: APIRoute = async (context) => {
  const { request, url, locals } = context;
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const user = locals.user;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = CreateDamageSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid input', issues: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;
  const db = getDb();

  // Validate worker_responsible exists, if provided.
  if (input.worker_responsible) {
    const w = await getWorkerById(db, input.worker_responsible);
    if (!w) return json({ error: 'Unknown worker_responsible' }, 400);
  }

  const id = await insertDamageReport(db, {
    occurred_at: input.occurred_at,
    reported_by: user.id,
    worker_responsible: input.worker_responsible ?? null,
    categories: input.categories,
    description: input.description,
    customer_name: input.customer_name.trim(),
    customer_phone: input.customer_phone.trim(),
    vehicle_registration: (input.vehicle_registration ?? '').trim().toUpperCase() || null,
    photo_r2_keys: input.photo_r2_keys,
    resolution: input.resolution.trim(),
    resolution_status: input.resolution_status ?? 'open',
    compensation_amount: input.compensation_amount ?? null,
  });

  await auditLog(db, {
    performedBy: user.id,
    action: 'damage.create',
    entityType: 'damage_report',
    entityId: id,
    after: {
      occurred_at: input.occurred_at,
      categories: input.categories,
      worker_responsible: input.worker_responsible ?? null,
      photo_count: input.photo_r2_keys.length,
      resolution_status: input.resolution_status ?? 'open',
    },
    request,
  });

  // ----- Email notification (best-effort) ----------------------------------
  const env = getEnv();
  const settings = await getSettingsBatch(db, [
    'damage_notification_emails',
    'super_admin_email',
  ]);
  const recipients = resolveDamageRecipients(settings);

  let emailStatus: 'sent' | 'no_recipients' | 'no_resend_key' | 'failed' = 'no_resend_key';
  if (env.RESEND_API_KEY && recipients.length > 0) {
    const fresh = await getDamageReport(db, id);
    if (fresh) {
      const reporter = await getWorkerById(db, user.id);
      const result = await sendDamageEmail({
        resendApiKey: env.RESEND_API_KEY,
        toEmails: recipients,
        replyTo: reporter?.email ?? null,
        report: fresh,
        photoKeys: parsePhotoKeys(fresh.photo_r2_keys),
        appOrigin: new URL(url).origin,
      });
      if (result.ok) {
        await markNotificationSent(db, id);
        emailStatus = 'sent';
      } else {
        emailStatus = 'failed';
        console.error('[damage] email failed:', result.error);
      }
    }
  } else if (!env.RESEND_API_KEY) {
    emailStatus = 'no_resend_key';
  } else {
    emailStatus = 'no_recipients';
  }

  return json({
    success: true,
    id,
    email_status: emailStatus,
    recipients_count: recipients.length,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
