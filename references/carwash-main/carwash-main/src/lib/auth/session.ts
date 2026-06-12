// Admin / super_admin session cookie + sessions table management.
// Workers do NOT use sessions — they authenticate per request via PIN.

import type { DB } from '../db';
import type { AuthUser, WorkerRole } from '../../env';

export const SESSION_COOKIE_NAME = 'crm_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export interface CreateSessionOptions {
  workerId: number;
  ip: string | null;
  userAgent: string | null;
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(
  db: DB,
  opts: CreateSessionOptions,
): Promise<CreatedSession> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MS);

  await db
    .prepare(
      `INSERT INTO sessions (token, worker_id, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(token, opts.workerId, expiresAt.toISOString(), opts.ip, opts.userAgent)
    .run();

  return { token, expiresAt };
}

export interface SessionRow {
  worker_id: number;
  name: string;
  role: WorkerRole;
  email: string | null;
}

export async function getSessionUser(db: DB, token: string): Promise<AuthUser | null> {
  const row = await db
    .prepare(
      `SELECT w.id AS worker_id, w.name, w.role, w.email
       FROM sessions s
       JOIN workers w ON w.id = s.worker_id
       WHERE s.token = ?
         AND s.expires_at > datetime('now')
         AND w.deleted_at IS NULL
         AND w.active = 1`,
    )
    .bind(token)
    .first<SessionRow>();

  if (!row) return null;

  return {
    id: row.worker_id,
    name: row.name,
    role: row.role,
    email: row.email,
  };
}

export async function touchSession(db: DB, token: string): Promise<void> {
  await db
    .prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE token = ?`)
    .bind(token)
    .run();
}

export async function deleteSession(db: DB, token: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
}

export async function deleteExpiredSessions(db: DB): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`)
    .run();
  return result.meta?.changes ?? 0;
}

export function buildSessionCookie(token: string, expiresAt: Date): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Path=/`,
    `Expires=${expiresAt.toUTCString()}`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
  ];
  return parts.join('; ');
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;
}

export function readSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      return rest.join('=');
    }
  }
  return null;
}
