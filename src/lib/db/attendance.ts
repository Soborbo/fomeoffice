// Staff attendance helpers for the daily reconciliation form.
// One record per worker per date. Pay is snapshotted from workers.full_day_pay
// / half_day_pay at the moment of submit — later edits to those rates do NOT
// retroactively change attendance entries.

import type { DB } from './index';
import type { WorkerRole } from '../../env';

export type Shift = 'full' | 'half' | 'overtime';

// ============================================================================
// LIST ACTIVE WORKERS — for the attendance roster on the daily form
// ============================================================================
export interface ActiveWorkerRow {
  id: number;
  name: string;
  role: WorkerRole;
  full_day_pay: number;
  half_day_pay: number;
}

export async function listActiveWorkers(db: DB): Promise<ActiveWorkerRow[]> {
  const result = await db
    .prepare(
      `SELECT id, name, role, full_day_pay, half_day_pay
       FROM live_workers
       WHERE active = 1
       ORDER BY role DESC, name ASC`,
    )
    .all<ActiveWorkerRow>();
  return result.results ?? [];
}

// ============================================================================
// LIST ATTENDANCE FOR DATE — prefill the form when re-editing a day
// ============================================================================
export interface AttendanceRow {
  id: number;
  worker_id: number;
  worker_name: string;
  date: string;
  shift: Shift;
  pay_amount: number;
  notes: string | null;
}

export async function listAttendanceForDate(
  db: DB,
  date: string,
): Promise<AttendanceRow[]> {
  const result = await db
    .prepare(
      `SELECT a.id, a.worker_id, w.name AS worker_name,
              a.date, a.shift, a.pay_amount, a.notes
       FROM live_staff_attendance a
       JOIN workers w ON w.id = a.worker_id
       WHERE a.date = ?
       ORDER BY w.name ASC`,
    )
    .bind(date)
    .all<AttendanceRow>();
  return result.results ?? [];
}

// ============================================================================
// REPLACE ATTENDANCE — soft-delete prior live rows for the date, then insert.
// One audit log entry per call ("attendance.replace") is written by the caller.
// ============================================================================
export interface AttendanceInput {
  worker_id: number;
  shift: Shift;
  notes?: string | null;
}

export interface PreparedAttendanceEntry extends AttendanceInput {
  pay_amount: number; // snapshotted from worker pay rates
}

export async function replaceAttendanceForDate(
  db: DB,
  date: string,
  recordedBy: number,
  entries: PreparedAttendanceEntry[],
): Promise<void> {
  // The UNIQUE (worker_id, date) constraint covers soft-deleted rows too,
  // so we cannot soft-delete-then-insert. Instead: soft-delete only the rows
  // that are dropping out of the set, and UPSERT (clearing deleted_at) the
  // rows that remain or are joining.
  const stmts: D1PreparedStatement[] = [];

  if (entries.length === 0) {
    stmts.push(
      db
        .prepare(
          `UPDATE staff_attendance
             SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
           WHERE date = ? AND deleted_at IS NULL`,
        )
        .bind(recordedBy, date),
    );
  } else {
    const placeholders = entries.map(() => '?').join(',');
    stmts.push(
      db
        .prepare(
          `UPDATE staff_attendance
             SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
           WHERE date = ? AND deleted_at IS NULL
             AND worker_id NOT IN (${placeholders})`,
        )
        .bind(recordedBy, date, ...entries.map((e) => e.worker_id)),
    );

    for (const e of entries) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO staff_attendance
               (worker_id, date, shift, pay_amount, notes, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (worker_id, date) DO UPDATE SET
               shift = excluded.shift,
               pay_amount = excluded.pay_amount,
               notes = excluded.notes,
               recorded_by = excluded.recorded_by,
               deleted_at = NULL,
               deleted_by = NULL`,
          )
          .bind(
            e.worker_id,
            date,
            e.shift,
            e.pay_amount,
            e.notes ?? null,
            recordedBy,
          ),
      );
    }
  }

  await db.batch(stmts);
}

// ============================================================================
// PAY SNAPSHOT RESOLVER — pick full / half / overtime pay from the worker row.
// Overtime defaults to full_day_pay (no separate overtime rate field today).
// ============================================================================
export function resolvePayForShift(
  worker: Pick<ActiveWorkerRow, 'full_day_pay' | 'half_day_pay'>,
  shift: Shift,
): number {
  if (shift === 'full') return worker.full_day_pay;
  if (shift === 'half') return worker.half_day_pay;
  return worker.full_day_pay; // overtime = full day rate for now
}
