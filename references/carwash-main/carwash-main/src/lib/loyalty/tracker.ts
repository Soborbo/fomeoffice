// Loyalty engine — issues a coupon every Nth visit when enabled.
//
// Gating (defense in depth — all four must hold):
//   1. settings.loyalty_enabled = '1'
//   2. settings.loyalty_visits_for_reward >= 1
//   3. settings.loyalty_reward_percent BETWEEN 1 AND 100
//   4. visit_count is a positive multiple of the threshold AND
//      customer_id IS NOT NULL (anonymous walk-ins skip)
//
// When enabled-but-not-configured (percent=0) we deliberately skip issuance
// — would-be coupons would have 0% off and just clutter the table. The
// operator opts in by setting a non-zero percent.
//
// Coupon code format: CARWASH-XXXXXXXX where X is alphanumeric uppercase
// drawn from a 32-char alphabet (no ambiguous 0/O, 1/I, L). 32^8 ≈ 10^12
// possibilities so collisions are not a real concern at our scale.

import type { DB } from '../db';
import { insertCoupon, type CouponRow } from '../db/coupons';

const CODE_PREFIX = 'CARWASH-';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, no 0/O/1/I/L
const CODE_LENGTH = 8;

export interface LoyaltyConfig {
  enabled: boolean;
  visitsForReward: number;
  rewardPercent: number;
  validityDays: number;
}

// Parse the four loyalty settings from a settings batch (already-fetched
// from D1) into a typed config. Defaults are conservative — anything weird
// in the settings table degrades cleanly to "loyalty off".
export function parseLoyaltyConfig(
  raw: Record<string, string>,
): LoyaltyConfig {
  const enabled = raw.loyalty_enabled === '1';
  const visitsForReward = parsePositiveInt(raw.loyalty_visits_for_reward, 0);
  const rewardPercent = parsePercent(raw.loyalty_reward_percent);
  const validityDays = parsePositiveInt(raw.loyalty_coupon_validity_days, 90);
  return { enabled, visitsForReward, rewardPercent, validityDays };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function parsePercent(value: string | undefined): number {
  if (!value) return 0;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 0;
  return n;
}

// ----------------------------------------------------------------------------
// Decision: should this visit_count trigger a reward?
// ----------------------------------------------------------------------------
export function shouldIssueLoyaltyCoupon(
  cfg: LoyaltyConfig,
  visitCount: number,
  customerId: number | null,
): boolean {
  if (!cfg.enabled) return false;
  if (cfg.visitsForReward <= 0) return false;
  if (cfg.rewardPercent <= 0) return false;
  if (customerId == null) return false;
  if (!Number.isInteger(visitCount) || visitCount <= 0) return false;
  return visitCount % cfg.visitsForReward === 0;
}

// ----------------------------------------------------------------------------
// Code generation
// ----------------------------------------------------------------------------
export function generateCouponCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let body = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return CODE_PREFIX + body;
}

// ----------------------------------------------------------------------------
// Issue a loyalty coupon. Caller is responsible for the gating decision —
// this function unconditionally inserts. Best-effort code uniqueness via a
// small retry loop in case of an extraordinarily unlucky collision.
// ----------------------------------------------------------------------------
export interface IssueLoyaltyCouponInput {
  db: DB;
  customerId: number;
  visitCount: number;
  rewardPercent: number;
  validityDays: number;
  visitDate: string; // YYYY-MM-DD
}

export interface IssuedLoyaltyCoupon {
  coupon_id: number;
  code: string;
  valid_from: string;
  valid_until: string;
  reward_percent: number;
}

export async function issueLoyaltyCoupon(
  input: IssueLoyaltyCouponInput,
): Promise<IssuedLoyaltyCoupon> {
  const validFrom = input.visitDate;
  const validUntil = shiftDateUtc(input.visitDate, input.validityDays);

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCouponCode();
    try {
      const id = await insertCoupon(input.db, {
        code,
        source: 'loyalty',
        customer_id: input.customerId,
        issued_for_visit_count: input.visitCount,
        discount_type: 'percent',
        discount_value: input.rewardPercent,
        valid_from: validFrom,
        valid_until: validUntil,
        max_uses: 1,
        issued_by: null, // engine-issued
        notes: `Auto-issued at visit #${input.visitCount}`,
      });
      return {
        coupon_id: id,
        code,
        valid_from: validFrom,
        valid_until: validUntil,
        reward_percent: input.rewardPercent,
      };
    } catch (err) {
      lastErr = err;
      // UNIQUE constraint on coupons.code? Try a fresh code.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/UNIQUE constraint failed: coupons\.code/i.test(msg)) {
        throw err;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Failed to issue loyalty coupon (code collision retries exhausted)');
}

// ----------------------------------------------------------------------------
// Pure UTC date arithmetic on YYYY-MM-DD strings — same shape as the
// existing helpers in lib/db/dashboard.
// ----------------------------------------------------------------------------
function shiftDateUtc(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Re-export for any caller that wants to inspect a freshly-issued row.
export type { CouponRow };
