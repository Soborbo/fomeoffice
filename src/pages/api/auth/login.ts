export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb, getEnv, getRequestIp } from '../../../lib/db';
import { verifySecret } from '../../../lib/auth/password';
import { buildSessionCookie, createSession } from '../../../lib/auth/session';
import { auditLog } from '../../../lib/audit/log';
import type { WorkerRole } from '../../../env';
import type { DB } from '../../../lib/db';

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

// Valid-base64 dummies for the unknown-email branch, so the verify call
// runs a real PBKDF2 round (matching the wall time of a real verify) instead
// of crashing on `atob`'s invalid-character rejection.
const DUMMY_HASH = 'MTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMQ==';
const DUMMY_SALT = 'MjIyMjIyMjIyMjIyMjIyMg==';

interface AdminWorkerRow {
  id: number;
  name: string;
  email: string;
  role: WorkerRole;
  password_hash: string | null;
  password_salt: string | null;
}

export const POST: APIRoute = async (context) => {
  const { request } = context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid email or password' }, 400);
  }

  const db = getDb();
  const inputEmail = parsed.data.email.toLowerCase();
  const inputPassword = parsed.data.password;

  const row = await db
    .prepare(
      `SELECT id, name, email, role, password_hash, password_salt
       FROM live_workers
       WHERE email = ? AND active = 1 AND role IN ('admin', 'super_admin')`,
    )
    .bind(inputEmail)
    .first<AdminWorkerRow>();

  // Env-fallback path: when ADMIN_EMAIL + ADMIN_PASSWORD are set in the Worker
  // env and match the input, bypass the DB hash check entirely. Convenient
  // for owner-managed deployments — the credentials are editable from the
  // Cloudflare dashboard without a re-bootstrap. The matching workers row
  // is auto-created/promoted so audit log and sessions still have a stable
  // worker_id to attach to.
  let authedRow: AdminWorkerRow | null = null;
  let usedEnvFallback = false;

  const dbValid = !!row && !!row.password_hash && !!row.password_salt
    ? await verifySecret(inputPassword, row.password_hash, row.password_salt)
    : false;

  if (dbValid && row) {
    authedRow = row;
  } else {
    // Try env fallback
    authedRow = await tryEnvAdminFallback(db, inputEmail, inputPassword);
    if (authedRow) usedEnvFallback = true;
  }

  if (!authedRow) {
    // Timing-attack defense: keep a real PBKDF2 round when we hadn't already.
    if (!row || !row.password_hash || !row.password_salt) {
      await verifySecret(inputPassword, DUMMY_HASH, DUMMY_SALT).catch(() => false);
    }
    return json({ error: 'Invalid email or password' }, 401);
  }

  const ip = getRequestIp(context);
  const ua = request.headers.get('user-agent');

  const session = await createSession(db, {
    workerId: authedRow.id,
    ip,
    userAgent: ua,
  });

  await auditLog(db, {
    performedBy: authedRow.id,
    action: usedEnvFallback ? 'auth.login.env_fallback' : 'auth.login',
    entityType: 'worker',
    entityId: authedRow.id,
    after: { email: authedRow.email, role: authedRow.role, env_fallback: usedEnvFallback },
    request,
  });

  const cookie = buildSessionCookie(session.token, session.expiresAt);

  return new Response(
    JSON.stringify({
      success: true,
      user: { id: authedRow.id, name: authedRow.name, email: authedRow.email, role: authedRow.role },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie,
      },
    },
  );
};

// ----------------------------------------------------------------------------
// Env-based admin fallback. Returns a workers row (existing or freshly
// inserted) when ADMIN_EMAIL+ADMIN_PASSWORD env vars are set AND match the
// caller's input. Returns null otherwise.
// ----------------------------------------------------------------------------
async function tryEnvAdminFallback(
  db: DB,
  email: string,
  password: string,
): Promise<AdminWorkerRow | null> {
  const env = getEnv();
  const envEmail = (env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const envPassword = env.ADMIN_PASSWORD ?? '';

  if (!envEmail || !envPassword) return null;
  if (email !== envEmail) return null;
  if (password !== envPassword) return null;

  // Find an existing row by email. We don't filter by role here — if the user
  // rotates the env admin to an existing worker's email, we promote them.
  const existing = await db
    .prepare(
      `SELECT id, name, email, role, password_hash, password_salt
       FROM live_workers
       WHERE email = ? LIMIT 1`,
    )
    .bind(email)
    .first<AdminWorkerRow>();

  if (existing) {
    if (existing.role !== 'super_admin') {
      await db
        .prepare(`UPDATE workers SET role = 'super_admin', active = 1 WHERE id = ?`)
        .bind(existing.id)
        .run();
    }
    return { ...existing, role: 'super_admin' };
  }

  const inserted = await db
    .prepare(
      `INSERT INTO workers (name, role, email, hired_at, active)
       VALUES (?, 'super_admin', ?, date('now'), 1)
       RETURNING id, name, email, role`,
    )
    .bind('Env Admin', email)
    .first<{ id: number; name: string; email: string; role: WorkerRole }>();

  if (!inserted) {
    throw new Error('Failed to create env admin workers row');
  }
  return {
    id: inserted.id,
    name: inserted.name,
    email: inserted.email,
    role: inserted.role,
    password_hash: null,
    password_salt: null,
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
