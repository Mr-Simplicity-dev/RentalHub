ALTER TABLE prembly_verification_attempts
  ADD COLUMN IF NOT EXISTS verified_identity_name VARCHAR(200);
