-- Migration 028: Admin approval system
-- New admin accounts for financial/support/lawyer/agent roles start in 'pending'
-- until approved by super_admin (or delegated super_financial_admin).

-- 1. Add approval_status to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved';

-- 2. Roles that require explicit super-admin approval on creation
-- (existing rows keep 'approved'; new rows for these roles default to 'pending' via app logic)

-- 3. Super Financial Admin delegation permissions
CREATE TABLE IF NOT EXISTS sfa_delegation_permissions (
  id                      SERIAL PRIMARY KEY,
  super_financial_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_approve_admins      BOOLEAN NOT NULL DEFAULT FALSE,
  can_direct_withdraw     BOOLEAN NOT NULL DEFAULT FALSE,
  granted_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at              TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (super_financial_admin_id)
);

CREATE INDEX IF NOT EXISTS idx_sfa_perms_admin_id ON sfa_delegation_permissions (super_financial_admin_id);
