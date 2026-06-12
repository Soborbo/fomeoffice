// Fetch-based Stripe API helpers. We avoid the official SDK to keep the
// Worker bundle small (the SDK pulls in Node-only deps).

const STRIPE_API = 'https://api.stripe.com/v1';

export interface StripeError {
  type: string;
  code?: string;
  message?: string;
  param?: string;
}

export interface StripePaymentIntent {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  currency: string;
}

export interface CreatePaymentIntentInput {
  secretKey: string;
  amountPence: number;
  currency?: string;
  receiptEmail?: string | null;
  metadata?: Record<string, string | number | undefined | null>;
  idempotencyKey?: string;
}

export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<{ ok: true; data: StripePaymentIntent } | { ok: false; error: StripeError; status: number }> {
  const params = new URLSearchParams();
  params.set('amount', String(input.amountPence));
  params.set('currency', (input.currency ?? 'gbp').toLowerCase());
  params.set('automatic_payment_methods[enabled]', 'true');
  if (input.receiptEmail) params.set('receipt_email', input.receiptEmail);
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      if (v == null) continue;
      params.set(`metadata[${k}]`, String(v));
    }
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${input.secretKey}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey;

  const res = await fetch(`${STRIPE_API}/payment_intents`, {
    method: 'POST',
    headers,
    body: params,
  });

  if (!res.ok) {
    const body = await safeJson<{ error?: StripeError }>(res);
    return {
      ok: false,
      status: res.status,
      error: body?.error ?? { type: 'api_error', message: 'Unknown Stripe error' },
    };
  }

  const data = await res.json<StripePaymentIntent>();
  return { ok: true, data };
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return await res.json<T>();
  } catch {
    return null;
  }
}
