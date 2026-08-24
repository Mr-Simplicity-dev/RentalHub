-- =====================================================
-- PLATFORM AGENTS SYSTEM & AGENT ACCESS FEE DISTRIBUTION
-- =====================================================
-- This migration creates:
--   1. platform_agents table (like platform_lawyers)
--   2. agent_access_fee_distributions table
--   3. Adds 'agent_access_fee' to admin_commissions source check
-- =====================================================
-- Distribution for N5000 agent access fee:
--   Assigned agent:              N2800
--   Assigned landlord's lawyer:   N500
--   Super admin:                  N800
--   State admin:                  N100
--   Remainder to other admin roles
-- =====================================================

-- 1. Create platform_agents table (mirrors platform_lawyers)
CREATE TABLE IF NOT EXISTS platform_agents (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    agent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    nationality VARCHAR(80),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_platform_agent_source
        CHECK (source_type IN ('manual', 'registration'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_agents_user_unique
    ON platform_agents(agent_user_id)
    WHERE agent_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_agents_active
    ON platform_agents(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_agents_email
    ON platform_agents(email);

-- 2. Add 'agent_access_fee' to admin_commissions source check constraint
ALTER TABLE admin_commissions DROP CONSTRAINT IF EXISTS admin_commissions_source_check;
ALTER TABLE admin_commissions ADD CONSTRAINT admin_commissions_source_check
CHECK (source IN (
    'rent_payment',
    'tenant_subscription',
    'landlord_listing',
    'wallet_funding',
    'property_unlock',
    'withdrawal_fee',
    'performance_bonus',
    'lawyer_access_fee',
    'agent_access_fee'
));

-- 3. Create agent_access_fee_distributions table
CREATE TABLE IF NOT EXISTS agent_access_fee_distributions (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_lawyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
    lga_name VARCHAR(100),
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 5000.00,
    distribution JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_access_fee_distributions_payment_id
    ON agent_access_fee_distributions(payment_id);
CREATE INDEX IF NOT EXISTS idx_agent_access_fee_distributions_user_id
    ON agent_access_fee_distributions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_access_fee_distributions_state_id
    ON agent_access_fee_distributions(state_id);

-- Migration completed
SELECT 'Platform agents system migration completed successfully' as migration_status;
