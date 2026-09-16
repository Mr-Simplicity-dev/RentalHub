-- Forensic hardening for agent withdrawal audit trail.
-- Captures request context (IP, device, structured metadata) so a withdrawal
-- can be tied to the session/device that created it, not just the account.

ALTER TABLE agent_withdrawal_audit
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_agent_withdrawal_audit_created
  ON agent_withdrawal_audit(created_at DESC);
