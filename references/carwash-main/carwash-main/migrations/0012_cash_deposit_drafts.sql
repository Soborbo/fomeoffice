-- Cash deposits draft state.
-- Same shape as the invoice draft mode (0011): new deposits land as
-- drafts and stay out of the "deposited" calculation until an admin
-- explicitly confirms them.

ALTER TABLE cash_deposits
  ADD COLUMN is_confirmed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE cash_deposits
  ADD COLUMN confirmed_at DATETIME;

ALTER TABLE cash_deposits
  ADD COLUMN confirmed_by INTEGER REFERENCES workers(id);

-- Existing rows pre-date the draft workflow; promote them all to
-- confirmed so the dashboard reconciliation numbers don't change
-- retroactively for already-recorded paying-in slips.
UPDATE cash_deposits
SET is_confirmed = 1,
    confirmed_at = COALESCE(confirmed_at, created_at)
WHERE is_confirmed = 0;

CREATE INDEX IF NOT EXISTS idx_cash_deposits_confirmed
  ON cash_deposits(is_confirmed, deposit_date)
  WHERE deleted_at IS NULL;
