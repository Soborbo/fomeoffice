// Damage reports — incidents with photos in R2 and Resend notification.
// All reads via live_damage_reports.

import type { DB } from './index';
import { isValidR2Key } from '../r2/keys';

export type DamageCategory =
  | 'scratch'
  | 'mirror_damage'
  | 'dent'
  | 'paint_damage'
  | 'wheel_damage'
  | 'interior_damage'
  | 'glass_damage'
  | 'other';

export type ResolutionStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'escalated'
  | 'cancelled';

export interface DamageReportRow {
  id: number;
  date: string;
  occurred_at: string;
  reported_by: number;
  worker_responsible: number | null;
  category: DamageCategory; // legacy single-cat column; first of categories
  categories: string | null; // JSON array of DamageCategory
  description: string;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_registration: string | null;
  resolution: string | null;
  resolution_status: ResolutionStatus;
  compensation_amount: number | null;
  photo_r2_keys: string | null; // JSON
  notification_sent_at: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
}

export interface DamageReportListItem extends DamageReportRow {
  reported_by_name: string;
  worker_responsible_name: string | null;
}

// ============================================================================
// LIST
// ============================================================================
export interface ListDamageFilter {
  from?: string;
  to?: string;
  status?: ResolutionStatus;
  limit?: number;
}

export async function listDamageReports(
  db: DB,
  filter: ListDamageFilter,
): Promise<DamageReportListItem[]> {
  const conditions: string[] = [];
  const args: unknown[] = [];
  if (filter.from) {
    conditions.push('d.date >= ?');
    args.push(filter.from);
  }
  if (filter.to) {
    conditions.push('d.date <= ?');
    args.push(filter.to);
  }
  if (filter.status) {
    conditions.push('d.resolution_status = ?');
    args.push(filter.status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  args.push(limit);

  const result = await db
    .prepare(
      `SELECT d.*,
              rb.name AS reported_by_name,
              wr.name AS worker_responsible_name
       FROM live_damage_reports d
       JOIN workers rb ON rb.id = d.reported_by
       LEFT JOIN workers wr ON wr.id = d.worker_responsible
       ${where}
       ORDER BY d.occurred_at DESC, d.id DESC
       LIMIT ?`,
    )
    .bind(...args)
    .all<DamageReportListItem>();
  return result.results ?? [];
}

// ============================================================================
// GET
// ============================================================================
export async function getDamageReport(
  db: DB,
  id: number,
): Promise<DamageReportListItem | null> {
  return db
    .prepare(
      `SELECT d.*,
              rb.name AS reported_by_name,
              wr.name AS worker_responsible_name
       FROM live_damage_reports d
       JOIN workers rb ON rb.id = d.reported_by
       LEFT JOIN workers wr ON wr.id = d.worker_responsible
       WHERE d.id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<DamageReportListItem>();
}

// ============================================================================
// INSERT
// ============================================================================
export interface InsertDamageInput {
  occurred_at: string; // ISO datetime
  reported_by: number;
  worker_responsible?: number | null;
  categories: DamageCategory[];
  description: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  vehicle_registration?: string | null;
  photo_r2_keys?: string[];
  resolution?: string | null;
  resolution_status?: ResolutionStatus;
  compensation_amount?: number | null;
}

export async function insertDamageReport(
  db: DB,
  input: InsertDamageInput,
): Promise<number> {
  // Date is the calendar date of occurred_at (UK), not just the prefix —
  // occurred_at can be a UTC datetime.
  const date = input.occurred_at.slice(0, 10);

  // Defensively validate any photo keys before persisting.
  const keys = (input.photo_r2_keys ?? []).filter((k) => isValidR2Key(k));
  const keysJson = keys.length > 0 ? JSON.stringify(keys) : null;

  // Dedupe + persist the full list to `categories` (JSON). The legacy
  // `category` column gets the primary (first) selection — it still has a
  // CHECK constraint and is read by the damage email subject + Xero export.
  const uniqueCategories = Array.from(new Set(input.categories));
  if (uniqueCategories.length === 0) {
    throw new Error('insertDamageReport: categories cannot be empty');
  }
  const primaryCategory = uniqueCategories[0];
  const categoriesJson = JSON.stringify(uniqueCategories);

  const result = await db
    .prepare(
      `INSERT INTO damage_reports
         (date, occurred_at, reported_by, worker_responsible,
          category, categories, description,
          customer_name, customer_phone, vehicle_registration,
          resolution, resolution_status, compensation_amount,
          photo_r2_keys)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      date,
      input.occurred_at,
      input.reported_by,
      input.worker_responsible ?? null,
      primaryCategory,
      categoriesJson,
      input.description,
      input.customer_name ?? null,
      input.customer_phone ?? null,
      input.vehicle_registration ?? null,
      input.resolution ?? null,
      input.resolution_status ?? 'open',
      input.compensation_amount ?? null,
      keysJson,
    )
    .run();
  return Number(result.meta.last_row_id);
}

// Parse the `categories` JSON column with a fall-back to the legacy
// `category` column for rows that pre-date migration 0010.
export function parseCategories(
  json: string | null,
  fallback?: DamageCategory | null,
): DamageCategory[] {
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (x): x is DamageCategory =>
            typeof x === 'string' &&
            [
              'scratch',
              'mirror_damage',
              'dent',
              'paint_damage',
              'wheel_damage',
              'interior_damage',
              'glass_damage',
              'other',
            ].includes(x),
        );
        if (valid.length > 0) return valid;
      }
    } catch {
      // fall through
    }
  }
  return fallback ? [fallback] : [];
}

export async function markNotificationSent(
  db: DB,
  id: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE damage_reports
         SET notification_sent_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(id)
    .run();
}

// ============================================================================
// UPDATE — resolution + status + compensation, optionally mark resolved
// ============================================================================
export interface UpdateDamageInput {
  resolution?: string | null;
  resolution_status?: ResolutionStatus;
  compensation_amount?: number | null;
  worker_responsible?: number | null;
  resolved_by?: number | null;
}

export async function updateDamageReport(
  db: DB,
  id: number,
  input: UpdateDamageInput,
): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];

  if (input.resolution !== undefined) {
    sets.push('resolution = ?');
    args.push(input.resolution);
  }
  if (input.resolution_status !== undefined) {
    sets.push('resolution_status = ?');
    args.push(input.resolution_status);

    if (input.resolution_status === 'resolved') {
      sets.push('resolved_at = CURRENT_TIMESTAMP');
      sets.push('resolved_by = ?');
      args.push(input.resolved_by ?? null);
    } else {
      sets.push('resolved_at = NULL');
      sets.push('resolved_by = NULL');
    }
  }
  if (input.compensation_amount !== undefined) {
    sets.push('compensation_amount = ?');
    args.push(input.compensation_amount);
  }
  if (input.worker_responsible !== undefined) {
    sets.push('worker_responsible = ?');
    args.push(input.worker_responsible);
  }

  if (sets.length === 0) return;

  args.push(id);
  await db
    .prepare(
      `UPDATE damage_reports SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(...args)
    .run();
}

// ============================================================================
// SOFT DELETE
// ============================================================================
export async function softDeleteDamageReport(
  db: DB,
  id: number,
  deletedBy: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE damage_reports
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(deletedBy, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// ============================================================================
// PARSE PHOTO KEYS — defensive parser for the JSON column
// ============================================================================
export function parsePhotoKeys(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && isValidR2Key(x));
  } catch {
    return [];
  }
}
