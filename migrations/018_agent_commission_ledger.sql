-- Agent Commission Ledger Schema
-- Tracks agent earnings and commission structures

-- Agent commission rates/tiers
CREATE TABLE IF NOT EXISTS agent_commission_rates (
  id SERIAL PRIMARY KEY,
  tenant_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commission_type VARCHAR(50) NOT NULL,
  -- Types: 'application_fee', 'dispute_resolution', 'damage_report', 'flat_amount', 'percentage'
  commission_rate DECIMAL(10, 4) NOT NULL DEFAULT 0,
  -- For percentage: 5.00 = 5%, For flat: actual currency amount
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to TIMESTAMP,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_commission_rates_agent
  ON agent_commission_rates(agent_user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_agent_commission_rates_tenant
  ON agent_commission_rates(tenant_user_id);

CREATE INDEX IF NOT EXISTS idx_agent_commission_rates_active_date
  ON agent_commission_rates(is_active, effective_from DESC);

-- Agent commission ledger - tracks all commission transactions
CREATE TABLE IF NOT EXISTS agent_commission_ledger (
  id SERIAL PRIMARY KEY,
  agent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landlord_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(100) NOT NULL,
  -- Types: 'application_processed', 'dispute_resolved', 'damage_report_created', 
  -- 'manual_commission', 'bonus', 'adjustment', 'payout'
  related_entity_type VARCHAR(50),
  -- Types: 'application', 'dispute', 'damage_report', 'property', etc.
  related_entity_id INTEGER,
  amount DECIMAL(15, 2) NOT NULL,
  -- Positive for earnings, negative for deductions/reversals
  status VARCHAR(20) NOT NULL DEFAULT 'earned',
  -- Status: 'earned', 'pending_verification', 'verified', 'paid', 'reversed'
  payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  -- payment_status: 'unpaid', 'paid', 'partially_paid'
  description TEXT,
  processed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_on TIMESTAMP,
  payment_reference VARCHAR(255),
  -- Reference to payment transaction/payout batch
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_commission_ledger_agent
  ON agent_commission_ledger(agent_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_commission_ledger_landlord
  ON agent_commission_ledger(landlord_user_id);

CREATE INDEX IF NOT EXISTS idx_agent_commission_ledger_status
  ON agent_commission_ledger(status, payment_status);

CREATE INDEX IF NOT EXISTS idx_agent_commission_ledger_payment_status
  ON agent_commission_ledger(payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_commission_ledger_entity
  ON agent_commission_ledger(related_entity_type, related_entity_id);

-- Agent earnings summary - materialized view for quick stats
CREATE TABLE IF NOT EXISTS agent_earnings_summary (
  id SERIAL PRIMARY KEY,
  agent_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  landlord_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_earned DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_paid DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_pending DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_reversed DECIMAL(15, 2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  last_payment_date TIMESTAMP,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_earnings_summary_agent
  ON agent_earnings_summary(agent_user_id);

CREATE INDEX IF NOT EXISTS idx_agent_earnings_summary_landlord
  ON agent_earnings_summary(landlord_user_id);

-- Agent payout history - tracks payments made to agents
CREATE TABLE IF NOT EXISTS agent_payout_batches (
  id SERIAL PRIMARY KEY,
  payout_date TIMESTAMP NOT NULL,
  payout_status VARCHAR(20) NOT NULL DEFAULT 'initiated',
  -- 'initiated', 'processing', 'completed', 'failed'
  total_amount DECIMAL(15, 2) NOT NULL,
  transaction_count INTEGER NOT NULL,
  batch_reference VARCHAR(255) UNIQUE,
  payment_method VARCHAR(50),
  -- 'bank_transfer', 'payment_gateway', 'check', 'other'
  processed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_payout_batches_status
  ON agent_payout_batches(payout_status, payout_date DESC);

CREATE INDEX IF NOT EXISTS idx_agent_payout_batches_date
  ON agent_payout_batches(payout_date DESC);

-- Link commission ledger entries to payout batches
CREATE TABLE IF NOT EXISTS agent_payout_details (
  id SERIAL PRIMARY KEY,
  payout_batch_id INTEGER NOT NULL REFERENCES agent_payout_batches(id) ON DELETE CASCADE,
  commission_ledger_id INTEGER NOT NULL REFERENCES agent_commission_ledger(id) ON DELETE CASCADE,
  amount_paid DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (payout_batch_id, commission_ledger_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_payout_details_batch
  ON agent_payout_details(payout_batch_id);

CREATE INDEX IF NOT EXISTS idx_agent_payout_details_ledger
  ON agent_payout_details(commission_ledger_id);

-- Audit trail for commission-related actions
CREATE TABLE IF NOT EXISTS agent_commission_audit (
  id SERIAL PRIMARY KEY,
  agent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  -- 'commission_created', 'commission_verified', 'commission_reversed', 'payout_initiated', etc.
  affected_commission_id INTEGER REFERENCES agent_commission_ledger(id) ON DELETE SET NULL,
  old_values JSONB,
  new_values JSONB,
  performed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_commission_audit_agent
  ON agent_commission_audit(agent_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_commission_audit_action
  ON agent_commission_audit(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_commission_audit_commission
  ON agent_commission_audit(affected_commission_id);
