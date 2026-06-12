export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb, getEnv } from '../../lib/db';
import { listWalkinLog, listWalkinRecorders } from '../../lib/db/walkins';
import { isLegacyFallbackEnabled, verifyWorkerPin } from '../../lib/auth/worker-pin';
import type { VerifiedWorker } from '../../lib/auth/worker-pin';

const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const RequestSchema = z.object({
  pin: z.string().min(4).max(8),
  from: DateStr.optional(),
  to: DateStr.optional(),
  recorded_by: z.coerce.number().int().positive().optional(),
  payment_method: z.enum(['cash', 'card']).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
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
    return json({ error: 'Invalid request' }, 400);
  }

  const env = getEnv();
  const db = getDb();

  // Mirror the board's auth (per-worker PIN, with the legacy BOARD_PIN
  // fallback) so the log is reachable from any active board session.
  let worker: VerifiedWorker | null = await verifyWorkerPin(db, parsed.data.pin);
  if (!worker && (await isLegacyFallbackEnabled(db))) {
    if (env.BOARD_PIN && parsed.data.pin === env.BOARD_PIN) {
      worker = { id: 0, name: 'Legacy BOARD_PIN', role: 'worker' };
    }
  }
  if (!worker) {
    return json({ error: 'Invalid PIN' }, 401);
  }

  const [walkins, recorders] = await Promise.all([
    listWalkinLog(db, {
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      recordedBy: parsed.data.recorded_by ?? null,
      paymentMethod: parsed.data.payment_method ?? null,
      limit: parsed.data.limit,
    }),
    listWalkinRecorders(db),
  ]);

  return json({ walkins, recorders });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
