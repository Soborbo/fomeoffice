-- migrations/0009_ocr_settings.sql
-- Receipt OCR via Anthropic Vision — settings only, no schema changes.

INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('ocr_enabled',     '0', 'Receipt OCR via Anthropic Vision? 1/0. Requires ANTHROPIC_API_KEY secret.'),
  ('ocr_model',       'claude-haiku-4-5-20251001', 'Anthropic model for receipt OCR'),
  ('ocr_max_tokens',  '1024', 'Max output tokens for OCR call');
