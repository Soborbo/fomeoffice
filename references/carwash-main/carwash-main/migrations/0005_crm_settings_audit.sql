-- migrations/0005_crm_settings_audit.sql
-- Settings (super admin editable), CRM audit log, daily summary email log,
-- Stripe webhook events log.

-- ==========================================================================
-- SETTINGS — key-value config
-- ==========================================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by INTEGER REFERENCES workers(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('opening_time',                            '09:00', 'Daily opening time HH:MM (Mon-Sat)'),
  ('closing_time',                            '19:00', 'Daily closing time HH:MM (Mon-Sat)'),
  ('sunday_opening_time',                     '09:00', 'Sunday opening time HH:MM'),
  ('sunday_closing_time',                     '17:00', 'Sunday closing time HH:MM'),
  ('reminder_admin_minutes_after_close',      '5',     'Minutes after closing for first reminder'),
  ('reminder_super_admin_minutes_after_close','20',    'Minutes after closing for escalation'),
  ('super_admin_email',                       '',      'Super admin email — set this!'),
  ('damage_notification_emails',              '[]',    'JSON array of emails for damage alerts'),
  ('daily_summary_email_time',                '22:00', 'When to send daily summary email'),
  ('currency',                                'GBP',   'ISO currency code'),
  ('timezone',                                'Europe/London', 'IANA timezone'),
  ('locale',                                  'en',    'Default locale (en or ar-EG)'),
  ('vat_registered',                          '0',     'Are we VAT registered? 1/0'),
  ('vat_rate',                                '20',    'VAT rate percent'),
  ('cash_variance_threshold',                 '500',   'Pence (£5) — variance triggers required notes'),
  ('cash_variance_pattern_days',              '4',     'How many short days in a row trigger super admin alert'),
  ('stripe_enabled',                          '0',     'Stripe live? 1/0'),
  ('stripe_test_mode',                        '1',     'Stripe in test mode? 1/0'),
  ('default_full_day_pay',                    '10000', 'Default full day pay in pence'),
  ('default_half_day_pay',                    '5000',  'Default half day pay in pence'),
  ('invoice_number_prefix',                   'INV',   'Invoice number prefix'),
  ('invoice_number_year',                     '2026',  'Current year for invoice numbering'),
  ('invoice_number_counter',                  '0',     'Next invoice number — auto-incremented'),
  ('business_name',                           'Painless Car & Van Wash', 'Display name on invoices'),
  ('business_address',                        '290-294 Southmead Road, Bristol BS10 5EN', 'Business address'),
  ('business_phone',                          '07977889747', 'Business phone'),
  ('business_email',                          'office@bristolcarwash.co.uk', 'Business contact email'),
  ('business_vat_number',                     '',      'VAT number if registered'),
  ('image_max_width',                         '1600',  'Max image width in pixels'),
  ('image_quality',                           '0.85',  'WebP quality (0-1)'),
  ('image_max_size_kb',                       '500',   'Max compressed image size, warn user if exceeded'),
  ('image_min_width',                         '600',   'Reject compressed image if width below this'),
  ('image_min_size_kb',                       '30',    'Reject compressed image if size below this (KB)'),
  ('board_polling_seconds',                   '300',   '/board auto-refresh interval (current: 5 min)'),
  ('board_pin_legacy_fallback',               '1',     'Allow legacy BOARD_PIN env var as fallback during cutover');

-- ==========================================================================
-- CRM AUDIT LOG — every admin / super_admin write
-- ==========================================================================
CREATE TABLE IF NOT EXISTS crm_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  performed_by INTEGER NOT NULL REFERENCES workers(id),
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,

  before_json TEXT,
  after_json TEXT,

  ip_address TEXT,
  user_agent TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_performed_by ON crm_audit_log(performed_by, performed_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON crm_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON crm_audit_log(action, performed_at);

-- ==========================================================================
-- DAILY SUMMARY EMAIL LOG — Resend delivery tracking for the daily cron
-- ==========================================================================
CREATE TABLE IF NOT EXISTS daily_email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL UNIQUE,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  recipient TEXT NOT NULL,
  resend_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT
);

-- ==========================================================================
-- STRIPE WEBHOOK EVENTS — idempotent processing log
-- ==========================================================================
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT,
  customer_id TEXT,
  amount INTEGER,
  status TEXT,
  raw_payload TEXT NOT NULL,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processing_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_stripe_events_pi
  ON stripe_webhook_events(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_events_type
  ON stripe_webhook_events(event_type, processed_at);
