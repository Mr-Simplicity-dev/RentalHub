CREATE TABLE IF NOT EXISTS fraud_flag_operations (
  id SERIAL PRIMARY KEY,
  fraud_flag_id INTEGER REFERENCES fraud_flags(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fraud_flag_operations_flag
  ON fraud_flag_operations(fraud_flag_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_flag_operations_created
  ON fraud_flag_operations(created_at DESC);
