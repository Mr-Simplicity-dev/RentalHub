BEGIN;

ALTER TABLE tenant_registration_payments
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;

COMMIT;
