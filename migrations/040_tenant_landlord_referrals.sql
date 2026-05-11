-- Tenant and landlord referral rewards.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS referral_code VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique
    ON users(referral_code)
    WHERE referral_code IS NOT NULL AND referral_code <> '';

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

CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallets_user
    ON wallets(user_id);

CREATE TABLE IF NOT EXISTS user_referrals (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    referral_code VARCHAR(64) NOT NULL,
    reward_amount NUMERIC(12,2) NOT NULL DEFAULT 1000,
    reward_status VARCHAR(20) NOT NULL DEFAULT 'credited',
    credited_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_referrals_reward_status
        CHECK (reward_status IN ('credited','reversed'))
);

CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer
    ON user_referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_user_referrals_code
    ON user_referrals(referral_code);

CREATE TABLE IF NOT EXISTS feature_flags (
    key VARCHAR(100) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO feature_flags (key, enabled, description)
VALUES (
    'tenant_landlord_referrals',
    TRUE,
    'Allow tenants and landlords to earn N1,000 subscription credit for successful referral registrations.'
)
ON CONFLICT (key)
DO UPDATE SET description = EXCLUDED.description;

WITH referral_totals AS (
    SELECT referrer_id AS user_id, COALESCE(SUM(reward_amount), 0) AS amount
    FROM user_referrals
    WHERE reward_status = 'credited'
    GROUP BY referrer_id
)
INSERT INTO subscription_credit_accounts (user_id, balance)
SELECT user_id, amount
FROM referral_totals
ON CONFLICT (user_id)
DO UPDATE SET
    balance = GREATEST(subscription_credit_accounts.balance, EXCLUDED.balance),
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO subscription_credit_ledger (
    user_id,
    amount,
    entry_type,
    source,
    reference,
    metadata
)
SELECT
    referrer_id,
    reward_amount,
    'credit',
    'referral_reward_migration',
    'REFERRAL_' || id,
    jsonb_build_object('referred_user_id', referred_user_id, 'referral_code', referral_code)
FROM user_referrals
WHERE reward_status = 'credited'
  AND NOT EXISTS (
      SELECT 1
      FROM subscription_credit_ledger scl
      WHERE scl.reference = 'REFERRAL_' || user_referrals.id
        AND scl.source IN ('referral_reward', 'referral_reward_migration')
  );

UPDATE wallets w
SET balance = GREATEST(0, w.balance - rt.amount),
    updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT referrer_id AS user_id, COALESCE(SUM(reward_amount), 0) AS amount
    FROM user_referrals
    WHERE reward_status = 'credited'
    GROUP BY referrer_id
) rt
WHERE w.user_id = rt.user_id;
