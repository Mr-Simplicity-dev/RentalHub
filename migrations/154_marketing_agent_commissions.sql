-- Marketing agent commissions.
--
-- A marketing agent opens an account for someone in the field. They earn a flat
-- amount when that person verifies their own email/phone, plus a second amount when
-- the person's registration fee is paid. Money lands in the agent's cash wallet, so
-- it pays out through the existing withdrawal machinery.
--
-- No cash collection anywhere: the person pays their own registration fee online.

-- Which agent opened this account (null for self-registered users).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_by_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_created_by_agent
    ON users(created_by_agent_id)
    WHERE created_by_agent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS marketing_agent_commissions (
    id              SERIAL PRIMARY KEY,
    agent_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_type    VARCHAR(20) NOT NULL,
    stage           VARCHAR(20) NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'qualified',
    qualified_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reversed_at     TIMESTAMPTZ,
    reversed_reason TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- One commission per account per stage, forever. Enforced by the database so a
    -- duplicate hook firing can never double-pay.
    CONSTRAINT uq_marketing_agent_commission_stage UNIQUE (new_user_id, stage),

    CONSTRAINT chk_marketing_agent_commission_type
        CHECK (account_type IN ('tenant', 'landlord')),
    CONSTRAINT chk_marketing_agent_commission_stage
        CHECK (stage IN ('verified', 'registration_paid')),
    CONSTRAINT chk_marketing_agent_commission_status
        CHECK (status IN ('qualified', 'reversed'))
);

CREATE INDEX IF NOT EXISTS idx_marketing_agent_commissions_agent
    ON marketing_agent_commissions(agent_user_id, qualified_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_agent_commissions_new_user
    ON marketing_agent_commissions(new_user_id);

-- Rates live in commission_config so they can be re-priced without a build.
INSERT INTO commission_config (key, value, description) VALUES
  ('marketing_agent_tenant_verify_amount', 120,
   'Marketing agent commission when an agent-opened tenant verifies their contact details'),
  ('marketing_agent_tenant_registration_paid_amount', 80,
   'Marketing agent commission when an agent-opened tenant pays their registration fee'),
  ('marketing_agent_landlord_verify_amount', 240,
   'Marketing agent commission when an agent-opened landlord verifies their contact details'),
  ('marketing_agent_landlord_registration_paid_amount', 160,
   'Marketing agent commission when an agent-opened landlord pays their registration fee'),
  ('marketing_agent_commission_enabled', 1,
   'Master switch for marketing agent commissions (1 = on)'),
  ('marketing_agent_clawback_days', 30,
   'Days after qualifying during which a reversed account claws the commission back')
ON CONFLICT (key) DO NOTHING;
