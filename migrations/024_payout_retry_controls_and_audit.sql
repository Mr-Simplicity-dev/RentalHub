-- Retry controls and audit for automatic payout transfers

ALTER TABLE agent_withdrawal_requests
  ADD COLUMN IF NOT EXISTS payout_retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;

ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS payout_retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;

ALTER TABLE admin_withdrawals
  ADD COLUMN IF NOT EXISTS payout_retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS payout_retry_audit (
  id SERIAL PRIMARY KEY,
  source_table VARCHAR(60) NOT NULL,
  source_id INTEGER NOT NULL,
  retry_attempt INTEGER NOT NULL,
  old_status VARCHAR(40),
  new_status VARCHAR(40),
  transfer_reference VARCHAR(140),
  transfer_code VARCHAR(140),
  outcome VARCHAR(40) NOT NULL,
  message TEXT,
  response_payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payout_retry_audit_source
  ON payout_retry_audit(source_table, source_id, created_at DESC);
