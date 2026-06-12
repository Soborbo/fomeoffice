-- migrations/0002_crm_operational.sql
-- Operational CRM tables: daily reconciliation, attendance, walk-ins, damage.

-- ==========================================================================
-- DAILY SUMMARY — end-of-day reconciliation form
-- ==========================================================================
CREATE TABLE IF NOT EXISTS daily_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL UNIQUE,

  cash_total INTEGER NOT NULL DEFAULT 0,
  card_total INTEGER NOT NULL DEFAULT 0,
  cars_inside INTEGER NOT NULL DEFAULT 0,
  cars_outside INTEGER NOT NULL DEFAULT 0,

  expected_cash INTEGER,
  expected_card INTEGER,

  cash_variance INTEGER GENERATED ALWAYS AS (cash_total - expected_cash) VIRTUAL,
  card_variance INTEGER GENERATED ALWAYS AS (card_total - expected_card) VIRTUAL,

  notes TEXT,
  filled_by INTEGER REFERENCES workers(id),
  filled_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  is_locked INTEGER NOT NULL DEFAULT 0,
  locked_at DATETIME,
  locked_by INTEGER REFERENCES workers(id),

  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summary(date)
  WHERE deleted_at IS NULL;

-- ==========================================================================
-- STAFF ATTENDANCE — one record per worker per day
-- ==========================================================================
CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  date DATE NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('full', 'half', 'overtime')),
  pay_amount INTEGER NOT NULL,
  notes TEXT,
  recorded_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id),
  UNIQUE (worker_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_worker ON staff_attendance(worker_id, date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_date ON staff_attendance(date)
  WHERE deleted_at IS NULL;

-- ==========================================================================
-- WALK-IN TRANSACTIONS — drive-up customers logged from /board
-- ==========================================================================
CREATE TABLE IF NOT EXISTS walkin_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  car_size TEXT NOT NULL CHECK (car_size IN ('small', 'large', 'suv', 'camper', 'sports')),
  service_type TEXT NOT NULL
    CHECK (service_type IN ('inside_only', 'outside_only', 'inside_and_outside')),
  service_id INTEGER REFERENCES services(id),

  price INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),

  customer_email TEXT,
  customer_id INTEGER REFERENCES customers(id),
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,

  stripe_payment_intent_id TEXT,
  stripe_status TEXT,

  recorded_by INTEGER REFERENCES workers(id),
  bay_id INTEGER REFERENCES bays(id),

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_walkin_date ON walkin_transactions(date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_walkin_created ON walkin_transactions(created_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_walkin_customer ON walkin_transactions(customer_id)
  WHERE customer_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_walkin_email ON walkin_transactions(customer_email)
  WHERE customer_email IS NOT NULL AND deleted_at IS NULL;

-- ==========================================================================
-- DAMAGE REPORTS — incidents with photos in R2
-- ==========================================================================
CREATE TABLE IF NOT EXISTS damage_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  occurred_at DATETIME NOT NULL,

  reported_by INTEGER NOT NULL REFERENCES workers(id),
  worker_responsible INTEGER REFERENCES workers(id),

  category TEXT NOT NULL CHECK (category IN (
    'scratch', 'mirror_damage', 'dent', 'paint_damage',
    'wheel_damage', 'interior_damage', 'glass_damage', 'other'
  )),
  description TEXT NOT NULL,

  customer_name TEXT,
  customer_phone TEXT,
  vehicle_registration TEXT,

  resolution TEXT,
  resolution_status TEXT NOT NULL DEFAULT 'open'
    CHECK (resolution_status IN ('open', 'in_progress', 'resolved', 'escalated', 'cancelled')),
  compensation_amount INTEGER,

  photo_r2_keys TEXT,
  notification_sent_at DATETIME,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  resolved_by INTEGER REFERENCES workers(id),
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_damage_status ON damage_reports(resolution_status, occurred_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_damage_worker ON damage_reports(worker_responsible)
  WHERE worker_responsible IS NOT NULL AND deleted_at IS NULL;
