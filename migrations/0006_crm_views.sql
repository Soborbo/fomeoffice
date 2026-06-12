-- migrations/0006_crm_views.sql
-- Live (non-deleted) views and triggers.
-- READ RULE: queries against soft-deletable tables MUST use the live_* view.

-- ==========================================================================
-- LIVE VIEWS — all rows where deleted_at IS NULL
-- ==========================================================================
CREATE VIEW IF NOT EXISTS live_workers AS
  SELECT * FROM workers WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_customers AS
  SELECT * FROM customers WHERE deleted_at IS NULL;

CREATE VIEW IF NOT EXISTS live_bookings AS
  SELECT * FROM bookings WHERE deleted_at IS NULL;

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

-- ==========================================================================
-- TRIGGERS
-- ==========================================================================

-- settings.updated_at auto-update on UPDATE
CREATE TRIGGER IF NOT EXISTS trg_settings_updated
AFTER UPDATE ON settings
FOR EACH ROW
BEGIN
  UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;

-- workers.updated_at auto-update
CREATE TRIGGER IF NOT EXISTS trg_workers_updated
AFTER UPDATE ON workers
FOR EACH ROW
WHEN OLD.updated_at IS NEW.updated_at
BEGIN
  UPDATE workers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- customers.updated_at auto-update
CREATE TRIGGER IF NOT EXISTS trg_customers_updated
AFTER UPDATE ON customers
FOR EACH ROW
WHEN OLD.updated_at IS NEW.updated_at
BEGIN
  UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- bookings.updated_at auto-update
CREATE TRIGGER IF NOT EXISTS trg_bookings_updated
AFTER UPDATE ON bookings
FOR EACH ROW
WHEN OLD.updated_at IS NEW.updated_at
BEGIN
  UPDATE bookings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- services.updated_at auto-update
CREATE TRIGGER IF NOT EXISTS trg_services_updated
AFTER UPDATE ON services
FOR EACH ROW
WHEN OLD.updated_at IS NEW.updated_at
BEGIN
  UPDATE services SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- customer_visits insert -> bump customers.total_spent + visit_count
CREATE TRIGGER IF NOT EXISTS trg_customer_visit_insert
AFTER INSERT ON customer_visits
FOR EACH ROW
BEGIN
  UPDATE customers
    SET total_spent = total_spent + NEW.amount_spent,
        visit_count = visit_count + 1
    WHERE id = NEW.customer_id;
END;
