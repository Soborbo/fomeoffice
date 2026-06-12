# CRM Migrations — DDL

> Hozzátartozik: `CARWASH-CRM-PLAN-v1.1.md`
> Adatbázis: **Cloudflare D1 (SQLite)**
> Cél: a meglévő booking system DB-jét bővíti CRM-funkciókkal
> Idempotens: minden migráció `IF NOT EXISTS` / `CREATE OR IGNORE` ahol lehet

---

## Migrationek futtatási sorrendje

```bash
# Lokálisan
npx wrangler d1 execute carwash-booking-db --local --file=./migrations/0002_crm_workers_extension.sql
npx wrangler d1 execute carwash-booking-db --local --file=./migrations/0003_crm_operational_tables.sql
npx wrangler d1 execute carwash-booking-db --local --file=./migrations/0004_crm_financial_tables.sql
npx wrangler d1 execute carwash-booking-db --local --file=./migrations/0005_crm_invoice_loyalty.sql
npx wrangler d1 execute carwash-booking-db --local --file=./migrations/0006_crm_settings_audit.sql
npx wrangler d1 execute carwash-booking-db --local --file=./migrations/0007_crm_stripe_ready.sql
npx wrangler d1 execute carwash-booking-db --local --file=./migrations/0008_crm_soft_delete.sql

# Production — minden --local nélkül
```

---

## 0002 — Workers tábla bővítése

```sql
-- migrations/0002_crm_workers_extension.sql

-- Ne fusson ha már megvolt: D1-ben sajnos nincs IF NOT EXISTS az ALTER COLUMN-on,
-- ezért a Phase 0 migration-deploy script-nek le kell futtatnia ezt csak egyszer.
-- Ha újra futtatod, a duplicate column error elnyelhető.

ALTER TABLE workers ADD COLUMN role TEXT NOT NULL DEFAULT 'worker';
   -- Allowed: 'worker' | 'admin' | 'super_admin'
ALTER TABLE workers ADD COLUMN email TEXT;
ALTER TABLE workers ADD COLUMN phone TEXT;
ALTER TABLE workers ADD COLUMN address TEXT;
ALTER TABLE workers ADD COLUMN ni_number TEXT;
ALTER TABLE workers ADD COLUMN full_day_pay INTEGER NOT NULL DEFAULT 10000;  -- pence (£100)
ALTER TABLE workers ADD COLUMN half_day_pay INTEGER NOT NULL DEFAULT 5000;   -- pence (£50)
ALTER TABLE workers ADD COLUMN password_hash TEXT;     -- PBKDF2, csak admin/super_admin
ALTER TABLE workers ADD COLUMN password_salt TEXT;     -- PBKDF2 salt
ALTER TABLE workers ADD COLUMN hired_at DATE;
ALTER TABLE workers ADD COLUMN profile_photo_r2_key TEXT;

-- Email unique INDEX, csak ahol nem null
CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_email ON workers(email)
  WHERE email IS NOT NULL;

-- Role lookup (admin dashboardon gyakori query)
CREATE INDEX IF NOT EXISTS idx_workers_role ON workers(role) WHERE active = 1;
```

---

## 0003 — Operational tables

