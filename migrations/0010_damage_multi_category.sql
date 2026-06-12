-- Multi-category damage reports.
-- The existing CHECK constraint on damage_reports.category locks it to a
-- single value; widening it would mean recreating the table (SQLite limit).
-- We add a JSON-array column `categories` instead — new rows write the full
-- list there and keep the legacy `category` column populated with the first
-- entry for backward compat (the damage email subject + Xero export still
-- read it). The backfill maps every existing row to a one-element array so
-- the new code path can read consistently.

ALTER TABLE damage_reports ADD COLUMN categories TEXT;

UPDATE damage_reports
SET categories = '["' || category || '"]'
WHERE categories IS NULL;
