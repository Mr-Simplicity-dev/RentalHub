-- Extend user_type column from VARCHAR(20) to VARCHAR(50)
-- Roles like 'state_financial_admin' (21 chars) and 'super_financial_admin' (21 chars)
-- exceeded the old VARCHAR(20) limit, causing server errors on creation.
-- The protect_super_admin rule must be dropped first, then recreated.
-- FIXED: Only ALTER if column is narrower than VARCHAR(50) to avoid view dependency errors.

DO $$
DECLARE
  current_len INTEGER;
  col_has_views INTEGER;
BEGIN
  -- Get current character maximum length
  SELECT COALESCE(character_maximum_length, 0) INTO current_len
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'user_type';

  RAISE NOTICE 'Current user_type length: %', current_len;

  -- If already >= 50, skip to avoid "cannot alter type of a column used by a view or rule"
  IF current_len >= 50 THEN
    RAISE NOTICE 'user_type is already VARCHAR(%), skipping ALTER COLUMN', current_len;
    RETURN;
  END IF;

  -- Check for dependent views
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

  IF col_has_views > 0 THEN
    RAISE NOTICE '% view(s) depend on user_type, dropping temporarily', col_has_views;
    DROP VIEW IF EXISTS financial_admin_dashboard CASCADE;
    DROP VIEW IF EXISTS lga_admin_hierarchy CASCADE;
    DROP VIEW IF EXISTS state_admin_earnings CASCADE;
    DROP VIEW IF EXISTS state_admin_transportation_view CASCADE;
    DROP VIEW IF EXISTS super_admin_transportation_oversight_view CASCADE;
    DROP VIEW IF EXISTS transportation_system_health_view CASCADE;
  END IF;

  -- Drop rule before altering
  DROP RULE IF EXISTS protect_super_admin ON users;

  ALTER TABLE users ALTER COLUMN user_type TYPE VARCHAR(50);

  RAISE NOTICE 'Successfully altered user_type to VARCHAR(50)';
END $$;

-- Recreate the protection rule regardless
DROP RULE IF EXISTS protect_super_admin ON users;

CREATE RULE protect_super_admin AS
  ON DELETE TO users
  WHERE (OLD.user_type = 'super_admin')
  DO INSTEAD NOTHING;
