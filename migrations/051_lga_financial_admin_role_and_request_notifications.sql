-- Add the LGA Financial Admin role and notification tracking for tenant property requests.

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
