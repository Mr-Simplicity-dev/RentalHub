-- Migration 067: Wallet credit ledger with pending/cleared rent credits

CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit')),
  status VARCHAR(30) NOT NULL DEFAULT 'cleared'
    CHECK (status IN ('pending', 'cleared', 'reversed', 'withdrawn')),
  source VARCHAR(60) NOT NULL DEFAULT 'general',
  description TEXT,
  reference VARCHAR(255),
  available_at TIMESTAMP,
  cleared_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'cleared',
  ADD COLUMN IF NOT EXISTS source VARCHAR(60) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallet_transactions_status_check'
  ) THEN
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_status_check
      CHECK (status IN ('pending', 'cleared', 'reversed', 'withdrawn'));
  END IF;
END $$;

DROP INDEX IF EXISTS idx_wallet_transactions_payment_source_once;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_payment_source_once
  ON wallet_transactions (payment_id, user_id, type, source)
  WHERE payment_id IS NOT NULL
    AND source IN ('rent_payment', 'wallet_funding');

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_reference_once
  ON wallet_transactions (reference, user_id, type, source)
  WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_status
  ON wallet_transactions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_pending_available
  ON wallet_transactions (status, available_at)
  WHERE status = 'pending';
