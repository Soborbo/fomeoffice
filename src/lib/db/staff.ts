// Worker profile + monthly aggregate helpers.
// Used by /admin/staff/[id] (super_admin profile sheet) and the staff list.

import type { DB } from './index';
import type { WorkerRole } from '../../env';

// ============================================================================
// FULL WORKER ROW (for the profile sheet)
// ============================================================================
export interface WorkerProfileRow {
  id: number;
  name: string;
  role: WorkerRole;
  email: string | null;
  phone: string | null;
  address: string | null;
  ni_number: string | null;
  full_day_pay: number;
  half_day_pay: number;
  hired_at: string | null;
  active: number;
  created_at: string;
}

export async function getWorkerById(
  db: DB,
  id: number,
): Promise<WorkerProfileRow | null> {
  return db
    .prepare(
      `SELECT id, name, role, email, phone, address, ni_number,
              full_day_pay, half_day_pay, hired_at, active, created_at
       FROM live_workers
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<WorkerProfileRow>();
}

// ============================================================================
// LIST WORKERS — for /admin/staff index
// Pulls per-worker monthly aggregates in one go.
// ============================================================================
export interface WorkerListItem {
  id: number;
  name: string;
  role: WorkerRole;
  email: string | null;
  phone: string | null;
  full_day_pay: number;
  half_day_pay: number;
  hired_at: string | null;
  active: number;
  earned_this_month: number;
  paid_this_month: number;
  owed_total: number;
}

export async function listWorkersWithMonthlyAggregates(
  db: DB,
  monthStart: string,
  monthEnd: string,
): Promise<WorkerListItem[]> {
  // Three left joins: attendance and payments aggregated per-worker for the
  // current month. owed_total uses lifetime sums so partial-month payments
  // settling earlier work are visible.
  const result = await db
    .prepare(
      `SELECT
         w.id, w.name, w.role, w.email, w.phone,
         w.full_day_pay, w.half_day_pay, w.hired_at, w.active,
         COALESCE((
           SELECT SUM(pay_amount) FROM live_staff_attendance
           WHERE worker_id = w.id AND date >= ? AND date <= ?
         ), 0) AS earned_this_month,
         COALESCE((
           SELECT SUM(amount) FROM live_staff_payments
           WHERE worker_id = w.id AND paid_at >= ? AND paid_at <= ?
         ), 0) AS paid_this_month,
         COALESCE((
           SELECT SUM(pay_amount) FROM live_staff_attendance WHERE worker_id = w.id
         ), 0) - COALESCE((
           SELECT SUM(amount) FROM live_staff_payments WHERE worker_id = w.id
         ), 0) AS owed_total
       FROM live_workers w
       WHERE w.active = 1
       ORDER BY w.role DESC, w.name ASC`,
    )
    .bind(monthStart, monthEnd, monthStart, monthEnd)
    .all<WorkerListItem>();
  return result.results ?? [];
}

// ============================================================================
// MONTHLY SUMMARY — for the profile sheet header
// ============================================================================
export interface MonthlySummary {
  month_start: string;
  month_end: string;
  full_days: number;
  half_days: number;
  overtime_days: number;
  earned: number;
  paid: number;
  owed: number; // earned - paid for the month (NOT lifetime)
  owed_lifetime: number; // lifetime earned - lifetime paid
}

export async function getWorkerMonthlySummary(
  db: DB,
  workerId: number,
  monthStart: string,
  monthEnd: string,
): Promise<MonthlySummary> {
  const [att, paid, lifetime] = await db.batch<{
    full_days: number;
    half_days: number;
    overtime_days: number;
    earned: number;
    paid_total: number;
    earned_lifetime: number;
    paid_lifetime: number;
  }>([
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN shift = 'full'     THEN 1 ELSE 0 END) AS full_days,
           SUM(CASE WHEN shift = 'half'     THEN 1 ELSE 0 END) AS half_days,
           SUM(CASE WHEN shift = 'overtime' THEN 1 ELSE 0 END) AS overtime_days,
           COALESCE(SUM(pay_amount), 0)                        AS earned
         FROM live_staff_attendance
         WHERE worker_id = ? AND date >= ? AND date <= ?`,
      )
      .bind(workerId, monthStart, monthEnd),
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS paid_total
         FROM live_staff_payments
         WHERE worker_id = ? AND paid_at >= ? AND paid_at <= ?`,
      )
      .bind(workerId, monthStart, monthEnd),
    db
      .prepare(
        `SELECT
           COALESCE((SELECT SUM(pay_amount) FROM live_staff_attendance
                     WHERE worker_id = ?), 0) AS earned_lifetime,
           COALESCE((SELECT SUM(amount) FROM live_staff_payments
                     WHERE worker_id = ?), 0) AS paid_lifetime`,
      )
      .bind(workerId, workerId),
  ]);

  const a = att.results?.[0] ?? {
    full_days: 0,
    half_days: 0,
    overtime_days: 0,
    earned: 0,
    paid_total: 0,
    earned_lifetime: 0,
    paid_lifetime: 0,
  };
  const p = paid.results?.[0] ?? {
    full_days: 0,
    half_days: 0,
    overtime_days: 0,
    earned: 0,
    paid_total: 0,
    earned_lifetime: 0,
    paid_lifetime: 0,
  };
  const l = lifetime.results?.[0] ?? {
    full_days: 0,
    half_days: 0,
    overtime_days: 0,
    earned: 0,
    paid_total: 0,
    earned_lifetime: 0,
    paid_lifetime: 0,
  };

  return {
    month_start: monthStart,
    month_end: monthEnd,
    full_days: a.full_days ?? 0,
    half_days: a.half_days ?? 0,
    overtime_days: a.overtime_days ?? 0,
    earned: a.earned ?? 0,
    paid: p.paid_total ?? 0,
    owed: (a.earned ?? 0) - (p.paid_total ?? 0),
    owed_lifetime: (l.earned_lifetime ?? 0) - (l.paid_lifetime ?? 0),
  };
}

// ============================================================================
// RECENT ATTENDANCE for a worker
// ============================================================================
export interface AttendanceLine {
  date: string;
  shift: string;
  pay_amount: number;
  notes: string | null;
}

export async function listAttendanceForWorker(
  db: DB,
  workerId: number,
  limit = 60,
): Promise<AttendanceLine[]> {
  const result = await db
    .prepare(
      `SELECT date, shift, pay_amount, notes
       FROM live_staff_attendance
       WHERE worker_id = ?
       ORDER BY date DESC
       LIMIT ?`,
    )
    .bind(workerId, Math.min(Math.max(limit, 1), 365))
    .all<AttendanceLine>();
  return result.results ?? [];
}

// ============================================================================
// RECENT PAYMENTS for a worker
// ============================================================================
export interface PaymentLine {
  id: number;
  paid_at: string;
  amount: number;
  method: string;
  covers_period_start: string | null;
  covers_period_end: string | null;
  notes: string | null;
}

export async function listPaymentsForWorker(
  db: DB,
  workerId: number,
  limit = 60,
): Promise<PaymentLine[]> {
  const result = await db
    .prepare(
      `SELECT id, paid_at, amount, method,
              covers_period_start, covers_period_end, notes
       FROM live_staff_payments
       WHERE worker_id = ?
       ORDER BY paid_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(workerId, Math.min(Math.max(limit, 1), 365))
    .all<PaymentLine>();
  return result.results ?? [];
}

