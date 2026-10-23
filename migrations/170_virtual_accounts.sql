-- 170: virtual accounts (DVA + one-time transfer accounts)
-- Wallet funding gets a permanent dedicated account per user; the registration
-- fee gets a short-lived one-time account because the payer has no user row
-- yet. Both are reconciled automatically by the provider webhook, so the manual
-- capture/approval flow (169) only remains as the fallback rail.

BEGIN;

-- The official name returned by the identity provider. A virtual account is
-- created in a name the partner bank checks against the identity record, so the
-- verified name is authoritative and the typed registration name is not.
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified_name VARCHAR(200);

CREATE TABLE IF NOT EXISTS virtual_accounts (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(30) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('dva', 'one_time')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  registration_reference VARCHAR(255),
  account_reference VARCHAR(160) NOT NULL,
  provider_reference VARCHAR(160),
  account_number VARCHAR(30) NOT NULL,
  account_name VARCHAR(200),
  bank_name VARCHAR(120),
  bank_code VARCHAR(20),
  amount_expected NUMERIC(12, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'closed', 'paid')),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_reference
  ON virtual_accounts (provider, account_reference);

CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_number
  ON virtual_accounts (provider, account_number);

-- A user owns at most one live permanent account. One-time accounts are keyed
-- on the registration they belong to and are allowed to accumulate as history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_one_dva_per_user
  ON virtual_accounts (user_id)
  WHERE kind = 'dva' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_virtual_accounts_user
  ON virtual_accounts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_virtual_accounts_registration
  ON virtual_accounts (registration_reference, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_virtual_accounts_status
  ON virtual_accounts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS virtual_account_events (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(30) NOT NULL,
  event_id VARCHAR(200) NOT NULL,
  event_type VARCHAR(60),
  virtual_account_id INTEGER REFERENCES virtual_accounts(id) ON DELETE SET NULL,
  account_number VARCHAR(30),
  account_reference VARCHAR(160),
  payment_reference VARCHAR(160),
  amount NUMERIC(12, 2),
  sender_name VARCHAR(200),
  sender_bank VARCHAR(120),
  status VARCHAR(30),
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_virtual_account_events_account
  ON virtual_account_events (virtual_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_virtual_account_events_unprocessed
  ON virtual_account_events (provider, processed, created_at ASC);

COMMIT;
