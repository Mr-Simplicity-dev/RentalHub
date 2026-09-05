-- 147_payment_receipts_sent.sql
-- Idempotency guard for on-behalf rent receipts: both the Paystack webhook and
-- the explicit verify endpoint can complete the same payment, so mark when the
-- tenant + payer receipts were sent to avoid double emails.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS receipts_sent_at TIMESTAMPTZ;
