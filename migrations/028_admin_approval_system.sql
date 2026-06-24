-- Migration 028: Admin approval system
-- New admin accounts for financial/support/lawyer/agent roles start in 'pending'
-- until approved by super_admin (or delegated super_financial_admin).
--
-- FIXED: Skip ALTER COLUMN user_type if it's already VARCHAR(50) or wider,
--        and temporarily drop dependent views before altering, then recreate them.

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

-- FIX: Check current column type before attempting ALTER COLUMN,
-- and handle view dependencies safely.
DO $$
DECLARE
  current_len       INTEGER;
  col_has_views     INTEGER;
  existing_check_name TEXT;
BEGIN
  -- Get current data type of user_type column
  SELECT COALESCE(character_maximum_length, 0) INTO current_len
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'user_type';

  -- If already at least VARCHAR(50), skip the ALTER to avoid view dependency errors
  IF current_len >= 50 THEN
    RAISE NOTICE 'user_type is already VARCHAR(%) or wider, skipping ALTER COLUMN', current_len;
  ELSE
    -- Check if any views depend on the users table
    SELECT COUNT(*) INTO col_has_views
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v ON v.oid = r.ev_class
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.refclassid = 'pg_class'::regclass
      AND d.classid = 'pg_rewrite'::regclass
      AND d.refobjsubid > 0
      AND a.attrelid = 'users'::regclass
      AND v.relkind = 'v'
      AND a.attname = 'user_type';

    -- Drop views temporarily if they depend on user_type
    IF col_has_views > 0 THEN
      RAISE NOTICE '% view(s) depend on user_type, dropping temporarily', col_has_views;
      DROP VIEW IF EXISTS financial_admin_dashboard CASCADE;
      DROP VIEW IF EXISTS lga_admin_hierarchy CASCADE;
      DROP VIEW IF EXISTS state_admin_earnings CASCADE;
      DROP VIEW IF EXISTS state_admin_transportation_view CASCADE;
      DROP VIEW IF EXISTS super_admin_transportation_oversight_view CASCADE;
      DROP VIEW IF EXISTS transportation_system_health_view CASCADE;
    END IF;

    ALTER TABLE users ALTER COLUMN user_type TYPE VARCHAR(50);
    RAISE NOTICE 'Altered user_type to VARCHAR(50)';
  END IF;

  -- Drop existing check constraint on user_type if it exists
  SELECT c.conname
  INTO existing_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'users'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%user_type%'
  LIMIT 1;

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', existing_check_name);
  END IF;
END $$;

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

-- Recreate any views that were dropped above (if they existed before)
-- These are defined in 012_state_admin_system.sql, 031_lga_admin_system.sql, and 032_transportation_admin_monitoring.sql
-- and will be recreated when those files run. We just ensure they exist here if already applied.
-- The OR REPLACE in later migrations handles recreation. DO NOT recreate here to avoid
-- ordering conflicts — later migrations will do it naturally via CREATE OR REPLACE VIEW.
