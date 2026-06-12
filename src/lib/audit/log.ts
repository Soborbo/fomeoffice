// Audit log helpers. Two tables:
//   - booking_log     -> /board status changes, booking lifecycle
//   - crm_audit_log   -> every admin / super_admin write across the CRM

import type { DB } from '../db';

export interface CrmAuditEntry {
  performedBy: number;
  action: string; // e.g. 'expense.create', 'staff.update', 'damage.delete'
  entityType: string; // 'expense' | 'worker' | 'damage_report' | ...
  entityId?: number;
  before?: unknown;
  after?: unknown;
  request?: Request;
  notes?: string;
}

export async function auditLog(db: DB, entry: CrmAuditEntry): Promise<void> {
  const ip = entry.request?.headers.get('cf-connecting-ip') ?? null;
  const ua = entry.request?.headers.get('user-agent') ?? null;

  await db
    .prepare(
      `INSERT INTO crm_audit_log
       (performed_by, action, entity_type, entity_id, before_json, after_json, ip_address, user_agent, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.performedBy,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.before !== undefined ? JSON.stringify(entry.before) : null,
      entry.after !== undefined ? JSON.stringify(entry.after) : null,
      ip,
      ua,
      entry.notes ?? null,
    )
    .run();
}

export type BookingLogActorType =
  | 'website'
  | 'worker'
  | 'admin'
  | 'super_admin'
  | 'system';

export interface BookingLogEntry {
  bookingId: number;
  action: string;
  actorType: BookingLogActorType;
  actorWorkerId?: number | null;
  before?: unknown;
  after?: unknown;
  request?: Request;
  notes?: string;
}

export async function bookingLog(db: DB, entry: BookingLogEntry): Promise<void> {
  const ip = entry.request?.headers.get('cf-connecting-ip') ?? null;
  const ua = entry.request?.headers.get('user-agent') ?? null;

  await db
    .prepare(
      `INSERT INTO booking_log
       (booking_id, action, actor_type, actor_worker_id, before_json, after_json, ip_address, user_agent, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.bookingId,
      entry.action,
      entry.actorType,
      entry.actorWorkerId ?? null,
      entry.before !== undefined ? JSON.stringify(entry.before) : null,
      entry.after !== undefined ? JSON.stringify(entry.after) : null,
      ip,
      ua,
      entry.notes ?? null,
    )
    .run();
}
