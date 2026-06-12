# CRM Patterns — Implementációs Minták

> Hozzátartozik: `CARWASH-CRM-PLAN-v1.1.md`, `CRM-MIGRATIONS.md`
> Cél: a Claude Code-nak részletes minták, hogy ne kelljen találgatnia
> Nyelv: TypeScript, kommentek angolul

---

## Tartalomjegyzék

1. [Image compression — kliens-oldali WebP](#1-image-compression)
2. [R2 presigned URL upload pattern](#2-r2-presigned-url-upload)
3. [PBKDF2 password hashing — Workers-kompat](#3-pbkdf2-password-hashing)
4. [Auth middleware — RBAC](#4-auth-middleware)
5. [Audit log helper](#5-audit-log-helper)
6. [Soft delete pattern](#6-soft-delete-pattern)
7. [i18n + RTL — paraglide-js + Astro 6](#7-i18n--rtl)
8. [Stripe scaffolding — feature-flagged](#8-stripe-scaffolding)
9. [Cash variance computation](#9-cash-variance-computation)
10. [Daily summary email cron](#10-daily-summary-email-cron)
11. [Receipt OCR — Anthropic Vision (Stage 1.5)](#11-receipt-ocr)

---

## 1. Image compression

**Cél**: kliens-oldali tömörítés Canvas + WebP-vel mielőtt a fotó elhagyná a böngészőt. Ez egyszerre privacy + bandwidth + storage win.

### `src/lib/image/compress.ts`

```typescript
export interface CompressionOptions {
  maxWidth?: number;      // default 1600
  maxHeight?: number;     // default 1600 (megtartja az aspect ratio-t)
  quality?: number;       // 0-1, default 0.85
  format?: 'webp' | 'jpeg'; // default 'webp'
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  format: string;
}

export async function compressImage(
  file: File,
  opts: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.85,
    format = 'webp'
  } = opts;

  // 1. Olvasd be a fájlt egy ImageBitmap-be (gyors)
  const bitmap = await createImageBitmap(file);

  // 2. Számold ki a target méretet (aspect ratio megtartva)
  let { width, height } = bitmap;
  if (width > maxWidth || height > maxHeight) {
    const scale = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // 3. Rajzold canvas-re
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close(); // memória felszabadítás

  // 4. Konvertáld blob-ba
  const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = await canvas.convertToBlob({ type: mimeType, quality });

  return {
    blob,
    originalSize: file.size,
    compressedSize: blob.size,
    width,
    height,
    format,
  };
}

/** Validate that the compressed image is still useful (not over-compressed) */
export function validateCompression(
  result: CompressionResult,
  minSizeKb = 30,
  minWidth = 600
): { ok: boolean; reason?: string } {
  if (result.width < minWidth) {
    return { ok: false, reason: 'Image resolution too low — please retake' };
  }
  if (result.compressedSize < minSizeKb * 1024) {
    return { ok: false, reason: 'Image too small — may not be readable' };
  }
  return { ok: true };
}
```

### Használat (React component)

```tsx
import { compressImage, validateCompression } from '@/lib/image/compress';

async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;

  setUploading(true);
  try {
    const result = await compressImage(file, {
      maxWidth: 1600,
      quality: 0.85,
      format: 'webp',
    });

    const validation = validateCompression(result);
    if (!validation.ok) {
      setError(validation.reason);
      return;
    }

    console.log(
      `Compressed ${(result.originalSize / 1024).toFixed(0)}KB → ` +
      `${(result.compressedSize / 1024).toFixed(0)}KB (${result.width}×${result.height})`
    );

    await uploadToR2(result.blob, 'image/webp');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Upload failed');
  } finally {
    setUploading(false);
  }
}
```

### Settings-ből olvasás

A `image_max_width`, `image_quality`, `image_max_size_kb` értékek a `settings` táblából jönnek (lásd `CRM-MIGRATIONS.md` 0006). A frontendre vagy SSR-rel injektáld őket, vagy egy `GET /api/settings/public` végponton keresztül.

---

## 2. R2 presigned URL upload

**Cél**: a böngésző közvetlenül feltölt R2-be — Worker nem proxy-zza a bytokat (nem férne be a Worker CPU/memory limitbe).

### Backend: presigned URL generálás

R2 az AWS S3 API-jával kompatibilis. Két opció:

**Opció A: aws4fetch + R2 S3 API endpoint** (ajánlott, nincs külső dependency)

```typescript
// src/lib/r2/presign.ts
import { AwsClient } from 'aws4fetch';

export async function getPresignedPutUrl(
  env: Env,
  key: string,
  expiresIn = 300, // seconds
  contentType = 'image/webp'
): Promise<string> {
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`
  );
  url.searchParams.set('X-Amz-Expires', String(expiresIn));

  const signed = await aws.sign(
    new Request(url.toString(), {
      method: 'PUT',
      headers: { 'content-type': contentType },
    }),
    { aws: { signQuery: true } }
  );

  return signed.url;
}

export async function getPresignedGetUrl(
  env: Env,
  key: string,
  expiresIn = 3600
): Promise<string> {
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`
  );
  url.searchParams.set('X-Amz-Expires', String(expiresIn));

  const signed = await aws.sign(
    new Request(url.toString(), { method: 'GET' }),
    { aws: { signQuery: true } }
  );

  return signed.url;
}
```

**Opció B: R2 binding** (közvetlen `env.R2_BUCKET.put()` Worker-ből — egyszerűbb, de a fájl a Worker-en megy át)

Opció A-t használjuk, mert nagy fájloknál Worker-CPU friendly.

### API endpoint

```typescript
// src/pages/api/r2/presign.ts
import type { APIRoute } from 'astro';
import { getPresignedPutUrl } from '@/lib/r2/presign';
import { requireAuth } from '@/lib/auth/middleware';
import { z } from 'zod';

const Schema = z.object({
  purpose: z.enum(['receipt', 'damage', 'profile']),
  contentType: z.enum(['image/webp', 'image/jpeg']),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const user = await requireAuth(request, ['admin', 'super_admin']);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = Schema.parse(await request.json());
  const env = locals.runtime.env;

  // Generate unique key with prefix
  const key = `${body.purpose}/${user.id}/${Date.now()}-${crypto.randomUUID()}.webp`;
  const uploadUrl = await getPresignedPutUrl(env, key, 300, body.contentType);

  return new Response(JSON.stringify({ uploadUrl, key }), {
    headers: { 'content-type': 'application/json' },
  });
};
```

### Frontend upload

```typescript
async function uploadToR2(blob: Blob, contentType: string): Promise<string> {
  // 1. Get presigned URL from our API
  const presignRes = await fetch('/api/r2/presign', {
    method: 'POST',
    body: JSON.stringify({ purpose: 'receipt', contentType }),
    headers: { 'content-type': 'application/json' },
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { uploadUrl, key } = await presignRes.json();

  // 2. PUT directly to R2
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'content-type': contentType },
  });
  if (!uploadRes.ok) throw new Error('R2 upload failed');

  // 3. Return key (saved to DB by caller)
  return key;
}
```

### wrangler.toml binding

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "carwash-crm-uploads"

[vars]
R2_ACCOUNT_ID = "your-account-id"
R2_BUCKET_NAME = "carwash-crm-uploads"

# Secrets (NE menjenek a wrangler.toml-ba):
# wrangler secret put R2_ACCESS_KEY_ID
# wrangler secret put R2_SECRET_ACCESS_KEY
```

---

## 3. PBKDF2 password hashing

**Cél**: bcrypt nem fut Workers-en (Node-only). PBKDF2 a Web Crypto API-val natív, biztonságos.

### `src/lib/auth/password.ts`

```typescript
const ITERATIONS = 100_000;       // OWASP 2024 ajánlás minimum 600K SHA-256-hoz, de Workers-CPU limit miatt 100K-val kompromisszum
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;            // bytes

/** Hash a password — returns { hash, salt } both as base64 strings */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(salt),
  };
}

/** Verify a password against stored hash + salt */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const salt = base64ToBytes(storedSalt);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  const computedHash = bytesToBase64(new Uint8Array(bits));

  // Constant-time comparison
  return constantTimeEqual(computedHash, storedHash);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

### Worker PIN hashing — ugyanaz, csak rövid PIN-nel

A workers PIN-jét UGYANEZZEL a függvénnyel hash-eljük — 4 számjegy is elég biztonságos PBKDF2 + rate limiting mellett (PIN brute-force-hoz a rate limitter elég).

---

## 4. Auth middleware — RBAC

### `src/middleware.ts`

```typescript
import { defineMiddleware, sequence } from 'astro:middleware';

const ROLE_HIERARCHY: Record<string, number> = {
  worker: 1,
  admin: 2,
  super_admin: 3,
};

export const authMiddleware = defineMiddleware(async (context, next) => {
  const { request, cookies, locals, url } = context;

  // Public routes
  const publicPaths = ['/', '/login', '/api/bookings/public', '/board'];
  if (publicPaths.some(p => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    return next();
  }

  // Read session cookie
  const sessionToken = cookies.get('crm_session')?.value;
  if (!sessionToken) {
    return Response.redirect(new URL('/login', url));
  }

  // Verify session in D1
  const env = locals.runtime.env;
  const session = await env.DB.prepare(
    `SELECT s.*, w.id as worker_id, w.role, w.name, w.active
     FROM sessions s
     JOIN workers w ON w.id = s.worker_id
     WHERE s.token = ? AND s.expires_at > datetime('now') AND w.deleted_at IS NULL AND w.active = 1`
  ).bind(sessionToken).first();

  if (!session) {
    cookies.delete('crm_session');
    return Response.redirect(new URL('/login', url));
  }

  // Inject user into locals
  locals.user = {
    id: session.worker_id as number,
    role: session.role as 'worker' | 'admin' | 'super_admin',
    name: session.name as string,
  };

  // Route-level role enforcement
  const required = getRequiredRole(url.pathname);
  if (required && ROLE_HIERARCHY[locals.user.role] < ROLE_HIERARCHY[required]) {
    return new Response('Forbidden', { status: 403 });
  }

  return next();
});

function getRequiredRole(path: string): string | null {
  if (path.startsWith('/admin')) return 'super_admin';   // /admin = super admin only
  if (path.startsWith('/app/expenses')) return 'admin';
  if (path.startsWith('/app/staff/manage')) return 'admin';
  if (path.startsWith('/app/daily')) return 'admin';
  if (path.startsWith('/app')) return 'worker';          // default app = worker minimum
  if (path.startsWith('/api/admin')) return 'admin';
  return null; // public
}

export const onRequest = sequence(authMiddleware);
```

### `requireAuth` helper API endpoints-hoz

```typescript
// src/lib/auth/middleware.ts
export type UserRole = 'worker' | 'admin' | 'super_admin';

export interface AuthUser {
  id: number;
  role: UserRole;
  name: string;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  worker: 1, admin: 2, super_admin: 3,
};

export async function requireAuth(
  request: Request,
  minRole: UserRole | UserRole[]
): Promise<AuthUser | null> {
  // Extract session from cookie
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/crm_session=([^;]+)/);
  if (!match) return null;

  // Verify session — call DB
  // ... (lásd middleware-t)

  const allowedRoles = Array.isArray(minRole) ? minRole : [minRole];
  const minLevel = Math.min(...allowedRoles.map(r => ROLE_HIERARCHY[r]));

  if (ROLE_HIERARCHY[user.role] < minLevel) return null;
  return user;
}
```

---

## 5. Audit log helper

Cél: minden admin/super admin művelet automatikusan loggolva.

### `src/lib/audit/log.ts`

```typescript
export interface AuditLogEntry {
  performedBy: number;
  action: string;                // 'expense.create', 'staff.update', etc.
  entityType: string;            // 'expense' | 'worker' | 'damage_report'
  entityId?: number;
  before?: unknown;              // JSON-serializable snapshot
  after?: unknown;
  request?: Request;
  notes?: string;
}

export async function auditLog(
  db: D1Database,
  entry: AuditLogEntry
): Promise<void> {
  const ip = entry.request?.headers.get('cf-connecting-ip') || null;
  const ua = entry.request?.headers.get('user-agent') || null;

  await db.prepare(
    `INSERT INTO crm_audit_log
     (performed_by, action, entity_type, entity_id, before_json, after_json, ip_address, user_agent, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    entry.performedBy,
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    entry.before ? JSON.stringify(entry.before) : null,
    entry.after ? JSON.stringify(entry.after) : null,
    ip,
    ua,
    entry.notes ?? null
  ).run();
}
```

### Használat egy expense create-nél

```typescript
import { auditLog } from '@/lib/audit/log';

// In API handler:
const result = await db.prepare(`INSERT INTO expenses ...`).bind(...).run();
const newExpense = await db.prepare(`SELECT * FROM expenses WHERE id = ?`).bind(result.meta.last_row_id).first();

await auditLog(db, {
  performedBy: user.id,
  action: 'expense.create',
  entityType: 'expense',
  entityId: result.meta.last_row_id as number,
  after: newExpense,
  request,
});
```

### Update-nél (before + after)

```typescript
const before = await db.prepare(`SELECT * FROM expenses WHERE id = ?`).bind(expenseId).first();
await db.prepare(`UPDATE expenses SET ... WHERE id = ?`).bind(...).run();
const after = await db.prepare(`SELECT * FROM expenses WHERE id = ?`).bind(expenseId).first();

await auditLog(db, {
  performedBy: user.id,
  action: 'expense.update',
  entityType: 'expense',
  entityId: expenseId,
  before, after, request,
});
```

---

## 6. Soft delete pattern

### Helper funkció

```typescript
// src/lib/db/soft-delete.ts
export async function softDelete(
  db: D1Database,
  table: string,
  id: number,
  deletedBy: number
): Promise<void> {
  // Whitelist tables (SQL injection protection)
  const ALLOWED = [
    'workers', 'customers', 'expenses', 'damage_reports',
    'walkin_transactions', 'invoices', 'staff_payments',
    'daily_summary', 'staff_attendance'
  ];
  if (!ALLOWED.includes(table)) {
    throw new Error(`Soft delete not allowed for table: ${table}`);
  }

  await db.prepare(
    `UPDATE ${table} SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ?`
  ).bind(deletedBy, id).run();
}

/** Super admin only — hard delete (purge) */
export async function hardDelete(
  db: D1Database,
  table: string,
  id: number
): Promise<void> {
  // Same whitelist
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
}
```

### Query rule

**MINDIG a `live_*` view-ket használjuk olvasásnál** — nem közvetlenül a táblákat. Ezt code review-on ellenőrizni kell.

---

## 7. i18n + RTL

### Stack: paraglide-js + Astro 6

```bash
npm install @inlang/paraglide-js
npx paraglide-js init
```

### `project.inlang/settings.json`

```json
{
  "sourceLanguageTag": "en",
  "languageTags": ["en", "ar-EG"],
  "modules": ["@inlang/plugin-message-format"],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{languageTag}.json"
  }
}
```

### `messages/en.json`

```json
{
  "daily_form_title": "Daily Reconciliation",
  "cash_total": "Cash counted",
  "card_total": "Card total",
  "cars_inside": "Cars (inside & out)",
  "cars_outside": "Cars (outside only)",
  "submit_and_lock": "Submit and lock day",
  "variance_short": "SHORT — please add notes"
}
```

### `messages/ar-EG.json` (egyiptomi arab)

```json
{
  "daily_form_title": "تسوية يومية",
  "cash_total": "الكاش المعدود",
  "card_total": "إجمالي البطاقة",
  "cars_inside": "العربيات (جوّه وبرّه)",
  "cars_outside": "العربيات (برّه بس)",
  "submit_and_lock": "أكّد و اقفل اليوم",
  "variance_short": "ناقص — اكتب ملاحظات"
}
```

### Astro layout — RTL handling

```astro
---
// src/layouts/BaseLayout.astro
import { languageTag } from '@/paraglide/runtime';

const lang = languageTag();
const dir = lang === 'ar-EG' ? 'rtl' : 'ltr';
---
<html lang={lang} dir={dir}>
  <head>
    ...
  </head>
  <body class={dir === 'rtl' ? 'font-arabic' : 'font-sans'}>
    <slot />
  </body>
</html>
```

### Tailwind RTL config

```js
// tailwind.config.mjs
export default {
  // ...
  plugins: [
    require('@tailwindcss/forms'),
    // RTL automatic flipping a logical properties-en keresztül
  ],
};
```

**Szabály**: Tailwind logical utilities használata fizikai helyett.

| Fizikai | Logikai (RTL-aware) |
|---|---|
| `ml-2` | `ms-2` (margin-start) |
| `mr-2` | `me-2` (margin-end) |
| `pl-4` | `ps-4` |
| `pr-4` | `pe-4` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `border-l` | `border-s` |
| `rounded-l` | `rounded-s` |

### Number formatting

**Mindig western numerals (1234567890), NEM keleti arab (٠١٢٣٤٥٦٧٨٩)** — könyvelési és jogi szempontból cleaner.

```typescript
new Intl.NumberFormat('en-GB', {
  numberingSystem: 'latn',  // erőltesd a latin (western) számokat
  style: 'currency',
  currency: 'GBP',
}).format(520);
// "£520.00"
```

### Language switcher

```tsx
// src/components/LanguageSwitcher.tsx
import { setLanguageTag, languageTag } from '@/paraglide/runtime';

export function LanguageSwitcher() {
  const current = languageTag();
  return (
    <div className="flex gap-2">
      <button
        onClick={() => { setLanguageTag('en'); location.reload(); }}
        className={current === 'en' ? 'font-bold' : ''}
      >
        EN
      </button>
      <button
        onClick={() => { setLanguageTag('ar-EG'); location.reload(); }}
        className={current === 'ar-EG' ? 'font-bold' : ''}
      >
        عربي
      </button>
    </div>
  );
}
```

A választott nyelv cookie-ban: `lang=ar-EG; SameSite=Lax; Path=/`.

---

## 8. Stripe scaffolding

**Cél**: minden Stripe kód felépítve, env vars dokumentálva. Feature flag-gel kikapcsolva. Élesítéshez csak:
1. Cloudflare-be hozzáadod a 3 env var-t
2. Settings táblában `stripe_enabled='1'`
3. Deploy nem kell — settings élesben szerkeszthető

### Env vars (wrangler.toml — placeholder, secret-ként hozzáadod)

```toml
# A vars helyett SECRET-ekként add hozzá éles deploy-kor:
# wrangler secret put STRIPE_SECRET_KEY
# wrangler secret put STRIPE_WEBHOOK_SECRET
# wrangler secret put STRIPE_PUBLIC_KEY
```

### Feature flag check

```typescript
// src/lib/stripe/enabled.ts
export async function isStripeEnabled(db: D1Database): Promise<boolean> {
  const row = await db.prepare(
    `SELECT value FROM settings WHERE key = 'stripe_enabled'`
  ).first<{ value: string }>();
  return row?.value === '1';
}
```

### Payment intent creation

```typescript
// src/pages/api/stripe/create-payment-intent.ts
import type { APIRoute } from 'astro';
import { isStripeEnabled } from '@/lib/stripe/enabled';
import { z } from 'zod';

const Schema = z.object({
  amount: z.number().int().positive(),  // pence
  bookingId: z.number().int().optional(),
  walkinId: z.number().int().optional(),
  customerEmail: z.string().email().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  if (!await isStripeEnabled(env.DB)) {
    return new Response(JSON.stringify({ error: 'Payments disabled' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY not set despite stripe_enabled=1');
    return new Response('Configuration error', { status: 500 });
  }

  const body = Schema.parse(await request.json());

  // Stripe API call (no SDK — fetch-based to avoid bloat)
  const params = new URLSearchParams({
    amount: String(body.amount),
    currency: 'gbp',
    'automatic_payment_methods[enabled]': 'true',
  });
  if (body.customerEmail) params.set('receipt_email', body.customerEmail);
  if (body.bookingId) params.set('metadata[booking_id]', String(body.bookingId));
  if (body.walkinId) params.set('metadata[walkin_id]', String(body.walkinId));

  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Stripe error:', err);
    return new Response('Stripe error', { status: 502 });
  }

  const pi = await res.json() as { id: string; client_secret: string };

  // Record on our side
  if (body.bookingId) {
    await env.DB.prepare(
      `UPDATE bookings SET stripe_payment_intent_id = ?, stripe_status = 'requires_payment_method', stripe_amount = ? WHERE id = ?`
    ).bind(pi.id, body.amount, body.bookingId).run();
  }

  return new Response(JSON.stringify({
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
  }), { headers: { 'content-type': 'application/json' } });
};
```

### Webhook handler

```typescript
// src/pages/api/stripe/webhook.ts
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  // Even if Stripe disabled, accept webhooks gracefully (just log)
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.warn('Stripe webhook received but no secret configured — ignoring');
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  // Verify signature
  const isValid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);

  // Idempotency — D1 PRIMARY KEY conflict will reject duplicates
  try {
    await env.DB.prepare(
      `INSERT INTO stripe_webhook_events (id, event_type, raw_payload, payment_intent_id, status)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      event.id,
      event.type,
      body,
      event.data?.object?.id ?? null,
      event.data?.object?.status ?? null
    ).run();
  } catch (e) {
    // Duplicate event — already processed
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  // Process event types
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      const bookingId = pi.metadata?.booking_id;
      const walkinId = pi.metadata?.walkin_id;

      if (bookingId) {
        await env.DB.prepare(
          `UPDATE bookings SET stripe_status = 'succeeded', paid_at = datetime('now') WHERE id = ?`
        ).bind(parseInt(bookingId)).run();
      }
      if (walkinId) {
        await env.DB.prepare(
          `UPDATE walkin_transactions SET stripe_status = 'succeeded' WHERE id = ?`
        ).bind(parseInt(walkinId)).run();
      }
      break;
    }
    case 'payment_intent.payment_failed':
      // Handle failure
      break;
    // ...
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};

async function verifyStripeSignature(
  body: string,
  header: string | null,
  secret: string
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return expected === parts.v1;
}
```

### UI — feature-flagged

```tsx
// src/components/PaymentButton.tsx
import { useEffect, useState } from 'react';

export function PaymentButton({ amount, bookingId }: { amount: number; bookingId: number }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(s => setEnabled(s.stripe_enabled === '1'));
  }, []);

  if (!enabled) return null;  // Stripe disabled — render nothing

  return <button onClick={async () => { /* Stripe Elements flow */ }}>
    Pay £{(amount / 100).toFixed(2)}
  </button>;
}
```

### Élesítés checklist

1. [ ] `wrangler secret put STRIPE_SECRET_KEY` (sk_live_...)
2. [ ] `wrangler secret put STRIPE_WEBHOOK_SECRET` (whsec_...)
3. [ ] `wrangler secret put STRIPE_PUBLIC_KEY` (pk_live_...)
4. [ ] Stripe Dashboard → Webhooks → add `https://app.bristolcarwash.co.uk/api/stripe/webhook`
5. [ ] Stripe Dashboard → enable Payment methods (Apple Pay, Google Pay, Card)
6. [ ] Settings tábla: `UPDATE settings SET value='1' WHERE key='stripe_enabled'`
7. [ ] Test: hozz létre egy £0.30-os payment intentet, sikerüljön
8. [ ] Test mode-ot kapcsold ki: `UPDATE settings SET value='0' WHERE key='stripe_test_mode'`

---

## 9. Cash variance computation

```typescript
// src/lib/finance/variance.ts

export interface VarianceData {
  expectedCash: number;       // pence
  expectedCard: number;
  actualCash: number;
  actualCard: number;
  cashVariance: number;       // negative = short
  cardVariance: number;
  severity: 'ok' | 'minor' | 'major';
  requiresNotes: boolean;
}

export async function computeExpected(
  db: D1Database,
  date: string  // YYYY-MM-DD
): Promise<{ expectedCash: number; expectedCard: number }> {
  // Bookings completed today
  const bookings = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN price_snapshot ELSE 0 END), 0) AS cash,
       COALESCE(SUM(CASE WHEN payment_method = 'card' THEN price_snapshot ELSE 0 END), 0) AS card
     FROM bookings
     WHERE date(starts_at) = ? AND status = 'completed'`
  ).bind(date).first<{ cash: number; card: number }>();

  // Walk-ins
  const walkins = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN price ELSE 0 END), 0) AS cash,
       COALESCE(SUM(CASE WHEN payment_method = 'card' THEN price ELSE 0 END), 0) AS card
     FROM live_walkin_transactions
     WHERE date = ?`
  ).bind(date).first<{ cash: number; card: number }>();

  return {
    expectedCash: (bookings?.cash ?? 0) + (walkins?.cash ?? 0),
    expectedCard: (bookings?.card ?? 0) + (walkins?.card ?? 0),
  };
}

export function computeVariance(
  expected: { expectedCash: number; expectedCard: number },
  actual: { cashTotal: number; cardTotal: number },
  thresholdPence = 500   // £5
): VarianceData {
  const cashVariance = actual.cashTotal - expected.expectedCash;
  const cardVariance = actual.cardTotal - expected.expectedCard;

  const absCashVar = Math.abs(cashVariance);
  let severity: VarianceData['severity'] = 'ok';
  if (absCashVar > thresholdPence) severity = 'major';
  else if (absCashVar > 0) severity = 'minor';

  return {
    expectedCash: expected.expectedCash,
    expectedCard: expected.expectedCard,
    actualCash: actual.cashTotal,
    actualCard: actual.cardTotal,
    cashVariance,
    cardVariance,
    severity,
    requiresNotes: severity === 'major',
  };
}
```

---

## 10. Daily summary email cron

### `src/lib/cron/daily-summary.ts`

```typescript
export async function sendDailySummary(env: Env, date: string): Promise<void> {
  // Aggregate
  const summary = await env.DB.prepare(
    `SELECT * FROM live_daily_summary WHERE date = ?`
  ).bind(date).first();

  const expenses = await env.DB.prepare(
    `SELECT category, SUM(amount) as total FROM live_expenses WHERE date = ? GROUP BY category`
  ).bind(date).all();

  const damage = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM live_damage_reports WHERE date = ?`
  ).bind(date).first<{ cnt: number }>();

  const staff = await env.DB.prepare(
    `SELECT w.name, sa.shift FROM live_staff_attendance sa
     JOIN workers w ON w.id = sa.worker_id
     WHERE sa.date = ?`
  ).bind(date).all();

  const cars = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM bookings WHERE date(starts_at) = ? AND status='completed') as bookings,
       (SELECT COUNT(*) FROM live_walkin_transactions WHERE date = ?) as walkins`
  ).bind(date, date).first<{ bookings: number; walkins: number }>();

  // Get super admin email from settings
  const settings = await env.DB.prepare(
    `SELECT value FROM settings WHERE key = 'super_admin_email'`
  ).first<{ value: string }>();

  if (!settings?.value) {
    console.error('No super_admin_email configured');
    return;
  }

  const html = renderDailySummaryHtml({ date, summary, expenses: expenses.results, damage, staff: staff.results, cars });

  // Send via Resend
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Bristol Car Wash <reports@bristolcarwash.co.uk>',
      to: [settings.value],
      subject: `Daily summary — ${date}`,
      html,
    }),
  });

  // Log result
  const responseData = await res.json() as { id?: string; error?: string };
  await env.DB.prepare(
    `INSERT INTO daily_email_log (date, recipient, resend_message_id, status, error_message)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       sent_at = CURRENT_TIMESTAMP,
       resend_message_id = excluded.resend_message_id,
       status = excluded.status,
       error_message = excluded.error_message`
  ).bind(
    date,
    settings.value,
    responseData.id ?? null,
    res.ok ? 'sent' : 'failed',
    res.ok ? null : (responseData.error ?? 'unknown')
  ).run();
}
```

### Cron trigger (wrangler.toml)

```toml
[triggers]
crons = [
  "5 18 * * *",   # 5 perccel 18:00 után — admin reminder
  "20 18 * * *",  # 20 perccel 18:00 után — super admin warning
  "0 22 * * *",   # 22:00 — daily summary email
]
```

### Cron handler

```typescript
// src/cron-worker.ts
export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const cron = controller.cron;
    const today = new Date().toISOString().split('T')[0];

    if (cron === '5 18 * * *') {
      await sendAdminReminderIfMissing(env, today);
    } else if (cron === '20 18 * * *') {
      await sendSuperAdminWarningIfMissing(env, today);
    } else if (cron === '0 22 * * *') {
      await sendDailySummary(env, today);
    }
  },
};
```

---

## 11. Receipt OCR (Stage 1.5)

### Anthropic Vision API hívás

```typescript
// src/lib/ocr/receipt.ts
export interface OcrResult {
  amount?: number;          // pence
  vendor?: string;
  date?: string;            // ISO
  confidence: number;       // 0-1
  raw: string;
}

export async function ocrReceipt(
  apiKey: string,
  r2SignedUrl: string
): Promise<OcrResult> {
  // Download image from R2
  const imgRes = await fetch(r2SignedUrl);
  const imgBlob = await imgRes.blob();
  const arrayBuffer = await imgBlob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/webp', data: base64 },
          },
          {
            type: 'text',
            text: `Extract from this receipt:
1. Total amount in pence (e.g. £12.50 → 1250)
2. Vendor name
3. Date in YYYY-MM-DD format

Return ONLY JSON: {"amount": 1250, "vendor": "Tesco", "date": "2026-04-27", "confidence": 0.95}
If anything unclear, include in confidence (0-1).`,
          },
        ],
      }],
    }),
  });

  const data = await res.json() as { content: Array<{ text: string }> };
  const text = data.content[0]?.text ?? '';
  const cleaned = text.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return { ...parsed, raw: text };
  } catch {
    return { confidence: 0, raw: text };
  }
}
```

Köszönik **£0.001 / fotó** Haiku 4.5-tel — bőven olcsó.

---

**Vége — Claude Code-nak ezzel a 3 dokumentummal indulhat el a Phase 0.**
