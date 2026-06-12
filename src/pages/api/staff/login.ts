// POST /api/staff/login
//   Body: { pin: "4-8 digit PIN" }
//
// Verifies the PIN against the workers table and, on match, creates a session
// for that worker. Sets the standard crm_session cookie so the existing
// session middleware applies. Workers can then visit /app/staff/me without
// re-entering their PIN until the session expires.
//
// Public route. Rate-limited only by the per-PIN hashing cost (PBKDF2 100K).

export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb, getEnv, getRequestIp } from '../../../lib/db';
import {
  isLegacyFallbackEnabled,
  verifyWorkerPin,
  type VerifiedWorker,
} from '../../../lib/auth/worker-pin';
import { buildSessionCookie, createSession } from '../../../lib/auth/session';
import { auditLog } from '../../../lib/audit/log';
import type { DB } from '../../../lib/db';

const Schema = z.object({
  pin: z.string().min(4).max(8).regex(/^\d{4,8}$/),
});

export const POST: APIRoute = async (context) => {
  const { request } = context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid PIN' }, 400);
  }

  const db = getDb();
  let worker: VerifiedWorker | null = await verifyWorkerPin(db, parsed.data.pin);
  let usedLegacy = false;

  // Legacy BOARD_PIN env fallback. Only kicks in when:
  //   - per-worker PIN didn't match,
  //   - settings.board_pin_legacy_fallback='1', AND
  //   - env.BOARD_PIN is set and matches the input.
  // Maps to the first active worker (by id) so the session has a stable
  // worker_id. For real per-staff attribution, set per-worker PINs in D1
  // and clear BOARD_PIN.
  if (!worker) {
    const env = getEnv();
    const boardPin = (env.BOARD_PIN ?? '').trim();
    if (boardPin && parsed.data.pin === boardPin && (await isLegacyFallbackEnabled(db))) {
      worker = await getFirstActiveWorker(db);
      if (worker) usedLegacy = true;
    }
  }

  if (!worker) {
    return json({ error: 'Invalid PIN' }, 401);
  }

  const ip = getRequestIp(context);
  const ua = request.headers.get('user-agent');

  const session = await createSession(db, {
    workerId: worker.id,
    ip,
    userAgent: ua,
  });

  await auditLog(db, {
    performedBy: worker.id,
    action: usedLegacy ? 'auth.staff_login.legacy_pin' : 'auth.staff_login',
    entityType: 'worker',
    entityId: worker.id,
    after: { name: worker.name, role: worker.role, legacy_pin: usedLegacy },
    request,
  });

  return new Response(
    JSON.stringify({
      success: true,
      user: { id: worker.id, name: worker.name, role: worker.role },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': buildSessionCookie(session.token, session.expiresAt),
      },
    },
  );
};

// Helper for the legacy BOARD_PIN fallback — picks an active worker so the
// session has a real worker_id. Prefers the lowest worker id (i.e. the
// earliest hired) since the per-worker PIN flow is the recommended path.
async function getFirstActiveWorker(db: DB): Promise<VerifiedWorker | null> {
  const row = await db
    .prepare(
      `SELECT id, name, role
       FROM live_workers
       WHERE active = 1
       ORDER BY id ASC
       LIMIT 1`,
    )
    .first<VerifiedWorker>();
  return row ?? null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