```sql
-- migrations/0003_crm_operational_tables.sql

-- =========================================================
-- DAILY SUMMARY — napi zárás
-- =========================================================
CREATE TABLE IF NOT EXISTS daily_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL UNIQUE,

  -- ENTERED VALUES
  cash_total INTEGER NOT NULL DEFAULT 0,           -- pence
  card_total INTEGER NOT NULL DEFAULT 0,           -- pence
  cars_inside INTEGER NOT NULL DEFAULT 0,
  cars_outside INTEGER NOT NULL DEFAULT 0,

  -- COMPUTED EXPECTED VALUES (snapshot at submission)
  expected_cash INTEGER,
  expected_card INTEGER,

  -- DERIVED
  cash_variance INTEGER GENERATED ALWAYS AS (cash_total - expected_cash) VIRTUAL,
  card_variance INTEGER GENERATED ALWAYS AS (card_total - expected_card) VIRTUAL,

  notes TEXT,
  filled_by INTEGER REFERENCES workers(id),
  filled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_locked INTEGER NOT NULL DEFAULT 0,            -- super admin lockolja
  locked_at DATETIME,
  locked_by INTEGER REFERENCES workers(id),

  -- Soft delete
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summary(date);

-- =========================================================
-- STAFF ATTENDANCE — napi jelenlét
-- =========================================================
CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  date DATE NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('full', 'half', 'overtime')),
  pay_amount INTEGER NOT NULL,                     -- pence, snapshotolt
  notes TEXT,
  recorded_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id),
  UNIQUE(worker_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_worker ON staff_attendance(worker_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON staff_attendance(date);

-- =========================================================
-- WALK-IN TRANSACTIONS — utcáról bejövők
-- =========================================================
CREATE TABLE IF NOT EXISTS walkin_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  car_size TEXT NOT NULL CHECK (car_size IN ('small', 'large', 'suv', 'camper', 'sports')),
  service_type TEXT NOT NULL CHECK (service_type IN ('inside_only', 'outside_only', 'inside_and_outside')),
  package_id INTEGER REFERENCES services(id),

  price INTEGER NOT NULL,                          -- pence, SNAPSHOT (Hard Rule #3)
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),

  -- Marketing capture (opcionális)
  customer_email TEXT,
  customer_id INTEGER REFERENCES customers(id),    -- ha létezik már a customers-ben
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,

  -- Stripe-ready (Phase 8)
  stripe_payment_intent_id TEXT,
  stripe_status TEXT,

  recorded_by INTEGER REFERENCES workers(id),
  bay_id INTEGER REFERENCES bays(id),

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- timestamp = heatmap data
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_walkin_date ON walkin_transactions(date);
CREATE INDEX IF NOT EXISTS idx_walkin_created ON walkin_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_walkin_customer ON walkin_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_walkin_email ON walkin_transactions(customer_email)
  WHERE customer_email IS NOT NULL;

-- =========================================================
-- DAMAGE REPORTS
-- =========================================================
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
  compensation_amount INTEGER,                     -- pence

  photo_r2_keys TEXT,                              -- JSON array
  notification_sent_at DATETIME,                   -- email super adminnak megment

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  resolved_by INTEGER REFERENCES workers(id),
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_damage_status ON damage_reports(resolution_status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_damage_worker ON damage_reports(worker_responsible);
```

---

## 0004 — Financial tables

```sql
-- migrations/0004_crm_financial_tables.sql

-- =========================================================
-- STAFF PAYMENTS — fizetések (mit fizettünk ki workereknek)
-- =========================================================
CREATE TABLE IF NOT EXISTS staff_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  amount INTEGER NOT NULL,                         -- pence
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'cheque')),
  paid_at DATE NOT NULL,
  covers_period_start DATE,
  covers_period_end DATE,
  notes TEXT,
  paid_by INTEGER REFERENCES workers(id),          -- super admin
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_payments_worker ON staff_payments(worker_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_date ON staff_payments(paid_at);

-- =========================================================
-- EXPENSES — kiadások
-- =========================================================
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  amount INTEGER NOT NULL,                         -- pence
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer')),

  category TEXT NOT NULL CHECK (category IN (
    'staff', 'supplies', 'utilities', 'equipment',
    'food', 'rent', 'maintenance', 'marketing', 'other'
  )),

  -- Ha staff payment, link a staff_payments-re (1-to-1)
  staff_payment_id INTEGER REFERENCES staff_payments(id),

  description TEXT,
  vendor TEXT,
  receipt_r2_key TEXT,

  -- VAT support (Stage 1.5+)
  vat_amount INTEGER DEFAULT 0,                    -- pence
  vat_rate INTEGER DEFAULT 0,                      -- százalék × 100 (2000 = 20.00%)

  -- Stripe-ready
  stripe_invoice_id TEXT,                          -- ha Stripe-on keresztül kifizetett (jövőben)

  -- Xero ready (Stage 2)
  xero_bill_id TEXT,
  xero_synced_at DATETIME,

  recorded_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_staff_payment ON expenses(staff_payment_id);
```

