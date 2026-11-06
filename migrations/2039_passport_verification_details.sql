ALTER TABLE prembly_verification_attempts
  ADD COLUMN IF NOT EXISTS verified_document_number_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS verified_document_type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS verified_document_expiry VARCHAR(40),
  ADD COLUMN IF NOT EXISTS verification_input_hash VARCHAR(64);
