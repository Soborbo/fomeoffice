-- migrations/0004_crm_invoices.sql
-- Invoices + customer visit log (loyalty schema preparation).

-- ==========================================================================
-- CUSTOMER VISITS — every wash, regardless of source (booking or walk-in)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS customer_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  visit_date DATE NOT NULL,
  booking_id INTEGER REFERENCES bookings(id),
  walkin_id INTEGER REFERENCES walkin_transactions(id),
  amount_spent INTEGER NOT NULL,
  package_used TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  CHECK (booking_id IS NOT NULL OR walkin_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_visits_customer ON customer_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON customer_visits(visit_date);

-- ==========================================================================
-- INVOICES — receipts emailed to customers
-- ==========================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,

  booking_id INTEGER REFERENCES bookings(id),
  walkin_id INTEGER REFERENCES walkin_transactions(id),
  customer_id INTEGER REFERENCES customers(id),

  customer_email TEXT NOT NULL,
  customer_name TEXT,

  amount INTEGER NOT NULL,
  vat_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER GENERATED ALWAYS AS (amount - vat_amount) VIRTUAL,

  items_json TEXT NOT NULL,

  marketing_opt_in INTEGER NOT NULL DEFAULT 0,

  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,

  xero_invoice_id TEXT,
  xero_synced_at DATETIME,

  sent_at DATETIME,
  send_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (send_status IN ('pending', 'sent', 'failed', 'bounced')),
  send_error TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id),

  CHECK (booking_id IS NOT NULL OR walkin_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)
  WHERE customer_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_send_status ON invoices(send_status)
  WHERE send_status IN ('pending', 'failed') AND deleted_at IS NULL;
