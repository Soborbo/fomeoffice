// D1 database access helper.
// Astro 6 + @astrojs/cloudflare v13: bindings are accessed via the
// `cloudflare:workers` virtual module, not via Astro.locals.runtime.

import { env } from 'cloudflare:workers';
import type { APIContext } from 'astro';

export type DB = D1Database;

export function getDb(): DB {
  const db = (env as Env).DB;
  if (!db) {
    throw new Error('D1 binding "DB" is not configured. Check wrangler-worker.json.');
  }
  return db;
}

export function getEnv(): Env {
  return env as Env;
}

export function getRequestIp(context: Pick<APIContext, 'request' | 'clientAddress'>): string | null {
  const cfIp = context.request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  try {
    return context.clientAddress ?? null;
  } catch {
    return null;
  }
}
