BEGIN;

CREATE TABLE IF NOT EXISTS evidence_verification_payments (
  id SERIAL PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  payer_email VARCHAR(255) NOT NULL,
  payer_name VARCHAR(255),
  amount DECIMAL(12, 2) NOT NULL DEFAULT 20000,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'paystack',
  transaction_reference VARCHAR(255) NOT NULL UNIQUE,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  gateway_response JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evidence_verification_payments_dispute
  ON evidence_verification_payments(dispute_id);

CREATE INDEX IF NOT EXISTS idx_evidence_verification_payments_reference
  ON evidence_verification_payments(transaction_reference);

COMMIT;
