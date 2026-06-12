// POST /api/app/r2/upload?purpose=receipts
//
// Accepts a binary body (image/webp or image/jpeg) up to ~5 MB.
// Generates a server-side key — clients cannot pick keys, preventing
// path traversal and overwriting other rows' receipts.
// Stores via the R2 binding; no AWS credentials needed.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/db';
import { makeR2Key, type R2KeyPrefix } from '../../../../lib/r2/keys';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, 'webp' | 'jpg'> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
};
const ALLOWED_PURPOSES: R2KeyPrefix[] = ['receipts', 'damage', 'profile'];

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const user = locals.user;

  const purposeParam = url.searchParams.get('purpose') ?? 'receipts';
  if (!ALLOWED_PURPOSES.includes(purposeParam as R2KeyPrefix)) {
    return json({ error: 'Invalid purpose' }, 400);
  }
  const purpose = purposeParam as R2KeyPrefix;

  const contentType = request.headers.get('content-type') ?? '';
  const ext = ALLOWED_TYPES[contentType.toLowerCase()];
  if (!ext) {
    return json({ error: 'Unsupported content-type' }, 415);
  }

  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
    return json({ error: 'File too large (max 5 MB)' }, 413);
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: 'Empty body' }, 400);
  if (body.byteLength > MAX_BYTES) {
    return json({ error: 'File too large (max 5 MB)' }, 413);
  }

  const env = getEnv();
  if (!env.R2_BUCKET) {
    return json({ error: 'R2 binding not configured' }, 500);
  }

  const key = makeR2Key(purpose, user.id, ext);

  await env.R2_BUCKET.put(key, body, {
    httpMetadata: { contentType: contentType.toLowerCase() },
    customMetadata: {
      uploaded_by: String(user.id),
      uploaded_at: new Date().toISOString(),
      purpose,
    },
  });

  return json({ success: true, key, size: body.byteLength });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
