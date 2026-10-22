-- 169: manual bank-transfer payments
-- Super-admin managed receiving accounts plus the proof/approval trail for
-- registrations and wallet funding that are paid by direct bank transfer
-- instead of Paystack. Nothing here touches the Paystack ledger: approval
-- writes the normal payments row, so receipts and commissions stay identical.

BEGIN;

CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  bank_name VARCHAR(100) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  account_number VARCHAR(30) NOT NULL,
  sort_code VARCHAR(10),
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_unique
  ON bank_accounts (lower(bank_name), account_number);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active
  ON bank_accounts (is_active, sort_order);

CREATE TABLE IF NOT EXISTS bank_transfer_payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reference VARCHAR(120) NOT NULL UNIQUE,
  payment_type VARCHAR(30) NOT NULL
    CHECK (payment_type IN ('registration', 'wallet_funding')),
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
  payer_name VARCHAR(150),
  payer_bank VARCHAR(100),
  proof_path TEXT,
  proof_captured_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'awaiting_approval'
    CHECK (status IN ('awaiting_approval', 'approved', 'rejected', 'expired')),
  amount_confirmed NUMERIC(12, 2),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  registration_reference VARCHAR(255),
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_payments_status
  ON bank_transfer_payments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_payments_type
  ON bank_transfer_payments (payment_type, status);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_payments_registration
  ON bank_transfer_payments (registration_reference);

COMMIT;
