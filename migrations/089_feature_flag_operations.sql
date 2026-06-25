CREATE TABLE IF NOT EXISTS feature_flag_operations (
  id SERIAL PRIMARY KEY,
  flag_key VARCHAR(100) NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  previous_enabled BOOLEAN,
  new_enabled BOOLEAN,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feature_flag_operations_key
  ON feature_flag_operations(flag_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feature_flag_operations_created
  ON feature_flag_operations(created_at DESC);
