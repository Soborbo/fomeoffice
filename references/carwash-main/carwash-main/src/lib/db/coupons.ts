// Coupon CRUD. All reads via live_coupons view. Money in pence (INTEGER),
// percentages as integer 1-100. Schema designed in migration 0008 to be
// final — no ALTERs.

import type { DB } from './index';

export type CouponSource = 'loyalty' | 'promo' | 'referral' | 'manual';
export type CouponDiscountType = 'percent' | 'fixed';

export interface CouponRow {
  id: number;
  code: string;
  source: CouponSource;
  customer_id: number | null;
  issued_for_visit_count: number | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number;
  current_uses: number;
  issued_by: number | null;
  notes: string | null;
  created_at: string;
}

export interface CouponListItem extends CouponRow {
  customer_name: string | null;
  customer_email: string | null;
  issued_by_name: string | null;
}

// ============================================================================
// INSERT
// ============================================================================
export interface InsertCouponInput {
  code: string;
  source: CouponSource;
  customer_id?: number | null;
  issued_for_visit_count?: number | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  valid_from?: string | null;
  valid_until?: string | null;
  max_uses?: number;
  issued_by?: number | null;
  notes?: string | null;
}

export async function insertCoupon(
  db: DB,
  input: InsertCouponInput,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO coupons
         (code, source, customer_id, issued_for_visit_count,
          discount_type, discount_value,
          valid_from, valid_until,
          max_uses, issued_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.code,
      input.source,
      input.customer_id ?? null,
      input.issued_for_visit_count ?? null,
      input.discount_type,
      input.discount_value,
      input.valid_from ?? null,
      input.valid_until ?? null,
      input.max_uses ?? 1,
      input.issued_by ?? null,
      input.notes ?? null,
    )
    .run();
  return Number(result.meta.last_row_id);
}

// ============================================================================
// LIST — admin view
// ============================================================================
export interface ListCouponsFilter {
  source?: CouponSource;
  customer_id?: number;
  limit?: number;
}

export async function listCoupons(
  db: DB,
  filter: ListCouponsFilter,
): Promise<CouponListItem[]> {
  const conditions: string[] = [];
  const args: unknown[] = [];

  if (filter.source) {
    conditions.push('c.source = ?');
    args.push(filter.source);
  }
  if (filter.customer_id) {
    conditions.push('c.customer_id = ?');
    args.push(filter.customer_id);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  args.push(limit);

  const result = await db
    .prepare(
      `SELECT
         c.*,
         cu.first_name || ' ' || cu.last_name AS customer_name,
         cu.email AS customer_email,
         w.name AS issued_by_name
       FROM live_coupons c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN workers w ON w.id = c.issued_by
       ${where}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ?`,
    )
    .bind(...args)
    .all<CouponListItem>();
  return result.results ?? [];
}

// ============================================================================
// GET BY CODE — used by the future booking-form redemption flow
// ============================================================================
export async function getCouponByCode(
  db: DB,
  code: string,
): Promise<CouponRow | null> {
  return db
    .prepare(`SELECT * FROM live_coupons WHERE code = ? LIMIT 1`)
    .bind(code)
    .first<CouponRow>();
}

// ============================================================================
// SUMMARY — used by /admin landing
// ============================================================================
export interface CouponSummary {
  total: number;
  active: number;       // not expired, current_uses < max_uses
  redeemed: number;     // current_uses >= max_uses
  expired: number;      // valid_until < today
}

export async function getCouponSummary(
  db: DB,
  today: string,
): Promise<CouponSummary> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE
           WHEN current_uses < max_uses
            AND (valid_until IS NULL OR valid_until >= ?)
           THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN current_uses >= max_uses THEN 1 ELSE 0 END) AS redeemed,
         SUM(CASE
           WHEN valid_until IS NOT NULL AND valid_until < ?
            AND current_uses < max_uses
           THEN 1 ELSE 0 END) AS expired
       FROM live_coupons`,
    )
    .bind(today, today)
    .first<{
      total: number;
      active: number;
      redeemed: number;
      expired: number;
    }>();
  return {
    total: row?.total ?? 0,
    active: row?.active ?? 0,
    redeemed: row?.redeemed ?? 0,
    expired: row?.expired ?? 0,
  };
}
