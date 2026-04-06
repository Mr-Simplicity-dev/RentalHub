-- Agent Withdrawal Records Schema
-- Tracks withdrawal requests and payout history for agents

-- Agent withdrawal requests
CREATE TABLE IF NOT EXISTS agent_withdrawal_requests (
  id SERIAL PRIMARY KEY,
  agent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landlord_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled'
  withdrawal_method VARCHAR(50),
  -- 'bank_transfer', 'wallet', 'cheque', 'other'
  bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
  -- Flexible: could store account details or reference
  request_reason TEXT,
  reason_for_rejection TEXT,
  approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requested_date TIMESTAMP,
  approved_date TIMESTAMP,
  processed_date TIMESTAMP,
  completed_date TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_withdrawal_requests_agent
  ON agent_withdrawal_requests(agent_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_withdrawal_requests_status
  ON agent_withdrawal_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_withdrawal_requests_landlord
  ON agent_withdrawal_requests(landlord_user_id);

CREATE INDEX IF NOT EXISTS idx_agent_withdrawal_requests_dates
  ON agent_withdrawal_requests(created_at DESC, status);

-- Agent withdrawal audit trail
CREATE TABLE IF NOT EXISTS agent_withdrawal_audit (
  id SERIAL PRIMARY KEY,
  withdrawal_request_id INTEGER NOT NULL REFERENCES agent_withdrawal_requests(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  -- 'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 
  -- 'withdrawal_processed', 'withdrawal_completed', 'status_updated'
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  performed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_withdrawal_audit_withdrawal
  ON agent_withdrawal_audit(withdrawal_request_id);

CREATE INDEX IF NOT EXISTS idx_agent_withdrawal_audit_action
  ON agent_withdrawal_audit(action_type, created_at DESC);
