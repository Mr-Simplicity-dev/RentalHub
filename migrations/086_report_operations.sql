CREATE TABLE IF NOT EXISTS report_operations (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_operations_report
  ON report_operations(report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_operations_created
  ON report_operations(created_at DESC);
