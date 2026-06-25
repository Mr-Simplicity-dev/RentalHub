CREATE TABLE IF NOT EXISTS email_marketing_operations (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_marketing_operations_entity
  ON email_marketing_operations(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_marketing_operations_created
  ON email_marketing_operations(created_at DESC);
