-- Harden anonymous support-ticket access with per-ticket, high-entropy secrets.
-- Only SHA-256 token digests are stored. Existing guest tickets receive a
-- 30-day migration window that remains disabled unless the server explicitly
-- opts in with GUEST_SUPPORT_ALLOW_LEGACY_EMAIL_ACCESS=true.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS guest_access_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS guest_access_token_created_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS guest_access_token_last_used_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS guest_access_token_revoked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS guest_legacy_access_expires_at TIMESTAMP;

UPDATE support_tickets
SET guest_legacy_access_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days'
WHERE user_id IS NULL
  AND guest_access_token_hash IS NULL
  AND guest_legacy_access_expires_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_guest_access_token_hash
  ON support_tickets(guest_access_token_hash)
  WHERE guest_access_token_hash IS NOT NULL;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS chk_support_tickets_guest_access_token_hash;

ALTER TABLE support_tickets
  ADD CONSTRAINT chk_support_tickets_guest_access_token_hash
  CHECK (
    guest_access_token_hash IS NULL
    OR guest_access_token_hash ~ '^[a-f0-9]{64}$'
  );
