// POST /api/app/ocr/receipt
//   Body: { r2_key: string }   — must be an already-uploaded receipt key
//
// admin+ via /api/app RBAC.
//
// Gating: settings.ocr_enabled='1' AND env.ANTHROPIC_API_KEY present.
// Either gate failure → 503 (the form gracefully falls back to manual entry).
//
// Best-effort: a failed OCR call returns the error so the UI can show
// "couldn't read the receipt — please type the fields" without blocking.

export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb, getEnv } from '../../../../lib/db';
import { getSettingsBatch } from '../../../../lib/db/daily';
import { extractReceiptFields } from '../../../../lib/ocr/anthropic';

// Same key shape as /api/app/r2/get — receipts/<actor>/<YYYYMMDD>-<uuid>.<ext>
const RECEIPT_KEY = /^receipts\/\d+\/\d{8}-[0-9a-f-]{36}\.(webp|jpg|jpeg)$/i;

const Schema = z.object({
  r2_key: z.string().max(200).regex(RECEIPT_KEY),
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const db = getDb();
  const env = getEnv();

  const settings = await getSettingsBatch(db, ['ocr_enabled', 'ocr_model', 'ocr_max_tokens']);
  if (settings.ocr_enabled !== '1') {
    return json({ error: 'OCR is not enabled' }, 503);
  }
  if (!env.ANTHROPIC_API_KEY) {
    console.error('[ocr] ocr_enabled=1 but ANTHROPIC_API_KEY is missing');
    return json({ error: 'OCR not configured' }, 503);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid input', issues: parsed.error.flatten() }, 400);
  }

  // Pull the bytes from R2 via the binding (matches the Phase 4 access pattern).
  const obj = await env.R2_BUCKET.get(parsed.data.r2_key);
  if (!obj) {
    return json({ error: 'Receipt not found' }, 404);
  }

  const bytes = await obj.arrayBuffer();
  const contentType = obj.httpMetadata?.contentType || guessContentType(parsed.data.r2_key);

  const result = await extractReceiptFields({
    apiKey: env.ANTHROPIC_API_KEY,
    model: settings.ocr_model || 'claude-haiku-4-5-20251001',
    maxTokens: parseInt(settings.ocr_max_tokens || '1024', 10) || 1024,
    imageBytes: bytes,
    contentType,
  });

  if (!result.ok) {
    return json({ error: result.error }, 502);
  }

  return json({ extraction: result.data });
};

function guessContentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
