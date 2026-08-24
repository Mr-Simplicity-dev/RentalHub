CREATE TABLE IF NOT EXISTS user_account_operations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_account_operations_user
  ON user_account_operations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_account_operations_created
  ON user_account_operations(created_at DESC);