---

## 0005 — Invoices and loyalty preparation

```sql
-- migrations/0005_crm_invoice_loyalty.sql

-- =========================================================
-- CUSTOMERS bővítése (loyalty preparation)
-- =========================================================
ALTER TABLE customers ADD COLUMN customer_type TEXT NOT NULL DEFAULT 'retail';
   -- 'retail' | 'corporate' | 'fleet'
ALTER TABLE customers ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN total_spent INTEGER NOT NULL DEFAULT 0;     -- pence
ALTER TABLE customers ADD COLUMN visit_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN loyalty_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN marketing_consent_at DATETIME;
ALTER TABLE customers ADD COLUMN payment_terms_days INTEGER DEFAULT 0;       -- corporate: 30
ALTER TABLE customers ADD COLUMN stripe_customer_id TEXT;                    -- Phase 8
ALTER TABLE customers ADD COLUMN deleted_at DATETIME;
ALTER TABLE customers ADD COLUMN deleted_by INTEGER REFERENCES workers(id);

CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_marketing ON customers(marketing_consent)
  WHERE marketing_consent = 1;

-- =========================================================
-- CUSTOMER VISITS — minden látogatás (loyalty schema)
-- =========================================================
CREATE TABLE IF NOT EXISTS customer_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  visit_date DATE NOT NULL,
  booking_id INTEGER REFERENCES bookings(id),
  walkin_id INTEGER REFERENCES walkin_transactions(id),
  amount_spent INTEGER NOT NULL,                   -- pence (snapshot)
  package_used TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  CHECK (booking_id IS NOT NULL OR walkin_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_visits_customer ON customer_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON customer_visits(visit_date);

-- =========================================================
-- INVOICES — számlák/nyugták
-- =========================================================
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,             -- pl. 'INV-2026-0001'

  booking_id INTEGER REFERENCES bookings(id),
  walkin_id INTEGER REFERENCES walkin_transactions(id),
  customer_id INTEGER REFERENCES customers(id),

  customer_email TEXT NOT NULL,
  customer_name TEXT,

  amount INTEGER NOT NULL,                         -- pence (gross)
  vat_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER GENERATED ALWAYS AS (amount - vat_amount) VIRTUAL,

  items_json TEXT NOT NULL,                        -- JSON array of line items

  marketing_opt_in INTEGER NOT NULL DEFAULT 0,

  -- Stripe-ready
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,

  -- Xero-ready (Stage 2)
  xero_invoice_id TEXT,
  xero_synced_at DATETIME,

  sent_at DATETIME,
  send_status TEXT DEFAULT 'pending'
    CHECK (send_status IN ('pending', 'sent', 'failed', 'bounced')),
  send_error TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id),

  CHECK (booking_id IS NOT NULL OR walkin_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_send_status ON invoices(send_status)
  WHERE send_status IN ('pending', 'failed');
```

---

## 0006 — Settings + audit log

