-- =====================================================
-- STATE-BASED ADMIN SYSTEM MIGRATION
-- =====================================================

-- 1. Add referred_by column to users table for hierarchy
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 2. Add state assignment for state admins
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_state VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_city VARCHAR(100);

-- 3. Add admin wallet and commission tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_wallet_balance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_commission_rate DECIMAL(5,4) DEFAULT 0.05; -- 5% default
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_funds_frozen BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_frozen_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_frozen_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_frozen_reason TEXT;

-- 4. Create admin commissions table
CREATE TABLE IF NOT EXISTS admin_commissions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN (
        'rent_payment',
        'tenant_subscription', 
        'landlord_listing',
        'wallet_funding',
        'property_unlock',
        'withdrawal_fee',
        'performance_bonus'
    )),
    commission_rate DECIMAL(5,4) NOT NULL,
    state VARCHAR(100),
    city VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create admin withdrawals table
CREATE TABLE IF NOT EXISTS admin_withdrawals (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(20) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
    admin_note TEXT,
    processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMP,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create transaction audit table for super financial admin
CREATE TABLE IF NOT EXISTS transaction_audits (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
        'payment_created',
        'payment_completed',
        'payment_failed',
        'commission_earned',
        'withdrawal_requested',
        'withdrawal_approved',
        'withdrawal_rejected',
        'funds_frozen',
        'funds_unfrozen'
    )),
    amount DECIMAL(12,2),
    description TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Create frozen funds table
CREATE TABLE IF NOT EXISTS frozen_funds (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT NOT NULL,
    frozen_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    frozen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unfrozen_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    unfrozen_at TIMESTAMP,
    unfrozen_reason TEXT,
    status VARCHAR(20) DEFAULT 'frozen' CHECK (status IN ('frozen', 'unfrozen'))
);

-- 8. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_assigned_state ON users(assigned_state);
CREATE INDEX IF NOT EXISTS idx_users_assigned_city ON users(assigned_city);
CREATE INDEX IF NOT EXISTS idx_users_admin_funds_frozen ON users(admin_funds_frozen);
CREATE INDEX IF NOT EXISTS idx_admin_commissions_admin_id ON admin_commissions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_commissions_status ON admin_commissions(status);
CREATE INDEX IF NOT EXISTS idx_admin_commissions_state ON admin_commissions(state);
CREATE INDEX IF NOT EXISTS idx_admin_withdrawals_admin_id ON admin_withdrawals(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_withdrawals_status ON admin_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_transaction_audits_payment_id ON transaction_audits(payment_id);
CREATE INDEX IF NOT EXISTS idx_transaction_audits_user_id ON transaction_audits(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_audits_action_type ON transaction_audits(action_type);
CREATE INDEX IF NOT EXISTS idx_frozen_funds_user_id ON frozen_funds(user_id);
CREATE INDEX IF NOT EXISTS idx_frozen_funds_status ON frozen_funds(status);

-- 9. Add comments for documentation
COMMENT ON TABLE admin_commissions IS 'Tracks commissions earned by state admins from transactions in their assigned locations';
COMMENT ON TABLE admin_withdrawals IS 'Tracks withdrawal requests from state admins for their earned commissions';
COMMENT ON TABLE transaction_audits IS 'Audit trail for all financial transactions for super financial admin monitoring';
COMMENT ON TABLE frozen_funds IS 'Tracks frozen funds for users (can only be frozen by super financial admin, unfrozen by super admin)';

-- 10. Update user_type check constraint to include state_admin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT users_user_type_check 
CHECK (user_type IN ('tenant', 'landlord', 'lawyer', 'admin', 'state_admin', 'super_admin', 'financial_admin'));

-- 11. Create a view for super financial admin dashboard
CREATE OR REPLACE VIEW financial_admin_dashboard AS
SELECT 
    p.id as payment_id,
    p.user_id,
    p.amount,
    p.payment_type,
    p.payment_status,
    p.created_at as payment_date,
    p.completed_at,
    p.transaction_reference,
    u.full_name as user_name,
    u.user_type,
    u.email as user_email,
    u.phone as user_phone,
    prop.state as property_state,
    prop.city as property_city,
    prop.area as property_area,
    admin.full_name as admin_name,
    admin.email as admin_email,
    ac.amount as commission_amount,
    ac.source as commission_source,
    ac.status as commission_status,
    ff.status as funds_status,
    ff.amount as frozen_amount
FROM payments p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN properties prop ON p.property_id = prop.id
LEFT JOIN admin_commissions ac ON p.id = ac.payment_id
LEFT JOIN users admin ON ac.admin_id = admin.id
LEFT JOIN frozen_funds ff ON p.user_id = ff.user_id AND ff.status = 'frozen'
WHERE p.payment_status IN ('completed', 'pending')
ORDER BY p.created_at DESC;

-- 12. Create a view for state admin earnings
CREATE OR REPLACE VIEW state_admin_earnings AS
SELECT 
    admin.id as admin_id,
    admin.full_name as admin_name,
    admin.email as admin_email,
    admin.assigned_state,
    admin.assigned_city,
    admin.admin_wallet_balance,
    COUNT(DISTINCT ac.id) as total_commissions,
    SUM(CASE WHEN ac.status = 'paid' THEN ac.amount ELSE 0 END) as total_paid,
    SUM(CASE WHEN ac.status = 'pending' THEN ac.amount ELSE 0 END) as total_pending,
    COUNT(DISTINCT u.id) as total_users_managed,
    COUNT(DISTINCT aw.id) as total_withdrawals,
    SUM(CASE WHEN aw.status = 'processed' THEN aw.amount ELSE 0 END) as total_withdrawn
FROM users admin
LEFT JOIN admin_commissions ac ON admin.id = ac.admin_id
LEFT JOIN users u ON u.referred_by = admin.id
LEFT JOIN admin_withdrawals aw ON admin.id = aw.admin_id
WHERE admin.user_type = 'state_admin'
GROUP BY admin.id, admin.full_name, admin.email, admin.assigned_state, admin.assigned_city, admin.admin_wallet_balance
ORDER BY admin.assigned_state, admin.assigned_city;

-- Migration completed
SELECT 'State-based admin system migration completed successfully' as migration_status;