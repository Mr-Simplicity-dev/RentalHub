-- Migration 066: Production-safe user account status columns
-- These columns are read during login and auth checks. Keeping them in a
-- migration prevents production login from failing on older databases.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS account_suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS account_suspended_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS account_suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

UPDATE users
SET is_active = TRUE
WHERE is_active IS NULL;