```sql
-- migrations/0006_crm_settings_audit.sql

-- =========================================================
-- SETTINGS — super admin által szerkeszthető
-- =========================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by INTEGER REFERENCES workers(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed értékek
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('opening_time',                            '08:00', 'Daily opening time HH:MM'),
  ('closing_time',                            '18:00', 'Daily closing time HH:MM'),
  ('reminder_admin_minutes_after_close',      '5',     'Minutes after closing for first reminder'),
  ('reminder_super_admin_minutes_after_close','20',    'Minutes after closing for escalation'),
  ('super_admin_email',                       '',      'Super admin email — set this!'),
  ('damage_notification_emails',              '[]',    'JSON array of emails for damage alerts'),
  ('daily_summary_email_time',                '22:00', 'When to send daily summary email'),
  ('currency',                                'GBP',   'ISO currency code'),
  ('vat_registered',                          '0',     'Are we VAT registered? 1/0'),
  ('vat_rate',                                '20',    'VAT rate percent'),
  ('cash_variance_threshold',                 '500',   'Pence (£5) — variance triggers required notes'),
  ('cash_variance_pattern_days',              '4',     'How many short days in a row trigger super admin alert'),
  ('stripe_enabled',                          '0',     'Stripe live? 1/0 — see Phase 8'),
  ('stripe_test_mode',                        '1',     'Stripe in test mode? 1/0'),
  ('default_full_day_pay',                    '10000', 'Default full day pay in pence'),
  ('default_half_day_pay',                    '5000',  'Default half day pay in pence'),
  ('invoice_number_prefix',                   'INV',   'Invoice number prefix'),
  ('invoice_number_year',                     '2026',  'Current year for invoice numbering'),
  ('invoice_number_counter',                  '0',     'Next invoice number — auto-incremented'),
  ('business_name',                           'Painless Car Wash', 'Display name on invoices'),
  ('business_address',                        '', 'Display address on invoices'),
  ('business_vat_number',                     '', 'VAT number if registered'),
  ('image_max_width',                         '1600', 'Max image width in pixels'),
  ('image_quality',                           '0.85', 'WebP quality (0-1)'),
  ('image_max_size_kb',                       '500',  'Max compressed image size, warn user if exceeded');

-- =========================================================
-- CRM AUDIT LOG — minden admin/super admin művelet
-- =========================================================
CREATE TABLE IF NOT EXISTS crm_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  performed_by INTEGER NOT NULL REFERENCES workers(id),
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  action TEXT NOT NULL,                            -- pl. 'expense.create', 'staff.update', 'damage.delete'
  entity_type TEXT NOT NULL,                       -- 'expense' | 'worker' | 'damage_report' | etc.
  entity_id INTEGER,

  -- JSON snapshot before/after (a változás láthatóvá tétele)
  before_json TEXT,
  after_json TEXT,

  ip_address TEXT,
  user_agent TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_performed_by ON crm_audit_log(performed_by, performed_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON crm_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON crm_audit_log(action, performed_at);

-- =========================================================
-- DAILY SUMMARY EMAIL LOG (Resend send tracking)
-- =========================================================
CREATE TABLE IF NOT EXISTS daily_email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL UNIQUE,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  recipient TEXT NOT NULL,
  resend_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT
);
```

---

## 0007 — Stripe-ready (Phase 8 előkészítés)

```sql
-- migrations/0007_crm_stripe_ready.sql

-- A workflow: env vars + ezek a mezők. Stripe code is built but feature-flagged.
-- A `settings.stripe_enabled` váltja át.

-- =========================================================
-- BOOKINGS — Stripe mezők hozzáadása
-- =========================================================
-- A meglévő `bookings` tábla már létezik. Csak bővítés.
ALTER TABLE bookings ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN stripe_status TEXT;
   -- 'requires_payment_method', 'requires_confirmation', 'requires_action',
   -- 'processing', 'succeeded', 'canceled'
ALTER TABLE bookings ADD COLUMN stripe_amount INTEGER;
ALTER TABLE bookings ADD COLUMN paid_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_bookings_stripe_pi
  ON bookings(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- =========================================================
-- STRIPE WEBHOOK EVENTS LOG — minden esemény duplikáció-mentes feldolgozása
-- =========================================================
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,                             -- Stripe event ID (idempotencia)
  event_type TEXT NOT NULL,
  payment_intent_id TEXT,
  customer_id TEXT,
  amount INTEGER,
  status TEXT,
  raw_payload TEXT NOT NULL,                       -- teljes JSON
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processing_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_stripe_events_pi
  ON stripe_webhook_events(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type
  ON stripe_webhook_events(event_type, processed_at);
```

---

## 0008 — Soft delete + utility helpers

