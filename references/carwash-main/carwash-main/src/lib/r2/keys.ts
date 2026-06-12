// Helpers for R2 key generation + validation.
//
// Keys take the form:  <prefix>/<actor_id>/<YYYYMMDD>-<uuid>.<ext>
// e.g. receipts/1/20260429-3c2f...c8d.webp
//
// Validation is conservative — only allow the prefixes the CRM actually
// uses, with a strict character set, so the GET endpoint can serve them
// without leaking unrelated bucket contents.

const ALLOWED_PREFIXES = ['receipts', 'damage', 'profile'] as const;
export type R2KeyPrefix = (typeof ALLOWED_PREFIXES)[number];

const KEY_RE = /^(receipts|damage|profile)\/\d+\/\d{8}-[0-9a-f-]{36}\.(webp|jpg|jpeg)$/i;

export function isValidR2Key(key: string): key is string {
  return typeof key === 'string' && key.length <= 200 && KEY_RE.test(key);
}

export function makeR2Key(
  prefix: R2KeyPrefix,
  actorId: number,
  ext: 'webp' | 'jpg' = 'webp',
): string {
  if (!ALLOWED_PREFIXES.includes(prefix)) {
    throw new Error(`Invalid R2 prefix: ${prefix}`);
  }
  const yyyymmdd = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  return `${prefix}/${actorId}/${yyyymmdd}-${crypto.randomUUID()}.${ext}`;
}
