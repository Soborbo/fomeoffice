// GET /api/stripe/public-key
//
// Returns the Stripe publishable key for client-side Elements initialization.
// Gated behind settings.stripe_enabled='1' AND env.STRIPE_PUBLIC_KEY being
// set. Either gate failure → 503 (so the booking form can degrade gracefully
// to "pay on arrival").
//
// Public route. The publishable key is, as the name suggests, safe to expose.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb, getEnv } from '../../../lib/db';
import { isStripeEnabled, isStripeTestMode } from '../../../lib/stripe/enabled';

export const GET: APIRoute = async () => {
  const db = getDb();
  const env = getEnv();

  if (!(await isStripeEnabled(db))) {
    return json({ enabled: false }, 503);
  }
  if (!env.STRIPE_PUBLIC_KEY) {
    console.warn('[stripe] stripe_enabled=1 but STRIPE_PUBLIC_KEY is missing');
    return json({ enabled: false, error: 'Public key not configured' }, 503);
  }

  return new Response(
    JSON.stringify({
      enabled: true,
      publicKey: env.STRIPE_PUBLIC_KEY,
      testMode: await isStripeTestMode(db),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Browser-side cache for a minute — the publishable key doesn't churn,
        // and we don't want every booking modal open to hit the DB.
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
