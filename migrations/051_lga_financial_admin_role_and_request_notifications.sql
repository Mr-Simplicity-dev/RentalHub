-- Add the LGA Financial Admin role and notification tracking for tenant property requests.

DO $$
DECLARE
  existing_check_name TEXT;
  current_len INTEGER;
  col_has_views INTEGER;
BEGIN
  -- Drop existing check constraint on user_type if it exists
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

  -- Get current character maximum length
  SELECT COALESCE(character_maximum_length, 0) INTO current_len
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'user_type';

  -- Only ALTER if column is narrower than VARCHAR(50)
  IF current_len < 50 THEN
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

    ALTER TABLE users ALTER COLUMN user_type TYPE VARCHAR(50);
    RAISE NOTICE 'Altered user_type to VARCHAR(50)';
  ELSE
    RAISE NOTICE 'user_type is already VARCHAR(%), skipping ALTER COLUMN', current_len;
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_user_type_check
  CHECK (
    user_type IN (
      'tenant',
      'landlord',
      'lawyer',
      'state_lawyer',
      'super_lawyer',
      'admin',
      'lga_admin',
      'lga_financial_admin',
      'state_admin',
      'state_financial_admin',
      'state_support_admin',
      'super_admin',
      'financial_admin',
      'super_financial_admin',
      'super_support_admin',
      'agent',
      'fumigation_admin',
      'transportation_admin'
    )
  );

CREATE TABLE IF NOT EXISTS tenant_property_request_notification_logs (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER NOT NULL REFERENCES tenant_property_alerts(id) ON DELETE CASCADE,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_role VARCHAR(50),
  notification_group VARCHAR(60) NOT NULL,
  send_count INTEGER NOT NULL DEFAULT 1,
  first_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(alert_id, recipient_user_id, notification_group)
);

CREATE INDEX IF NOT EXISTS idx_tenant_request_notification_logs_alert
  ON tenant_property_request_notification_logs(alert_id, notification_group);

CREATE INDEX IF NOT EXISTS idx_tenant_request_notification_logs_recipient
  ON tenant_property_request_notification_logs(recipient_user_id, last_sent_at DESC);
