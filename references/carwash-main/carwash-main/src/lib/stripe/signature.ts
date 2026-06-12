// Stripe webhook signature verification using Web Crypto HMAC-SHA256.
// Stripe-Signature header format: "t=<timestamp>,v1=<hex>,v0=<hex>" (v0 deprecated).
// We verify v1: HMAC-SHA256(secret, `${t}.${rawBody}`).
//
// Replay protection: reject if `t` is older than 5 minutes.

const REPLAY_TOLERANCE_SEC = 300;

export interface VerifyResult {
  ok: boolean;
  reason?: 'no_header' | 'malformed' | 'expired' | 'mismatch';
}

export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!header) return { ok: false, reason: 'no_header' };

  const fields = parseHeader(header);
  const t = fields.get('t');
  const v1 = fields.get('v1');
  if (!t || !v1) return { ok: false, reason: 'malformed' };

  const timestamp = parseInt(t, 10);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'malformed' };
  if (Math.abs(nowSec - timestamp) > REPLAY_TOLERANCE_SEC) {
    return { ok: false, reason: 'expired' };
  }

  const signedPayload = `${t}.${rawBody}`;
  const expectedHex = await hmacHex(secret, signedPayload);
  if (!constantTimeEqual(expectedHex, v1)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}

function parseHeader(header: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!out.has(k)) out.set(k, v);
  }
  return out;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return acc === 0;
}
