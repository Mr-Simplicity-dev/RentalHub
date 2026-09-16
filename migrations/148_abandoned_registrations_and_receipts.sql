-- 148_abandoned_registrations_and_receipts.sql
-- Adds tracking columns for abandoned registration reminders and cleanup,
-- and ensures index for pending registration queries.

BEGIN;

ALTER TABLE tenant_registration_payments
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenant_reg_payments_status_created
  ON tenant_registration_payments(payment_status, created_at);

CREATE INDEX IF NOT EXISTS idx_tenant_reg_payments_reminder
  ON tenant_registration_payments(payment_status, reminder_count, reminder_sent_at);

COMMIT;
