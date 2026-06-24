-- Global auto payout support for non-agent withdrawals

ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_reference VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS paystack_last_response JSONB,
  ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS payout_failed_reason TEXT;

ALTER TABLE admin_withdrawals
  ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_reference VARCHAR(120),
  ADD COLUMN IF NOT EXISTS paystack_transfer_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS paystack_last_response JSONB,
  ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS payout_failed_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_transfer_reference
  ON withdrawal_requests(paystack_transfer_reference);

CREATE INDEX IF NOT EXISTS idx_admin_withdrawals_transfer_reference
  ON admin_withdrawals(paystack_transfer_reference);
