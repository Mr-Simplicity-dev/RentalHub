BEGIN;

ALTER TABLE prembly_verification_attempts
  ADD COLUMN IF NOT EXISTS document_country VARCHAR(80);

COMMIT;
