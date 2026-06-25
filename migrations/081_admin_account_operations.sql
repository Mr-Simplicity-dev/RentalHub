CREATE TABLE IF NOT EXISTS admin_account_operations (
  id SERIAL PRIMARY KEY,
  admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  admin_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_account_operations_admin
  ON admin_account_operations(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_account_operations_created
  ON admin_account_operations(created_at DESC);
