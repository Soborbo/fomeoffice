-- migrations/0001_foundation.sql
-- The complete starting schema for the Bristol Car Wash CRM.
-- Tables created in their FINAL shape. No ALTER chains anywhere.
-- Money: INTEGER pence everywhere. Timestamps: SQLite DATETIME (UTC where datetime('now')).

-- ==========================================================================
-- WORKERS — staff & auth principals (worker / admin / super_admin)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,

  role TEXT NOT NULL DEFAULT 'worker'
    CHECK (role IN ('worker', 'admin', 'super_admin')),
  pin_hash TEXT,
  pin_salt TEXT,
  password_hash TEXT,
  password_salt TEXT,

  email TEXT,
  phone TEXT,
  address TEXT,
  ni_number TEXT,

  full_day_pay INTEGER NOT NULL DEFAULT 10000,
  half_day_pay INTEGER NOT NULL DEFAULT 5000,

  hired_at DATE,
  profile_photo_r2_key TEXT,

  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_email ON workers(email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workers_role ON workers(role)
  WHERE active = 1 AND deleted_at IS NULL;

-- ==========================================================================
-- SESSIONS — admin / super_admin login sessions
-- ==========================================================================
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  expires_at DATETIME NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_worker ON sessions(worker_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ==========================================================================
-- CUSTOMERS — dedup'd from booking inserts (match by email or phone)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  license_plate TEXT,

  customer_type TEXT NOT NULL DEFAULT 'retail'
    CHECK (customer_type IN ('retail', 'corporate', 'fleet')),
  discount_percent INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  loyalty_credits INTEGER NOT NULL DEFAULT 0,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  marketing_consent_at DATETIME,
  payment_terms_days INTEGER NOT NULL DEFAULT 0,
  notes TEXT,

  stripe_customer_id TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers(email)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_marketing ON customers(marketing_consent)
  WHERE marketing_consent = 1 AND deleted_at IS NULL;

-- ==========================================================================
-- SERVICES — seeded from BookingForm.astro (Phase 0 informational only;
-- bookings.price is the snapshot of record per Hard Rule #3)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  vehicle_type TEXT NOT NULL
    CHECK (vehicle_type IN ('car', 'suv', 'van', 'caravan', 'motorhome', 'supercar')),
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  base_price INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (code, vehicle_type)
);
CREATE INDEX IF NOT EXISTS idx_services_code_vehicle ON services(code, vehicle_type);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active, sort_order);

-- ==========================================================================
-- BAYS — wash bays (informational; assignment optional)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS bays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  compatible_services TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ==========================================================================
-- BOOKINGS — 1:1 mirror of the Sheets row plus structured fields.
-- Sheets remains the safety-net source until cutover (≥10 consecutive days
-- of zero diff). D1 is the operational source of truth from day 1.
-- ==========================================================================
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  customer_id INTEGER REFERENCES customers(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,

  service_id INTEGER REFERENCES services(id),
  service_code TEXT NOT NULL,
  service_label TEXT NOT NULL,
  vehicle_type TEXT NOT NULL
    CHECK (vehicle_type IN ('car', 'suv', 'van', 'caravan', 'motorhome', 'supercar')),
  vehicle_label TEXT NOT NULL,

  price INTEGER NOT NULL,
  duration_minutes INTEGER,

  date DATE NOT NULL,
  time TEXT,
  starts_at DATETIME,

  bay_id INTEGER REFERENCES bays(id),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'no_show', 'cancelled')),
  payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'bank_transfer')),
  source TEXT NOT NULL DEFAULT 'website'
    CHECK (source IN ('website', 'walk_in', 'admin', 'phone')),

  customer_note TEXT,
  internal_note TEXT,
  license_plate TEXT,

  gclid TEXT,
  fbclid TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  sheet_row INTEGER,
  sheet_synced_at DATETIME,

  stripe_payment_intent_id TEXT,
  stripe_status TEXT,
  stripe_amount INTEGER,
  paid_at DATETIME,

  cancelled_at DATETIME,
  cancelled_by_worker_id INTEGER REFERENCES workers(id),
  cancellation_reason TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_bookings_starts ON bookings(starts_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id)
  WHERE customer_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_sheet_row ON bookings(sheet_row)
  WHERE sheet_row IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_stripe_pi ON bookings(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ==========================================================================
-- BOOKING_LOG — every status change / write made via /board PIN flow
-- ==========================================================================
CREATE TABLE IF NOT EXISTS booking_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('website', 'worker', 'admin', 'super_admin', 'system')),
  actor_worker_id INTEGER REFERENCES workers(id),
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_booking_log_booking ON booking_log(booking_id, created_at);
CREATE INDEX IF NOT EXISTS idx_booking_log_action ON booking_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_booking_log_actor ON booking_log(actor_worker_id, created_at)
  WHERE actor_worker_id IS NOT NULL;
