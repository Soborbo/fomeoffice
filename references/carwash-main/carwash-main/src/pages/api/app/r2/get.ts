// GET /api/app/r2/get?key=<key>
//
// Streams an R2 object back to the caller. Auth is enforced by the
// /api/app/* RBAC (admin+). The key must match the strict format from
// makeR2Key — that prevents path traversal and locks reads to the
// CRM's own prefixes.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/db';
import { isValidR2Key } from '../../../../lib/r2/keys';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);

  const key = url.searchParams.get('key');
  if (!key || !isValidR2Key(key)) {
    return json({ error: 'Invalid key' }, 400);
  }

  const env = getEnv();
  if (!env.R2_BUCKET) {
    return json({ error: 'R2 binding not configured' }, 500);
  }

  const obj = await env.R2_BUCKET.get(key);
  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('etag', obj.httpEtag);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/octet-stream');
  }

  return new Response(obj.body, { status: 200, headers });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
