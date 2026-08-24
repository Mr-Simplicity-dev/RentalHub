-- Multi-support-admin pool + operational activity logging

-- 1. Add is_lead column to users table (for pool hierarchy)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_lead ON users(is_lead);

-- Mark existing single support admins as leads automatically
-- (so every existing admin keeps their access while new ones can be added)
UPDATE users
SET is_lead = true
WHERE user_type IN (
  'lga_support_admin',
  'state_support_admin',
  'super_support_admin'
)
AND deleted_at IS NULL
AND account_suspended_at IS NULL;

-- 2. Create operational activity_logs table (separate from audit_logs blockchain)
CREATE TABLE IF NOT EXISTS support_activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  user_type VARCHAR(50),
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  state VARCHAR(100),
  lga VARCHAR(100),
  ip_address VARCHAR(45),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_activity_logs_user
  ON support_activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_activity_logs_action
  ON support_activity_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_activity_logs_entity
  ON support_activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_support_activity_logs_scope
  ON support_activity_logs(state, lga, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_activity_logs_created
  ON support_activity_logs(created_at DESC);
