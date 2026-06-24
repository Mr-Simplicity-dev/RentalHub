ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(128),
ADD COLUMN IF NOT EXISTS current_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_audit_hash
ON audit_logs(current_hash);