CREATE TABLE IF NOT EXISTS admin_approval_decisions (
  id SERIAL PRIMARY KEY,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  decision VARCHAR(20) NOT NULL,
  note TEXT,
  target_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_admin_approval_decision
    CHECK (decision IN ('approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_admin_approval_decisions_created
  ON admin_approval_decisions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_approval_decisions_target
  ON admin_approval_decisions(target_user_id, created_at DESC);
