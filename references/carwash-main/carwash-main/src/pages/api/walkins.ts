export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb, getEnv } from '../../lib/db';
import {
  findOrCreateCustomerByEmailMinimal,
  insertWalkin,
  todayInTimezone,
} from '../../lib/db/walkins';
import { auditLog } from '../../lib/audit/log';
import { verifyWorkerPin } from '../../lib/auth/worker-pin';
import { issueInvoice } from '../../lib/invoice-orchestrator';

const CAR_SIZES = ['small', 'large', 'suv', 'camper', 'sports'] as const;
const SERVICE_TYPES = ['inside_only', 'outside_only', 'inside_and_outside'] as const;
const PAYMENT_METHODS = ['cash', 'card'] as const;

const RequestSchema = z.object({
  pin: z.string().min(4).max(8),
  car_size: z.enum(CAR_SIZES),
  service_type: z.enum(SERVICE_TYPES),
  price_pence: z.coerce.number().int().positive().max(100_000),
  payment_method: z.enum(PAYMENT_METHODS),
  customer_email: z.string().email().max(254).optional().or(z.literal('')),
  marketing_opt_in: z.coerce.boolean().optional().default(false),
});

export const POST: APIRoute = async ({ request }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const worker = await verifyWorkerPin(db, parsed.data.pin);
  if (!worker) {
    return json({ error: 'Invalid PIN' }, 401);
  }

  if (parsed.data.marketing_opt_in && !parsed.data.customer_email) {
    return json({ error: 'Marketing opt-in requires an email' }, 400);
  }

  const today = todayInTimezone();

  let customerId: number | null = null;
  if (parsed.data.customer_email) {
    customerId = await findOrCreateCustomerByEmailMinimal(
      db,
      parsed.data.customer_email,
      parsed.data.marketing_opt_in,
    );
  }

  const walkinId = await insertWalkin(db, {
    date: today,
    carSize: parsed.data.car_size,
    serviceType: parsed.data.service_type,
    pricePence: parsed.data.price_pence,
    paymentMethod: parsed.data.payment_method,
    customerEmail: parsed.data.customer_email || null,
    customerId,
    marketingOptIn: parsed.data.marketing_opt_in,
    recordedBy: worker.id,
  });

  await auditLog(db, {
    performedBy: worker.id,
    action: 'walkin.create',
    entityType: 'walkin_transaction',
    entityId: walkinId,
    after: {
      car_size: parsed.data.car_size,
      service_type: parsed.data.service_type,
      price_pence: parsed.data.price_pence,
      payment_method: parsed.data.payment_method,
      has_email: !!parsed.data.customer_email,
      marketing_opt_in: parsed.data.marketing_opt_in,
    },
    request,
  });

  // Best-effort invoice email — never blocks the walkin save.
  let invoice_status: 'sent' | 'failed' | 'no_resend_key' | 'draft' | 'no_email' | undefined;
  let invoice_number: string | undefined;
  if (parsed.data.customer_email) {
    const env = getEnv();
    const result = await issueInvoice({
      db,
      resendApiKey: env.RESEND_API_KEY,
      customer_id: customerId,
      customer_email: parsed.data.customer_email,
      customer_name: null,
      marketing_opt_in: parsed.data.marketing_opt_in,
      amount_pence: parsed.data.price_pence,
      items: [
        {
          description: walkinDescription(parsed.data.car_size, parsed.data.service_type),
          qty: 1,
          unit_price: parsed.data.price_pence,
          total: parsed.data.price_pence,
        },
      ],
      walkin_id: walkinId,
      visit_date: today,
    });
    if (result.ok) {
      invoice_status = result.email_status;
      invoice_number = result.invoice_number;
    } else {
      invoice_status = result.reason === 'no_email' ? 'no_email' : 'failed';
    }
  }

  return json({
    success: true,
    walkinId,
    recordedBy: worker.name,
    invoice_status,
    invoice_number,
  });
};

function walkinDescription(
  carSize: string,
  serviceType: 'inside_only' | 'outside_only' | 'inside_and_outside',
): string {
  const sizeLabel = carSize.charAt(0).toUpperCase() + carSize.slice(1);
  const serviceLabel = {
    inside_only: 'inside only',
    outside_only: 'outside only',
    inside_and_outside: 'inside & outside',
  }[serviceType];
  return `${sizeLabel} car wash (${serviceLabel})`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
