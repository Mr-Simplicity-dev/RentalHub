CREATE TABLE IF NOT EXISTS role_state_migration_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_type VARCHAR(20) NOT NULL,
  from_state VARCHAR(100) NOT NULL,
  to_state VARCHAR(100) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT role_state_migration_user_type_check CHECK (user_type IN ('agent', 'lawyer')),
  CONSTRAINT role_state_migration_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_state_migration_one_pending
  ON role_state_migration_requests(user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_role_state_migration_user
  ON role_state_migration_requests(user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_state_migration_status
  ON role_state_migration_requests(status, requested_at DESC);
