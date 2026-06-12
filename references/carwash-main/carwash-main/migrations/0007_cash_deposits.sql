-- migrations/0007_cash_deposits.sql
-- Cash deposit ledger — every paying-in slip / bank deposit of physical cash.
-- Lets the dashboard reconcile "cash collected" vs "cash deposited" so we
-- can see how much cash is sitting on hand or in the safe.

-- ==========================================================================
-- CASH DEPOSITS — money walked to the bank
-- ==========================================================================
CREATE TABLE IF NOT EXISTS cash_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_date DATE NOT NULL,
  amount INTEGER NOT NULL,                 -- pence
  reference TEXT,                          -- bank slip / paying-in book ref
  note TEXT,
  recorded_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by INTEGER REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_date ON cash_deposits(deposit_date)
  WHERE deleted_at IS NULL;

-- ==========================================================================
-- LIVE VIEW — non-deleted rows. Reads must use this (Phase 0a hard rule).
-- ==========================================================================
CREATE VIEW IF NOT EXISTS live_cash_deposits AS
  SELECT * FROM cash_deposits WHERE deleted_at IS NULL;
