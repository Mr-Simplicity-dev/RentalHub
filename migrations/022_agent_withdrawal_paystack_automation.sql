-- Auto payout support for agent withdrawals via Paystack transfer

ALTER TABLE agent_withdrawal_requests
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS account_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_reference VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS paystack_last_response JSONB,
  ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS payout_failed_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_withdrawal_transfer_reference
  ON agent_withdrawal_requests(paystack_transfer_reference);
