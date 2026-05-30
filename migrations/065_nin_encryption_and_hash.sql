-- 065_nin_encryption_and_hash.sql
-- Adds nin_hash column for duplicate checking and backfills existing encrypted NINs
-- Part of security hardening: NIN plaintext → encrypted transition

BEGIN;

-- Add nin_hash column if not present
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nin_hash VARCHAR(64);

-- Create index for duplicate NIN lookups
CREATE INDEX IF NOT EXISTS idx_users_nin_hash
  ON users(nin_hash)
  WHERE nin_hash IS NOT NULL;

COMMIT;
