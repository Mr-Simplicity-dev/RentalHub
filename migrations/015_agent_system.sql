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
  CHECK (
    user_type IN (
      'tenant',
      'landlord',
      'lawyer',
      'admin',
      'state_admin',
      'super_admin',
      'financial_admin',
      'agent'
    )
  );

CREATE TABLE IF NOT EXISTS landlord_agents (
  id SERIAL PRIMARY KEY,
  landlord_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  can_manage_properties BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_damage_reports BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_disputes BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_legal BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_finances BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP,
  UNIQUE (landlord_user_id, agent_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_landlord_agents_active_landlord
  ON landlord_agents(landlord_user_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_landlord_agents_active_agent
  ON landlord_agents(agent_user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS agent_invites (
  id SERIAL PRIMARY KEY,
  landlord_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  agent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  agent_full_name VARCHAR(255),
  agent_email VARCHAR(255) NOT NULL,
  agent_phone VARCHAR(20),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resent_count INTEGER NOT NULL DEFAULT 0,
  can_manage_properties BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_damage_reports BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_disputes BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_legal BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_finances BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_invites_landlord
  ON agent_invites(landlord_user_id);

CREATE INDEX IF NOT EXISTS idx_agent_invites_email
  ON agent_invites(agent_email);

CREATE INDEX IF NOT EXISTS idx_agent_invites_status
  ON agent_invites(status, expires_at);