```sql
-- migrations/0008_crm_soft_delete.sql

-- =========================================================
-- VIEW-ek a "live" rekordokhoz — minden query-nek ezeket kell használnia
-- =========================================================

CREATE VIEW IF NOT EXISTS live_workers AS
  SELECT * FROM workers WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_customers AS
  SELECT * FROM customers WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_expenses AS
  SELECT * FROM expenses WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_damage_reports AS
  SELECT * FROM damage_reports WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_walkin_transactions AS
  SELECT * FROM walkin_transactions WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_invoices AS
  SELECT * FROM invoices WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_staff_payments AS
  SELECT * FROM staff_payments WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_daily_summary AS
  SELECT * FROM daily_summary WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_staff_attendance AS
  SELECT * FROM staff_attendance WHERE deleted_at IS NULL;

-- =========================================================
-- TRIGGEREK — auto update timestamps
-- =========================================================

CREATE TRIGGER IF NOT EXISTS trg_settings_updated
AFTER UPDATE ON settings
BEGIN
  UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;

-- =========================================================
-- TRIGGER — customer total_spent és visit_count auto-update
-- =========================================================

CREATE TRIGGER IF NOT EXISTS trg_customer_visit_insert
AFTER INSERT ON customer_visits
BEGIN
  UPDATE customers
    SET total_spent = total_spent + NEW.amount_spent,
        visit_count = visit_count + 1
    WHERE id = NEW.customer_id;
END;
```

---

## Rollback (DOWN migrations)

D1 nem támogat tranzakciós DDL rollback-et out-of-the-box. Ha rollback kell:

```sql
-- migrations/down/0008_drop_views.sql
DROP VIEW IF EXISTS live_workers;
DROP VIEW IF EXISTS live_customers;
DROP VIEW IF EXISTS live_expenses;
DROP VIEW IF EXISTS live_damage_reports;
DROP VIEW IF EXISTS live_walkin_transactions;
DROP VIEW IF EXISTS live_invoices;
DROP VIEW IF EXISTS live_staff_payments;
DROP VIEW IF EXISTS live_daily_summary;
DROP VIEW IF EXISTS live_staff_attendance;
DROP TRIGGER IF EXISTS trg_settings_updated;
DROP TRIGGER IF EXISTS trg_customer_visit_insert;

-- migrations/down/0007_drop_stripe.sql
-- Note: ALTER TABLE DROP COLUMN nem támogatott D1-ben — a teljes táblát kell újraépíteni.
-- Stripe rollback esetén a kódot disable-eled, az oszlopok maradnak null-ban.
DROP TABLE IF EXISTS stripe_webhook_events;

-- migrations/down/0006_drop_settings_audit.sql
DROP TABLE IF EXISTS daily_email_log;
DROP TABLE IF EXISTS crm_audit_log;
DROP TABLE IF EXISTS settings;

-- migrations/down/0005_drop_invoices.sql
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS customer_visits;
-- customers oszlopok: nem droppolható D1-ben

-- migrations/down/0004_drop_financial.sql
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS staff_payments;

-- migrations/down/0003_drop_operational.sql
DROP TABLE IF EXISTS damage_reports;
DROP TABLE IF EXISTS walkin_transactions;
DROP TABLE IF EXISTS staff_attendance;
DROP TABLE IF EXISTS daily_summary;
```

> **Fontos**: D1-ben nincs `ALTER TABLE DROP COLUMN`. Ha tényleg le kell vágni egy oszlopot, recreate-eled a táblát + insert select. Ezért a Stripe-mezők bevezetése biztonságos — kikapcsoláskor a kód nem írja, az adat nullra marad.

---

## Migration testing checklist

```bash
# 1. Lokálisan minden migration egymás után fusson hibátlanul
for f in migrations/*.sql; do
  npx wrangler d1 execute carwash-booking-db --local --file="$f"
done

# 2. Idempotencia — futtasd újra, ne hibázzon (kivéve ALTER ADD COLUMN, lásd alább)
for f in migrations/*.sql; do
  npx wrangler d1 execute carwash-booking-db --local --file="$f"
done
# Megj.: ALTER TABLE ADD COLUMN duplicate-error a 2.-ban — ezt a deploy-szkript filterezze

# 3. Production migráció — backup ELŐTTE
npx wrangler d1 export carwash-booking-db --output=backup-$(date +%Y%m%d).sql
for f in migrations/*.sql; do
  npx wrangler d1 execute carwash-booking-db --file="$f"
done
```

---

**Vége — ezzel a 7 migration-fájllal a Phase 0 schema-szinten elindítható.**
