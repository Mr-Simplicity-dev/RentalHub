CREATE TABLE IF NOT EXISTS platform_lawyer_application_operations (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES platform_lawyer_applications(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_lawyer_app_operations_application
  ON platform_lawyer_application_operations(application_id, created_at DESC);
