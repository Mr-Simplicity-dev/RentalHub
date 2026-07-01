-- ============================================
-- MIGRATION: RENT SAVINGS SYSTEM
-- ============================================
-- Migration ID: 034
-- Description: Creates all necessary tables for the Rent Savings feature
-- Tenants can save towards their upcoming rent with admin-controlled withdrawals
-- ============================================

-- 1. Rent Savings Plans Table
CREATE TABLE IF NOT EXISTS rent_savings_plans (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    rent_due_date DATE NOT NULL,
    monthly_rent_amount NUMERIC(12, 2) NOT NULL,
    target_savings_amount NUMERIC(12, 2) NOT NULL,
    monthly_savings_amount NUMERIC(12, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    total_saved NUMERIC(12, 2) DEFAULT 0,
    setup_fee_paid BOOLEAN DEFAULT FALSE,
    setup_fee_amount NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Rent Savings Contributions Table
CREATE TABLE IF NOT EXISTS rent_savings_contributions (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES rent_savings_plans(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    commission_1pct NUMERIC(12, 2) NOT NULL DEFAULT 0,
    net_saved NUMERIC(12, 2) NOT NULL DEFAULT 0,
    saved_for_month VARCHAR(7) NOT NULL,
    is_catchup BOOLEAN DEFAULT FALSE,
    previous_month_missed VARCHAR(7),
    payment_reference VARCHAR(255),
    contributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Rent Savings Setup Fees Table (Location-based one-time fee)
CREATE TABLE IF NOT EXISTS rent_savings_setup_fees (
    id SERIAL PRIMARY KEY,
    state_id INTEGER REFERENCES states(id) ON DELETE CASCADE,
    lga_id INTEGER,
    lga_name VARCHAR(120),
    setup_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Rent Savings Early Withdrawal Requests Table
CREATE TABLE IF NOT EXISTS rent_savings_early_withdrawals (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES rent_savings_plans(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_amount NUMERIC(12, 2) NOT NULL,
    penalty_5pct NUMERIC(12, 2) NOT NULL DEFAULT 0,
    net_payout NUMERIC(12, 2) NOT NULL DEFAULT 0,
    reason TEXT,
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Modify existing withdrawal_requests table - add rent savings columns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'withdrawal_requests' AND column_name = 'withdrawal_type'
    ) THEN
        ALTER TABLE withdrawal_requests 
        ADD COLUMN withdrawal_type VARCHAR(20) DEFAULT 'normal' CHECK (withdrawal_type IN ('normal', 'rent_savings_early', 'rent_savings_maturity'));
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'withdrawal_requests' AND column_name = 'penalty_fee'
    ) THEN
        ALTER TABLE withdrawal_requests 
        ADD COLUMN penalty_fee NUMERIC(12, 2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'withdrawal_requests' AND column_name = 'maturity_commission'
    ) THEN
        ALTER TABLE withdrawal_requests 
        ADD COLUMN maturity_commission NUMERIC(12, 2) DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_rent_savings_plans_tenant ON rent_savings_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_savings_plans_status ON rent_savings_plans(status);
CREATE INDEX IF NOT EXISTS idx_rent_savings_plans_active ON rent_savings_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_rent_savings_contributions_plan ON rent_savings_contributions(plan_id);
CREATE INDEX IF NOT EXISTS idx_rent_savings_contributions_tenant ON rent_savings_contributions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_savings_contributions_month ON rent_savings_contributions(saved_for_month);
CREATE INDEX IF NOT EXISTS idx_rent_savings_setup_fees_state ON rent_savings_setup_fees(state_id);
CREATE INDEX IF NOT EXISTS idx_rent_savings_setup_fees_lga ON rent_savings_setup_fees(lga_id);
CREATE INDEX IF NOT EXISTS idx_rent_savings_early_withdrawals_plan ON rent_savings_early_withdrawals(plan_id);
CREATE INDEX IF NOT EXISTS idx_rent_savings_early_withdrawals_status ON rent_savings_early_withdrawals(status);

-- ============================================
-- CREATE TRIGGER FOR UPDATED_AT
-- ============================================
DROP TRIGGER IF EXISTS update_rent_savings_plans_updated_at ON rent_savings_plans;
DROP TRIGGER IF EXISTS update_rent_savings_setup_fees_updated_at ON rent_savings_setup_fees;
DROP TRIGGER IF EXISTS update_rent_savings_early_withdrawals_updated_at ON rent_savings_early_withdrawals;

CREATE TRIGGER update_rent_savings_plans_updated_at
    BEFORE UPDATE ON rent_savings_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rent_savings_setup_fees_updated_at
    BEFORE UPDATE ON rent_savings_setup_fees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rent_savings_early_withdrawals_updated_at
    BEFORE UPDATE ON rent_savings_early_withdrawals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CREATE PLATFORM REVENUE LEDGER ENTRY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rent_savings_revenue (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES rent_savings_plans(id) ON DELETE CASCADE,
    contribution_id INTEGER REFERENCES rent_savings_contributions(id) ON DELETE CASCADE,
    withdrawal_request_id INTEGER REFERENCES withdrawal_requests(id) ON DELETE CASCADE,
    revenue_type VARCHAR(30) NOT NULL CHECK (revenue_type IN (
        'setup_fee', 'monthly_1pct', 'maturity_2pct', 'early_withdrawal_5pct'
    )),
    amount NUMERIC(12, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rent_savings_revenue_type ON rent_savings_revenue(revenue_type);
CREATE INDEX IF NOT EXISTS idx_rent_savings_revenue_tenant ON rent_savings_revenue(tenant_id);
