-- migrations/0003_crm_financial.sql
-- Financial CRM tables: expenses and staff payments.

-- ==========================================================================
-- STAFF PAYMENTS — money paid OUT to workers
-- ==========================================================================
CREATE TABLE IF NOT EXISTS staff_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'cheque')),
  paid_at DATE NOT NULL,
  covers_period_start DATE,
  covers_period_end DATE,
  notes TEXT,
  paid_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_payments_worker ON staff_payments(worker_id, paid_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_date ON staff_payments(paid_at)
  WHERE deleted_at IS NULL;

-- ==========================================================================
-- EXPENSES — outflows; staff_payment_id links 1:1 to a staff_payments row
-- when the category is 'staff'
-- ==========================================================================
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer')),

  category TEXT NOT NULL CHECK (category IN (
    'staff', 'supplies', 'utilities', 'equipment',
    'food', 'rent', 'maintenance', 'marketing', 'other'
  )),

  staff_payment_id INTEGER REFERENCES staff_payments(id),

  description TEXT,
  vendor TEXT,
  receipt_r2_key TEXT,

  vat_amount INTEGER NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 0,

  stripe_invoice_id TEXT,

  xero_bill_id TEXT,
  xero_synced_at DATETIME,

  recorded_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_staff_payment ON expenses(staff_payment_id)
  WHERE staff_payment_id IS NOT NULL;
