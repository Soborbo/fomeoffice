export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb, getEnv, getRequestIp } from '../../../lib/db';
import { isStripeEnabled } from '../../../lib/stripe/enabled';
import { createPaymentIntent } from '../../../lib/stripe/api';

const Schema = z.object({
  amount_pence: z.coerce.number().int().positive().max(1_000_000),
  booking_id: z.coerce.number().int().positive().optional(),
  walkin_id: z.coerce.number().int().positive().optional(),
  customer_email: z.string().email().optional().or(z.literal('')),
});

export const POST: APIRoute = async (context) => {
  const { request } = context;

  const db = getDb();

  if (!(await isStripeEnabled(db))) {
    return json({ error: 'Payments are not enabled' }, 503);
  }

  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) {
    console.error('[stripe] stripe_enabled=1 but STRIPE_SECRET_KEY is missing');
    return json({ error: 'Payment configuration error' }, 500);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.flatten() }, 400);
  }

  if (!parsed.data.booking_id && !parsed.data.walkin_id) {
    return json({ error: 'Either booking_id or walkin_id is required' }, 400);
  }

  // Idempotency: tie the Stripe request to a stable key per booking/walkin
  // so retries from the same client never double-charge.
  const idempotencyKey = parsed.data.booking_id
    ? `booking:${parsed.data.booking_id}`
    : `walkin:${parsed.data.walkin_id}`;

  const result = await createPaymentIntent({
    secretKey: env.STRIPE_SECRET_KEY,
    amountPence: parsed.data.amount_pence,
    receiptEmail: parsed.data.customer_email || null,
    metadata: {
      booking_id: parsed.data.booking_id,
      walkin_id: parsed.data.walkin_id,
      ip: getRequestIp(context),
    },
    idempotencyKey,
  });

  if (!result.ok) {
    console.error('[stripe] createPaymentIntent failed:', result.status, result.error);
    return json({ error: result.error.message ?? 'Stripe error' }, 502);
  }

  // Snapshot intent id + amount on the booking/walkin row so reconciliation
  // can join Stripe events back later.
  if (parsed.data.booking_id) {
    await db
      .prepare(
        `UPDATE bookings
         SET stripe_payment_intent_id = ?, stripe_status = ?, stripe_amount = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(result.data.id, result.data.status, parsed.data.amount_pence, parsed.data.booking_id)
      .run();
  } else if (parsed.data.walkin_id) {
    await db
      .prepare(
        `UPDATE walkin_transactions
         SET stripe_payment_intent_id = ?, stripe_status = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(result.data.id, result.data.status, parsed.data.walkin_id)
      .run();
  }

  return json({
    client_secret: result.data.client_secret,
    payment_intent_id: result.data.id,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
