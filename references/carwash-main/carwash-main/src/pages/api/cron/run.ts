// POST /api/cron/run?task=<task>
//
// Token-authenticated cron task runner. Designed for external pingers
// (cron-job.org, GitHub Actions, a separate Cloudflare cron-pinger Worker, etc).
// The endpoint is intentionally OUTSIDE /api/admin so it can be hit without
// a session cookie.
//
// Auth: header "X-Cron-Secret: <secret>" or query "?token=<secret>".
//   Compared in constant time against env.CRON_SECRET.
//
// Tasks: 'daily-summary' | 'close-reminder' | 'super-escalation' | 'all'

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb, getEnv } from '../../../lib/db';
import { runCron, type CronTask } from '../../../lib/cron/runner';
import { auditLog } from '../../../lib/audit/log';

const VALID_TASKS = new Set<CronTask>([
  'daily-summary',
  'close-reminder',
  'super-escalation',
  'all',
]);

export const POST: APIRoute = async ({ request, url }) => {
  const env = getEnv();
  const expected = env.CRON_SECRET;
  if (!expected) {
    return json({ error: 'CRON_SECRET not configured' }, 503);
  }

  const provided =
    request.headers.get('x-cron-secret') ?? url.searchParams.get('token') ?? '';
  if (!constantTimeEqual(provided, expected)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const taskParam = (url.searchParams.get('task') ?? 'all') as CronTask;
  if (!VALID_TASKS.has(taskParam)) {
    return json({ error: 'Invalid task', valid: Array.from(VALID_TASKS) }, 400);
  }

  const db = getDb();
  const results = await runCron({
    db,
    resendApiKey: env.RESEND_API_KEY,
    task: taskParam,
  });

  // Audit log — performed_by=0 since there's no user context.
  // The crm_audit_log table requires performed_by NOT NULL FK to workers,
  // so we skip the audit row when no system user exists. Cron telemetry
  // lives in daily_email_log + the Worker logs instead.

  return json({ ok: true, task: taskParam, results });
};

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
