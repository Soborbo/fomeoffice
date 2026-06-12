// Stripe feature flag. Live deploys keep stripe_enabled='0' until ready.

import type { DB } from '../db';

let cache: { value: boolean; expiresAt: number } | null = null;
const CACHE_MS = 30_000;

export async function isStripeEnabled(db: DB, useCache = true): Promise<boolean> {
  const now = Date.now();
  if (useCache && cache && cache.expiresAt > now) {
    return cache.value;
  }
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = 'stripe_enabled'`)
    .first<{ value: string }>();
  const enabled = row?.value === '1';
  cache = { value: enabled, expiresAt: now + CACHE_MS };
  return enabled;
}

export async function isStripeTestMode(db: DB): Promise<boolean> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = 'stripe_test_mode'`)
    .first<{ value: string }>();
  return row?.value === '1';
}

// For tests / admin override after toggling settings without redeploy.
export function clearStripeCache(): void {
  cache = null;
}
