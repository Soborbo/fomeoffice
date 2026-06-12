// Daily reconciliation API.
// GET  /api/app/daily?date=YYYY-MM-DD  → roster + expected totals + existing summary
// POST /api/app/daily                  → upsert summary + replace attendance

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import {
  computeExpectedTotals,
  getDailySummary,
  getSettingsBatch,
  upsertDailySummary,
} from '../../../lib/db/daily';
import {
  listActiveWorkers,
  listAttendanceForDate,
  replaceAttendanceForDate,
  resolvePayForShift,
  type PreparedAttendanceEntry,
} from '../../../lib/db/attendance';
import { todayInTimezone } from '../../../lib/db/walkins';
import { auditLog } from '../../../lib/audit/log';
import { DailySubmitSchema } from '../../../lib/validation/daily';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ----------------------------------------------------------------------------
// GET /api/app/daily?date=YYYY-MM-DD
// ----------------------------------------------------------------------------
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const dateParam = url.searchParams.get('date');
  const date =
    dateParam && DATE_RE.test(dateParam) ? dateParam : todayInTimezone();

  const db = getDb();

  const [expected, summary, workers, attendance, settings] = await Promise.all([
    computeExpectedTotals(db, date),
    getDailySummary(db, date),
    listActiveWorkers(db),
    listAttendanceForDate(db, date),
    getSettingsBatch(db, [
      'cash_variance_threshold',
      'cash_variance_pattern_days',
      'currency',
    ]),
  ]);

  return json({
    date,
    today: todayInTimezone(),
    expected,
    summary,
    workers,
    attendance,
    settings: {
      cash_variance_threshold: parseInt(
        settings.cash_variance_threshold ?? '500',
        10,
      ),
      cash_variance_pattern_days: parseInt(
        settings.cash_variance_pattern_days ?? '4',
        10,
      ),
      currency: settings.currency ?? 'GBP',
    },
  });
};

// ----------------------------------------------------------------------------
// POST /api/app/daily
// ----------------------------------------------------------------------------
export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const user = locals.user;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = DailySubmitSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: 'Invalid input', issues: parsed.error.flatten() },
      400,
    );
  }
  const input = parsed.data;

  const db = getDb();

  // Recompute expected totals from current D1 state — never trust client values.
  const expected = await computeExpectedTotals(db, input.date);

  // Variance threshold check: if |variance| > threshold, notes are required.
  const settingsRow = await getSettingsBatch(db, ['cash_variance_threshold']);
  const threshold = parseInt(settingsRow.cash_variance_threshold ?? '500', 10);
  const cashVariance = input.cash_total - expected.expected_cash;
  const cardVariance = input.card_total - expected.expected_card;
  const trimmedNotes = (input.notes ?? '').trim();

  if (
    (Math.abs(cashVariance) > threshold || Math.abs(cardVariance) > threshold) &&
    trimmedNotes.length === 0
  ) {
    return json(
      {
        error: 'Notes required',
        code: 'VARIANCE_NOTES_REQUIRED',
        cash_variance: cashVariance,
        card_variance: cardVariance,
        threshold,
      },
      400,
    );
  }

  // Resolve per-worker pay snapshots for the attendance roster.
  const workers = await listActiveWorkers(db);
  const workerById = new Map(workers.map((w) => [w.id, w]));
  const attendancePrepared: PreparedAttendanceEntry[] = [];
  const seen = new Set<number>();
  for (const e of input.attendance) {
    if (seen.has(e.worker_id)) {
      return json(
        { error: 'Duplicate worker in attendance', worker_id: e.worker_id },
        400,
      );
    }
    seen.add(e.worker_id);
    const w = workerById.get(e.worker_id);
    if (!w) {
      return json(
        { error: 'Unknown or inactive worker', worker_id: e.worker_id },
        400,
      );
    }
    attendancePrepared.push({
      worker_id: e.worker_id,
      shift: e.shift,
      notes: (e.notes ?? '').trim() || null,
      pay_amount: resolvePayForShift(w, e.shift),
    });
  }

  // ----- Upsert daily summary -----------------------------------------------
  const before = await getDailySummary(db, input.date);
  const result = await upsertDailySummary(db, {
    date: input.date,
    cash_total: input.cash_total,
    card_total: input.card_total,
    cars_inside: input.cars_inside,
    cars_outside: input.cars_outside,
    expected_cash: expected.expected_cash,
    expected_card: expected.expected_card,
    notes: trimmedNotes || null,
    filled_by: user.id,
  });

  if (!result.ok) {
    return json(
      { error: 'Daily summary is locked', code: 'LOCKED' },
      409,
    );
  }

  // ----- Replace attendance --------------------------------------------------
  const beforeAttendance = await listAttendanceForDate(db, input.date);
  await replaceAttendanceForDate(db, input.date, user.id, attendancePrepared);
  const afterAttendance = await listAttendanceForDate(db, input.date);

  // ----- Audit log -----------------------------------------------------------
  await auditLog(db, {
    performedBy: user.id,
    action: result.wasUpdate ? 'daily.update' : 'daily.submit',
    entityType: 'daily_summary',
    entityId: result.row.id,
    before: before
      ? {
          cash_total: before.cash_total,
          card_total: before.card_total,
          cars_inside: before.cars_inside,
          cars_outside: before.cars_outside,
          notes: before.notes,
        }
      : null,
    after: {
      cash_total: result.row.cash_total,
      card_total: result.row.card_total,
      cars_inside: result.row.cars_inside,
      cars_outside: result.row.cars_outside,
      expected_cash: result.row.expected_cash,
      expected_card: result.row.expected_card,
      cash_variance: result.row.cash_variance,
      card_variance: result.row.card_variance,
      notes: result.row.notes,
    },
    request,
  });

  await auditLog(db, {
    performedBy: user.id,
    action: 'attendance.replace',
    entityType: 'staff_attendance',
    entityId: result.row.id, // anchor to the daily_summary row
    before: beforeAttendance.map((a) => ({
      worker_id: a.worker_id,
      shift: a.shift,
      pay_amount: a.pay_amount,
    })),
    after: afterAttendance.map((a) => ({
      worker_id: a.worker_id,
      shift: a.shift,
      pay_amount: a.pay_amount,
    })),
    notes: `date=${input.date}`,
    request,
  });

  return json({
    success: true,
    summary: result.row,
    attendance: afterAttendance,
    was_update: result.wasUpdate,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
