export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { setRowColor, updateCell } from '../../lib/google-sheets';
import { getDb, getEnv } from '../../lib/db';
import {
  bookingHasInvoice,
  boardStatusToDb,
  dbStatusToBoard,
  getBookingForInvoice,
  getBookingForUpdate,
  listBoardBookings,
  updateBookingStatus,
} from '../../lib/db/bookings';
import { bookingLog } from '../../lib/audit/log';
import { isLegacyFallbackEnabled, verifyWorkerPin } from '../../lib/auth/worker-pin';
import type { VerifiedWorker } from '../../lib/auth/worker-pin';
import { getTodayWalkinsSummary, todayInTimezone } from '../../lib/db/walkins';
import { issueInvoice } from '../../lib/invoice-orchestrator';

const RequestSchema = z.union([
  z.object({
    pin: z.string().min(4).max(8),
    action: z.literal('setStatus'),
    row: z.coerce.number().int().positive(),
    status: z.string().max(40),
    // Only meaningful when transitioning to "Done". Workers tap Cash or Card on
    // the board; we persist it so the CRM revenue queries can attribute the
    // booking to the right pot (the daily reconciliation requires this).
    payment_method: z.enum(['cash', 'card']).optional(),
  }),
  z.object({
    pin: z.string().min(4).max(8),
  }),
]);

export const POST: APIRoute = async (context) => {
  const { request } = context;

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

  // ----- Authenticate the worker by PIN ----------------------------------
  let worker: VerifiedWorker | null = await verifyWorkerPin(db, parsed.data.pin);

  if (!worker && (await isLegacyFallbackEnabled(db))) {
    const legacyPin = env.BOARD_PIN;
    if (legacyPin && parsed.data.pin === legacyPin) {
      worker = { id: 0, name: 'Legacy BOARD_PIN', role: 'worker' };
    }
  }

  if (!worker) {
    return json({ error: 'Invalid PIN' }, 401);
  }

  // ----- Status update --------------------------------------------------
  if ('action' in parsed.data && parsed.data.action === 'setStatus') {
    const newDbStatus = boardStatusToDb(parsed.data.status);

    const existing = await getBookingForUpdate(db, parsed.data.row);
    if (!existing) {
      return json({ error: 'Booking not found' }, 404);
    }

    // A booking only counts toward CRM revenue once it has both
    // status='done' AND a payment_method. The board MUST send a payment
    // method when marking Done; refuse the transition otherwise so we
    // don't end up with the same "invisible bookings" problem again.
    if (newDbStatus === 'done' && !parsed.data.payment_method) {
      return json(
        { error: 'Payment method required for Done', code: 'PAYMENT_METHOD_REQUIRED' },
        400,
      );
    }

    // Clear payment_method on any non-done transition so an Undo doesn't
    // leave stale cash/card data attached to a row that's no longer "Done".
    const newPaymentMethod =
      newDbStatus === 'done' ? parsed.data.payment_method ?? null : null;

    const before = { status: existing.status, payment_method: existing.payment_method };
    await updateBookingStatus(db, existing.id, newDbStatus, newPaymentMethod);

    await bookingLog(db, {
      bookingId: existing.id,
      action: `status_${newDbStatus}`,
      actorType: worker.id === 0 ? 'system' : worker.role,
      actorWorkerId: worker.id || null,
      before,
      after: { status: newDbStatus, payment_method: newPaymentMethod },
      request,
    });

    // Best-effort Sheets sync (only if we have a sheet_row link).
    if (existing.sheet_row) {
      const sheetsEnv = {
        email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        privateKey: env.GOOGLE_PRIVATE_KEY,
        spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
      };
      const sheetStatus = dbStatusToBoard(newDbStatus);
      const colorMap: Record<string, { red: number; green: number; blue: number } | null> = {
        Done: { red: 0.85, green: 0.95, blue: 0.85 },
        'No Show': { red: 0.97, green: 0.85, blue: 0.85 },
        '': null,
      };
      const color = colorMap[sheetStatus] ?? null;

      // Don't await — fire-and-forget so the API stays snappy. Errors are logged.
      Promise.all([
        updateCell(`R${existing.sheet_row}`, sheetStatus, sheetsEnv),
        setRowColor(existing.sheet_row, color, sheetsEnv),
      ]).catch((err) => console.error('[bookings] Sheets sync failed:', err));
    }

    // Best-effort invoice email when transitioning to 'done'.
    let invoice_status: 'sent' | 'failed' | 'no_resend_key' | 'draft' | 'skipped' | undefined;
    let invoice_number: string | undefined;
    if (newDbStatus === 'done') {
      const alreadyInvoiced = await bookingHasInvoice(db, existing.id);
      if (!alreadyInvoiced) {
        const booking = await getBookingForInvoice(db, existing.id);
        if (booking && booking.email) {
          const result = await issueInvoice({
            db,
            resendApiKey: env.RESEND_API_KEY,
            customer_id: booking.customer_id,
            customer_email: booking.email,
            customer_name: `${booking.first_name} ${booking.last_name}`.trim() || null,
            amount_pence: booking.price,
            items: [
              {
                description: `${booking.vehicle_label} - ${booking.service_label}`,
                qty: 1,
                unit_price: booking.price,
                total: booking.price,
              },
            ],
            booking_id: existing.id,
            visit_date: booking.date,
            package_used: booking.service_label,
          });
          if (result.ok) {
            invoice_status = result.email_status;
            invoice_number = result.invoice_number;
          } else {
            invoice_status = 'failed';
          }
        }
      } else {
        invoice_status = 'skipped';
      }
    }

    return json({
      success: true,
      id: existing.id,
      status: newDbStatus,
      invoice_status,
      invoice_number,
    });
  }

  // ----- List bookings + today's walk-in summary -----------------------
  const today = todayInTimezone();
  const [bookings, walkinSummary] = await Promise.all([
    listBoardBookings(db),
    getTodayWalkinsSummary(db, today),
  ]);
  return json({ bookings, walkin_summary: walkinSummary });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
