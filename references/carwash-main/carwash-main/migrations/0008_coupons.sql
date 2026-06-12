-- migrations/0008_coupons.sql
-- Coupons table — issued by the loyalty engine (every Nth visit) and, in a
-- later phase, manually from /admin. This phase only ISSUES; redemption
-- (booking form integration) is deferred. Schema is final, no ALTERs later.

-- ==========================================================================
-- COUPONS
-- ==========================================================================
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- e.g. CARWASH-AB12CD34

  source TEXT NOT NULL                       -- where the coupon came from
    CHECK (source IN ('loyalty', 'promo', 'referral', 'manual')),

  customer_id INTEGER REFERENCES customers(id),  -- NULL = anyone can use
  issued_for_visit_count INTEGER,            -- snapshot of customer.visit_count when issued (loyalty only)

  discount_type TEXT NOT NULL                -- frozen at issue time
    CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL,           -- percent: 0-100; fixed: pence

  valid_from DATE,
  valid_until DATE,

  max_uses INTEGER NOT NULL DEFAULT 1,
  current_uses INTEGER NOT NULL DEFAULT 0,

  issued_by INTEGER REFERENCES workers(id),  -- NULL when issued by the loyalty engine
  notes TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_customer ON coupons(customer_id)
  WHERE customer_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_source ON coupons(source, created_at)
  WHERE deleted_at IS NULL;

-- ==========================================================================
-- LIVE VIEW
-- ==========================================================================
CREATE VIEW IF NOT EXISTS live_coupons AS
  SELECT * FROM coupons WHERE deleted_at IS NULL;

-- ==========================================================================
-- LOYALTY SETTINGS — all default to off / zero. Operator opts in.
-- ==========================================================================
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('loyalty_enabled',                '0',  'Loyalty engine on? 1/0. When 0 no coupons are issued.'),
  ('loyalty_visits_for_reward',      '10', 'Issue a reward coupon every Nth visit'),
  ('loyalty_reward_percent',         '0',  'Reward discount percent (1-100). 0 = no coupon issued even when enabled.'),
  ('loyalty_coupon_validity_days',   '90', 'Days from issue date until the coupon expires');
