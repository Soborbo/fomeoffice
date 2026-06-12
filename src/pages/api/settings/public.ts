export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

// Whitelist of settings keys safe to expose publicly. Used by the booking
// form / board UI to feature-flag Stripe etc. without exposing admin config.
const PUBLIC_KEYS = [
  'stripe_enabled',
  'stripe_test_mode',
  'currency',
  'business_name',
  'opening_time',
  'closing_time',
  'sunday_opening_time',
  'sunday_closing_time',
  'image_max_width',
  'image_quality',
  'image_max_size_kb',
  'image_min_width',
  'image_min_size_kb',
] as const;

interface SettingRow {
  key: string;
  value: string;
}

export const GET: APIRoute = async () => {
  const db = getDb();
  const placeholders = PUBLIC_KEYS.map(() => '?').join(',');
  const rows = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .bind(...PUBLIC_KEYS)
    .all<SettingRow>();

  const out: Record<string, string> = {};
  for (const r of rows.results ?? []) {
    out[r.key] = r.value;
  }

  return new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30',
    },
  });
};
