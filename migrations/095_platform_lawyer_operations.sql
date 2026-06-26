CREATE TABLE IF NOT EXISTS platform_lawyer_operations (
  id SERIAL PRIMARY KEY,
  platform_lawyer_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_lawyer_operations_lawyer
  ON platform_lawyer_operations(platform_lawyer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_lawyer_operations_created
  ON platform_lawyer_operations(created_at DESC);
