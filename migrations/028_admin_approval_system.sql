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

-- Support admin role constraints
-- Merged from the duplicate 028_support_admin_roles.sql so only one 028 migration remains.

DO $$
DECLARE
  existing_check_name TEXT;
BEGIN
  SELECT c.conname
  INTO existing_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'users'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%user_type%';

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', existing_check_name);
  END IF;
END $$;

ALTER TABLE users
  ALTER COLUMN user_type TYPE VARCHAR(50);

ALTER TABLE users
  ADD CONSTRAINT users_user_type_check
  CHECK (
    user_type IN (
      'tenant',
      'landlord',
      'agent',
      'admin',
      'lga_admin',
      'state_admin',
      'super_admin',
      'lga_support_admin',
      'state_support_admin',
      'super_support_admin',
      'lga_financial_admin',
      'state_financial_admin',
      'financial_admin',
      'super_financial_admin',
      'lawyer',
      'state_lawyer',
      'super_lawyer',
      'transportation_admin',
      'lga_transportation_admin',
      'state_transportation_admin',
      'super_transportation_admin',
      'fumigation_admin',
      'lga_fumigation_admin',
      'state_fumigation_admin',
      'super_fumigation_admin'
    )
  );
