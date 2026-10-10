-- 162: hash-chain the wallet ledger for tamper-evidence
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS current_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_hash ON wallet_transactions (current_hash);
