ALTER TABLE role_state_migration_requests
  ADD COLUMN IF NOT EXISTS outgoing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS incoming_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outgoing_reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS outgoing_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outgoing_review_note TEXT,
  ADD COLUMN IF NOT EXISTS incoming_reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS incoming_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS incoming_review_note TEXT,
  ADD COLUMN IF NOT EXISTS super_review_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS super_reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS super_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS super_review_note TEXT,
  ADD COLUMN IF NOT EXISTS migration_applied_at TIMESTAMP;

ALTER TABLE role_state_migration_requests
  DROP CONSTRAINT IF EXISTS role_state_migration_status_check;

ALTER TABLE role_state_migration_requests
  ADD CONSTRAINT role_state_migration_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE role_state_migration_requests
  DROP CONSTRAINT IF EXISTS role_state_migration_outgoing_status_check;

ALTER TABLE role_state_migration_requests
  ADD CONSTRAINT role_state_migration_outgoing_status_check CHECK (outgoing_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE role_state_migration_requests
  DROP CONSTRAINT IF EXISTS role_state_migration_incoming_status_check;

ALTER TABLE role_state_migration_requests
  ADD CONSTRAINT role_state_migration_incoming_status_check CHECK (incoming_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE role_state_migration_requests
  DROP CONSTRAINT IF EXISTS role_state_migration_super_status_check;

ALTER TABLE role_state_migration_requests
  ADD CONSTRAINT role_state_migration_super_status_check
  CHECK (super_review_status IS NULL OR super_review_status IN ('approved', 'rejected'));

CREATE TABLE IF NOT EXISTS role_state_migration_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES role_state_migration_requests(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(30),
  action VARCHAR(40) NOT NULL,
  direction VARCHAR(20),
  decision VARCHAR(20),
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_state_migration_one_pending
  ON role_state_migration_requests(user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_role_state_migration_from_state
  ON role_state_migration_requests(from_state, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_state_migration_to_state
  ON role_state_migration_requests(to_state, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_state_migration_audit_request
  ON role_state_migration_audit_logs(request_id, created_at DESC);

UPDATE role_state_migration_requests
SET
  outgoing_status = CASE
    WHEN status = 'approved' THEN 'approved'
    WHEN status = 'rejected' THEN COALESCE(NULLIF(outgoing_status, 'pending'), 'rejected')
    ELSE outgoing_status
  END,
  incoming_status = CASE
    WHEN status = 'approved' THEN 'approved'
    WHEN status = 'rejected' THEN COALESCE(NULLIF(incoming_status, 'pending'), 'rejected')
    ELSE incoming_status
  END
WHERE status IN ('approved', 'rejected');
