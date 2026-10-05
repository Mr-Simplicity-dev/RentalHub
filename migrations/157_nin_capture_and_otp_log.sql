-- 157: identity NIN capture + OTP audit log
--
-- 1) date_of_birth: Prembly NIN verification requires it, so a user adding their
--    NIN after signup supplies their date of birth which is stored for KYC/audit.
-- 2) verification_otp_log: forward-only audit trail for OTP/verification codes
--    (phone + email) — status, timestamps, IP and device, for evidence and support.
--    The raw code is intentionally NOT stored.

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;

CREATE TABLE IF NOT EXISTS verification_otp_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contact VARCHAR(255),
  channel VARCHAR(16) NOT NULL,
  purpose VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  ip_address VARCHAR(64),
  device_info VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_otp_log_user ON verification_otp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_otp_log_contact ON verification_otp_log(contact);
