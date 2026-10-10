-- 159: bank-account change cooling period
-- Tracks the last beneficiary bank account so a change triggers a cooling window
-- before withdrawals to the new account are allowed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_changed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bank_account_hash VARCHAR(64);
