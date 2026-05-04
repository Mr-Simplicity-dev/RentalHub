-- =====================================================
-- LAWYER ACCESS FEE COMMISSION DISTRIBUTION MIGRATION
-- =====================================================
-- Distribution for N2000 lawyer access fee:
--   Assigned lawyer:            N100
--   Assigned agent (if any):    N80
--   Super admin:                N120
--   State admin:                N140
--   State financial admin:      N140
--   State support admin:        N140
--   State lawyer admin:         N140
--   Super financial admin:      N200
--   Super support admin:        N200
--   Super lawyer admin:         N200
--   Fumigation admin:           N120
--   Transportation admin:       N120
--   Remainder to super admin
-- =====================================================

-- 1. Add lawyer_access_fee to the admin_commissions source check constraint
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
    'lawyer_access_fee'
));

-- 2. Create a dedicated table for lawyer access fee distribution records
CREATE TABLE IF NOT EXISTS lawyer_access_fee_distributions (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_lawyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
    lga_name VARCHAR(100),
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 2000.00,
    distribution JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Index for lookups
CREATE INDEX IF NOT EXISTS idx_lawyer_access_fee_distributions_payment_id
    ON lawyer_access_fee_distributions(payment_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_access_fee_distributions_user_id
    ON lawyer_access_fee_distributions(user_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_access_fee_distributions_state_id
    ON lawyer_access_fee_distributions(state_id);

-- Migration completed
SELECT 'Lawyer access fee commissions migration completed successfully' as migration_status;
