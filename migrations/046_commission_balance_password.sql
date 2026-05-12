ALTER TABLE users
  ADD COLUMN IF NOT EXISTS commission_balance_password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS commission_balance_password_set_at TIMESTAMP;