// ============================================================================
// INSERT a new worker. Optional PIN is hashed before persisting; we never
// store the PIN in plaintext. Email uniqueness is enforced at the DB layer
// (via the email_unique index where present); we return the row id.
// ============================================================================
export interface InsertWorkerInput {
  name: string;
  role: WorkerRole;
  email?: string | null;
  phone?: string | null;
  full_day_pay: number;
  half_day_pay: number;
  hired_at?: string | null;
  pin_hash?: string | null;
  pin_salt?: string | null;
}

export async function insertWorker(
  db: DB,
  input: InsertWorkerInput,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO workers
         (name, role, email, phone,
          full_day_pay, half_day_pay,
          hired_at, pin_hash, pin_salt, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      input.name,
      input.role,
      input.email ?? null,
      input.phone ?? null,
      input.full_day_pay,
      input.half_day_pay,
      input.hired_at ?? null,
      input.pin_hash ?? null,
      input.pin_salt ?? null,
    )
    .run();
  return Number(result.meta.last_row_id);
}

// ============================================================================
// UPDATE a worker. Only the fields present in the input are touched; pass
// `null` to clear a column. PIN updates are special — pass pin_hash+salt or
// `clear_pin: true` to remove it.
// ============================================================================
export interface UpdateWorkerInput {
  name?: string;
  role?: WorkerRole;
  email?: string | null;
  phone?: string | null;
  full_day_pay?: number;
  half_day_pay?: number;
  hired_at?: string | null;
  active?: 0 | 1;
  pin_hash?: string | null;
  pin_salt?: string | null;
}

