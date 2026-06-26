CREATE TABLE IF NOT EXISTS platform_rating_operations (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_rating_operations_entity
  ON platform_rating_operations(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_rating_operations_created
  ON platform_rating_operations(created_at DESC);
