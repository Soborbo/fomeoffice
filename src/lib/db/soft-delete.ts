// Soft delete helper. Reads must go through the live_* views — see
// migrations/0006_crm_views.sql for the view definitions.

import type { DB } from './index';

const SOFT_DELETABLE_TABLES = [
  'workers',
  'customers',
  'bookings',
  'expenses',
  'damage_reports',
  'walkin_transactions',
  'invoices',
  'staff_payments',
  'daily_summary',
  'staff_attendance',
  'cash_deposits',
  'coupons',
] as const;

export type SoftDeletableTable = (typeof SOFT_DELETABLE_TABLES)[number];

export async function softDelete(
  db: DB,
  table: SoftDeletableTable,
  id: number,
  deletedBy: number,
): Promise<void> {
  if (!SOFT_DELETABLE_TABLES.includes(table)) {
    throw new Error(`Table "${table}" is not soft-deletable.`);
  }
  await db
    .prepare(
      `UPDATE ${table} SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(deletedBy, id)
    .run();
}

export async function restoreSoftDeleted(
  db: DB,
  table: SoftDeletableTable,
  id: number,
): Promise<void> {
  if (!SOFT_DELETABLE_TABLES.includes(table)) {
    throw new Error(`Table "${table}" is not soft-deletable.`);
  }
  await db
    .prepare(
      `UPDATE ${table} SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
    )
    .bind(id)
    .run();
}

// Super admin only — bypasses soft delete entirely.
export async function hardDelete(
  db: DB,
  table: SoftDeletableTable,
  id: number,
): Promise<void> {
  if (!SOFT_DELETABLE_TABLES.includes(table)) {
    throw new Error(`Table "${table}" is not soft-deletable.`);
  }
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
}
