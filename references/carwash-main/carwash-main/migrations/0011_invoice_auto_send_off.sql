-- Invoice auto-send toggle.
-- When 'invoice_auto_send' is '0', the orchestrator inserts the invoice row
-- and customer_visits row as usual but skips the Resend email send. The row
-- stays at send_status='pending' (effectively a draft) and an admin must
-- click "Send email" from /app/invoices/<id> to push it.
-- Default for this deployment is OFF — drafts only.

INSERT OR REPLACE INTO settings (key, value) VALUES ('invoice_auto_send', '0');