export async function updateWorker(
  db: DB,
  id: number,
  input: UpdateWorkerInput,
): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];

  for (const [col, value] of [
    ['name', input.name],
    ['role', input.role],
    ['email', input.email],
    ['phone', input.phone],
    ['full_day_pay', input.full_day_pay],
    ['half_day_pay', input.half_day_pay],
    ['hired_at', input.hired_at],
    ['active', input.active],
  ] as const) {
    if (value !== undefined) {
      sets.push(`${col} = ?`);
      args.push(value);
    }
  }
  if (input.pin_hash !== undefined) {
    sets.push('pin_hash = ?');
    args.push(input.pin_hash);
  }
  if (input.pin_salt !== undefined) {
    sets.push('pin_salt = ?');
    args.push(input.pin_salt);
  }

  if (sets.length === 0) return;
  sets.push('updated_at = CURRENT_TIMESTAMP');

  args.push(id);
  await db
    .prepare(
      `UPDATE workers SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(...args)
    .run();
}

export async function softDeleteWorker(
  db: DB,
  id: number,
  deletedBy: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE workers
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, active = 0
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(deletedBy, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// ============================================================================
// ATTENDANCE MATRIX — workers × days for a date range. One row per worker
// with their per-day shifts and the per-range totals. Used by /admin/staff/
// matrix to give super_admins a single view of who worked when + who's owed
// what + how much was paid in the same window.
// ============================================================================
export interface MatrixDayCell {
  date: string;
  shift: 'full' | 'half' | 'overtime';
  pay_amount: number;
}

export interface MatrixWorkerRow {
  id: number;
  name: string;
  role: WorkerRole;
  full_day_pay: number;
  half_day_pay: number;
  days: MatrixDayCell[];
  earned_range: number;   // sum of pay_amount in [from, to]
  paid_range: number;     // sum of staff_payments.amount in [from, to]
  owed_lifetime: number;  // lifetime earned − lifetime paid
}

interface RawAttendanceRow {
  worker_id: number;
  date: string;
  shift: 'full' | 'half' | 'overtime';
  pay_amount: number;
}

interface RawPaidRow {
  worker_id: number;
  total: number;
}

interface RawLifetimeRow {
  worker_id: number;
  earned: number;
  paid: number;
}

export async function getAttendanceMatrix(
  db: DB,
  from: string,
  to: string,
): Promise<MatrixWorkerRow[]> {
  // Three independent reads — workers (with role + pay rates), attendance
  // in the range, paid-out totals in the range, and the lifetime owed.
  const [workers, attendance, paid, lifetime] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, role, full_day_pay, half_day_pay
         FROM live_workers
         WHERE active = 1
         ORDER BY role DESC, name ASC`,
      )
      .all<{
        id: number;
        name: string;
        role: WorkerRole;
        full_day_pay: number;
        half_day_pay: number;
      }>(),
    db
      .prepare(
        `SELECT worker_id, date, shift, pay_amount
         FROM live_staff_attendance
         WHERE date >= ? AND date <= ?
         ORDER BY date ASC`,
      )
      .bind(from, to)
      .all<RawAttendanceRow>(),
    db
      .prepare(
        `SELECT worker_id, COALESCE(SUM(amount), 0) AS total
         FROM live_staff_payments
         WHERE paid_at >= ? AND paid_at <= ?
         GROUP BY worker_id`,
      )
      .bind(from, to)
      .all<RawPaidRow>(),
    db
      .prepare(
        `SELECT w.id AS worker_id,
                COALESCE((SELECT SUM(pay_amount) FROM live_staff_attendance
                          WHERE worker_id = w.id), 0) AS earned,
                COALESCE((SELECT SUM(amount) FROM live_staff_payments
                          WHERE worker_id = w.id), 0) AS paid
         FROM live_workers w
         WHERE w.active = 1`,
      )
      .all<RawLifetimeRow>(),
  ]);

  const daysByWorker = new Map<number, MatrixDayCell[]>();
  const earnedByWorker = new Map<number, number>();
  for (const row of attendance.results ?? []) {
    const list = daysByWorker.get(row.worker_id) ?? [];
    list.push({ date: row.date, shift: row.shift, pay_amount: row.pay_amount });
    daysByWorker.set(row.worker_id, list);
    earnedByWorker.set(
      row.worker_id,
      (earnedByWorker.get(row.worker_id) ?? 0) + row.pay_amount,
    );
  }

  const paidByWorker = new Map<number, number>();
  for (const row of paid.results ?? []) {
    paidByWorker.set(row.worker_id, row.total);
  }

  const lifetimeByWorker = new Map<number, { earned: number; paid: number }>();
  for (const row of lifetime.results ?? []) {
    lifetimeByWorker.set(row.worker_id, { earned: row.earned, paid: row.paid });
  }

  return (workers.results ?? []).map((w) => {
    const life = lifetimeByWorker.get(w.id) ?? { earned: 0, paid: 0 };
    return {
      id: w.id,
      name: w.name,
      role: w.role,
      full_day_pay: w.full_day_pay,
      half_day_pay: w.half_day_pay,
      days: daysByWorker.get(w.id) ?? [],
      earned_range: earnedByWorker.get(w.id) ?? 0,
      paid_range: paidByWorker.get(w.id) ?? 0,
      owed_lifetime: life.earned - life.paid,
    };
  });
}

// ============================================================================
// MONTH BOUNDS HELPER — first and last day of a YYYY-MM string in UTC
// ============================================================================
export function monthBounds(yyyyMm: string): { start: string; end: string } {
  // Validate "YYYY-MM"
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!m) throw new Error(`Invalid month: ${yyyyMm}`);
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10); // 1..12
  const start = `${m[1]}-${m[2]}-01`;
  // Last day: build a Date for the first day of the next month, subtract one day.
  const next = new Date(Date.UTC(year, month, 1));
  next.setUTCDate(next.getUTCDate() - 1);
  const end = next.toISOString().slice(0, 10);
  return { start, end };
}

export function currentMonth(timezone = 'Europe/London'): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  });
  // Intl returns "YYYY-MM" already in the en-CA locale's "year/month" output,
  // but defensively reconstruct it from the parts.
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${y}-${mo}`;
}
