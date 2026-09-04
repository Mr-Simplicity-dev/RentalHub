-- ============================================
-- MIGRATION: RENT CALCULATOR FEES
-- ============================================
-- Migration ID: 145
-- Description: Admin-configurable fee percentages/deposits used by the public
-- rent calculator to build a tenant's full NG move-in breakdown
-- (agent fee, legal fee, caution deposit, agreement fee, service charge).
-- Rows are scope-keyed exactly like rent_savings_setup_fees, but with a
-- global fallback tier:
--   global row (state_id NULL AND lga_id NULL)  -> default everywhere
--   state row  (lga_id NULL)                    -> whole state
--   LGA row    (state_id + lga_id set)          -> single LGA
-- Resolution at estimate time: LGA row -> state row -> global row.
-- Editing hierarchy:
--   lga_financial_admin      -> their LGA only
--   financial_admin/state_*  -> their state (and its LGAs)
--   super_financial_admin    -> whole structure incl. the global row
--   super_admin              -> whole structure incl. the global row
-- ============================================

CREATE TABLE IF NOT EXISTS rent_calculator_fees (
    id SERIAL PRIMARY KEY,
    state_id INTEGER REFERENCES states(id) ON DELETE CASCADE,
    state_name VARCHAR(120),
    lga_id INTEGER,
    lga_name VARCHAR(120),
    agent_fee_pct NUMERIC(5, 2) NOT NULL DEFAULT 10,
    legal_fee_pct NUMERIC(5, 2) NOT NULL DEFAULT 10,
    caution_months NUMERIC(3, 1) NOT NULL DEFAULT 1,
    agreement_fee NUMERIC(12, 2) NOT NULL DEFAULT 5000,
    service_charge NUMERIC(12, 2) NOT NULL DEFAULT 0,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One global row only (state_id NULL AND lga_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rent_calculator_fees_global
    ON rent_calculator_fees ((1)) WHERE state_id IS NULL AND lga_id IS NULL;

-- One state-level row per state
CREATE UNIQUE INDEX IF NOT EXISTS uq_rent_calculator_fees_state
    ON rent_calculator_fees (state_id) WHERE state_id IS NOT NULL AND lga_id IS NULL;

-- One row per LGA per state
CREATE UNIQUE INDEX IF NOT EXISTS uq_rent_calculator_fees_lga
    ON rent_calculator_fees (state_id, lga_id) WHERE state_id IS NOT NULL AND lga_id IS NOT NULL;

-- Constraint sanity: cannot set a name without the matching id
ALTER TABLE rent_calculator_fees DROP CONSTRAINT IF EXISTS chk_rent_calculator_fees_state_name;
ALTER TABLE rent_calculator_fees
    ADD CONSTRAINT chk_rent_calculator_fees_state_name
    CHECK ((state_id IS NULL AND state_name IS NULL) OR (state_id IS NOT NULL AND state_name IS NOT NULL));

ALTER TABLE rent_calculator_fees DROP CONSTRAINT IF EXISTS chk_rent_calculator_fees_lga_name;
ALTER TABLE rent_calculator_fees
    ADD CONSTRAINT chk_rent_calculator_fees_lga_name
    CHECK ((lga_id IS NULL AND lga_name IS NULL) OR (lga_id IS NOT NULL AND lga_name IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_rent_calculator_fees_state
    ON rent_calculator_fees(state_id);
CREATE INDEX IF NOT EXISTS idx_rent_calculator_fees_lga
    ON rent_calculator_fees(lga_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
DROP TRIGGER IF EXISTS update_rent_calculator_fees_updated_at ON rent_calculator_fees;

CREATE TRIGGER update_rent_calculator_fees_updated_at
    BEFORE UPDATE ON rent_calculator_fees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED GLOBAL DEFAULT ROW
-- ============================================
INSERT INTO rent_calculator_fees
    (state_id, state_name, lga_id, lga_name, agent_fee_pct, legal_fee_pct, caution_months, agreement_fee, service_charge)
SELECT NULL, NULL, NULL, NULL, 10, 10, 1, 5000, 0
WHERE NOT EXISTS (
    SELECT 1 FROM rent_calculator_fees WHERE state_id IS NULL AND lga_id IS NULL
);

-- ============================================
-- ADMIN OPERATION AUDIT TRAIL
-- ============================================
CREATE TABLE IF NOT EXISTS rent_calculator_fee_operations (
    id SERIAL PRIMARY KEY,
    fee_id INTEGER REFERENCES rent_calculator_fees(id) ON DELETE SET NULL,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    event_type VARCHAR(80) NOT NULL,
    note TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rent_calculator_fee_ops_fee
    ON rent_calculator_fee_operations(fee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rent_calculator_fee_ops_created
    ON rent_calculator_fee_operations(created_at DESC);
