CREATE TABLE IF NOT EXISTS admin_withdrawal_operations (
  id SERIAL PRIMARY KEY,
  withdrawal_id INTEGER REFERENCES admin_withdrawals(id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  withdrawal_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_withdrawal_operations_withdrawal
  ON admin_withdrawal_operations(withdrawal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_withdrawal_operations_created
  ON admin_withdrawal_operations(created_at DESC);
