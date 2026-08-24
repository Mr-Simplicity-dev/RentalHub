-- Identity document upgrade:
-- Supports both Nigerian NIN and International Passport verification.

BEGIN;

ALTER TABLE users
  ALTER COLUMN nin DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_document_type VARCHAR(20) DEFAULT 'nin',
  ADD COLUMN IF NOT EXISTS international_passport_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nationality VARCHAR(80);

UPDATE users
SET identity_document_type = CASE
  WHEN international_passport_number IS NOT NULL THEN 'passport'
  ELSE 'nin'
END
WHERE identity_document_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_identity_document_type_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_identity_document_type_check
      CHECK (identity_document_type IN ('nin', 'passport'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_international_passport_number
ON users(international_passport_number)
WHERE international_passport_number IS NOT NULL;

COMMIT;
