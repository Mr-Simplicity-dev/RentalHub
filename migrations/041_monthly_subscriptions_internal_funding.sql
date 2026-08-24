-- Monthly subscription pricing and internal funding sources.

ALTER TABLE location_pricing_rules
    DROP CONSTRAINT IF EXISTS location_pricing_rules_applies_to_check;

ALTER TABLE location_pricing_rules
    ADD CONSTRAINT location_pricing_rules_applies_to_check
    CHECK (
        applies_to IN (
            'tenant_registration',
            'landlord_registration',
            'property_alert_request',
            'tenant_monthly_subscription',
            'landlord_monthly_subscription'
        )
    );

ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS payments_payment_type_check;

ALTER TABLE payments
    ADD CONSTRAINT payments_payment_type_check
    CHECK (
        payment_type IN (
            'tenant_subscription',
            'landlord_subscription',
            'landlord_listing',
            'rent_payment',
            'property_unlock',
            'general_platform_fee',
            'registration_fee',
            'wallet_funding',
            'tenant_property_alert',
            'evidence_verification',
            'lawyer_directory_unlock',
            'lawyer_access_fee',
            'agent_access_fee',
            'transportation_booking'
        )
    );

ALTER TABLE admin_commissions
    DROP CONSTRAINT IF EXISTS admin_commissions_source_check;

ALTER TABLE admin_commissions
    ADD CONSTRAINT admin_commissions_source_check
    CHECK (
        source IN (
            'rent_payment',
            'tenant_subscription',
            'landlord_subscription',
            'landlord_listing',
            'wallet_funding',
            'property_unlock',
            'withdrawal_fee',
            'performance_bonus',
            'lawyer_access_fee',
            'agent_access_fee'
        )
    );

CREATE TABLE IF NOT EXISTS subscription_credit_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_credit_ledger (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('credit','debit')),
    source VARCHAR(80) NOT NULL,
    reference VARCHAR(160),
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_credit_accounts_user
    ON subscription_credit_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_subscription_credit_ledger_user
    ON subscription_credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS landlord_rent_deductions (
    id SERIAL PRIMARY KEY,
    landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    deduction_type VARCHAR(40) NOT NULL DEFAULT 'subscription',
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_landlord_rent_deduction_type
        CHECK (deduction_type IN ('subscription'))
);

CREATE INDEX IF NOT EXISTS idx_landlord_rent_deductions_landlord
    ON landlord_rent_deductions(landlord_id, created_at DESC);
