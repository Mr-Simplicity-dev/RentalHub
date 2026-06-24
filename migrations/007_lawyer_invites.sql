BEGIN;

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
  ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('landlord', 'tenant', 'lawyer', 'admin', 'super_admin'));

CREATE TABLE IF NOT EXISTS lawyer_invites (
  id SERIAL PRIMARY KEY,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lawyer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lawyer_email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resent_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lawyer_invites_client
  ON lawyer_invites(client_user_id);

CREATE INDEX IF NOT EXISTS idx_lawyer_invites_email
  ON lawyer_invites(lawyer_email);

CREATE INDEX IF NOT EXISTS idx_lawyer_invites_status
  ON lawyer_invites(status, expires_at);

COMMIT;
