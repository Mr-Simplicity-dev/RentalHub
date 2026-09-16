-- Forensic hardening for rent payments (initiator context + consent).
-- Mirrors the withdrawal hardening: tie a payment to the session/device that
-- started it and to an explicit consent, so a "I did not pay for this" claim
-- can be answered with evidence.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS initiated_ip VARCHAR(64),
  ADD COLUMN IF NOT EXISTS initiated_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE rent_payment_requests
  ADD COLUMN IF NOT EXISTS created_ip VARCHAR(64),
  ADD COLUMN IF NOT EXISTS created_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS beneficiary_confirmed_at TIMESTAMP;
