export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb, getEnv } from '../../../lib/db';
import { verifyStripeSignature } from '../../../lib/stripe/signature';

interface StripeEventEnvelope {
  id: string;
  type: string;
  data?: { object?: StripeEventObject };
}

interface StripeEventObject {
  id?: string;
  status?: string;
  amount?: number;
  customer?: string;
  metadata?: Record<string, string>;
}

export const POST: APIRoute = async ({ request }) => {
  // ALWAYS read the raw body BEFORE any other parsing — signature is computed
  // over the exact bytes Stripe sent.
  const rawBody = await request.text();
  const env = getEnv();

  // No webhook secret configured -> Stripe is mid-bootstrap or disabled.
  // Acknowledge with 200 so Stripe doesn't keep retrying, but don't process.
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.warn('[stripe] webhook received but STRIPE_WEBHOOK_SECRET is unset — ignoring');
    return ack();
  }

  const sigHeader = request.headers.get('stripe-signature');
  const verify = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!verify.ok) {
    console.warn('[stripe] webhook signature verification failed:', verify.reason);
    return new Response(`Invalid signature: ${verify.reason ?? 'unknown'}`, { status: 400 });
  }

  let event: StripeEventEnvelope;
  try {
    event = JSON.parse(rawBody) as StripeEventEnvelope;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!event.id || !event.type) {
    return new Response('Malformed event', { status: 400 });
  }

  const db = getDb();
  const obj = event.data?.object;

  // Idempotency: stripe_webhook_events.id is PRIMARY KEY. If we've already
  // processed this event id, the INSERT throws and we 200 without re-acting.
  try {
    await db
      .prepare(
        `INSERT INTO stripe_webhook_events
           (id, event_type, payment_intent_id, customer_id, amount, status, raw_payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.id,
        event.type,
        obj?.id ?? null,
        obj?.customer ?? null,
        obj?.amount ?? null,
        obj?.status ?? null,
        rawBody,
      )
      .run();
  } catch {
    // Duplicate id -> already handled. Don't re-process side effects.
    return ack({ duplicate: true });
  }

  // Apply event side effects. Keep this minimal and additive — every branch
  // tolerates missing metadata so a malformed event from test mode doesn't
  // 500. Currently we only act on payment_intent lifecycle.
  if (event.type === 'payment_intent.succeeded' && obj?.id) {
    await markPaid(db, obj);
  } else if (event.type === 'payment_intent.payment_failed' && obj?.id) {
    await markFailed(db, obj);
  } else if (event.type === 'payment_intent.canceled' && obj?.id) {
    await markCanceled(db, obj);
  }

  return ack();
};

async function markPaid(db: D1Database, obj: StripeEventObject): Promise<void> {
  const intentId = obj.id!;
  const status = obj.status ?? 'succeeded';
  const bookingId = parseIntOrNull(obj.metadata?.booking_id);
  const walkinId = parseIntOrNull(obj.metadata?.walkin_id);

  if (bookingId) {
    await db
      .prepare(
        `UPDATE bookings
         SET stripe_status = ?, paid_at = COALESCE(paid_at, datetime('now'))
         WHERE (id = ? OR stripe_payment_intent_id = ?) AND deleted_at IS NULL`,
      )
      .bind(status, bookingId, intentId)
      .run();
  } else if (walkinId) {
    await db
      .prepare(
        `UPDATE walkin_transactions
         SET stripe_status = ?
         WHERE (id = ? OR stripe_payment_intent_id = ?) AND deleted_at IS NULL`,
      )
      .bind(status, walkinId, intentId)
      .run();
  } else {
    // No metadata — best-effort match by intent id alone
    await db
      .prepare(
        `UPDATE bookings
         SET stripe_status = ?, paid_at = COALESCE(paid_at, datetime('now'))
         WHERE stripe_payment_intent_id = ? AND deleted_at IS NULL`,
      )
      .bind(status, intentId)
      .run();
  }
}

async function markFailed(db: D1Database, obj: StripeEventObject): Promise<void> {
  const intentId = obj.id!;
  await db
    .prepare(
      `UPDATE bookings SET stripe_status = ? WHERE stripe_payment_intent_id = ? AND deleted_at IS NULL`,
    )
    .bind(obj.status ?? 'requires_payment_method', intentId)
    .run();
  await db
    .prepare(
      `UPDATE walkin_transactions SET stripe_status = ? WHERE stripe_payment_intent_id = ? AND deleted_at IS NULL`,
    )
    .bind(obj.status ?? 'requires_payment_method', intentId)
    .run();
}

async function markCanceled(db: D1Database, obj: StripeEventObject): Promise<void> {
  const intentId = obj.id!;
  await db
    .prepare(
      `UPDATE bookings SET stripe_status = 'canceled' WHERE stripe_payment_intent_id = ? AND deleted_at IS NULL`,
    )
    .bind(intentId)
    .run();
  await db
    .prepare(
      `UPDATE walkin_transactions SET stripe_status = 'canceled' WHERE stripe_payment_intent_id = ? AND deleted_at IS NULL`,
    )
    .bind(intentId)
    .run();
}

function parseIntOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function ack(extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ received: true, ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
