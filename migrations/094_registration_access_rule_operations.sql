CREATE TABLE IF NOT EXISTS registration_access_rule_operations (
  id SERIAL PRIMARY KEY,
  registration_access_rule_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registration_access_rule_ops_rule
  ON registration_access_rule_operations(registration_access_rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_access_rule_ops_created
  ON registration_access_rule_operations(created_at DESC);
