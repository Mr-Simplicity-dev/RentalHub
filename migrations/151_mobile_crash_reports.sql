-- Mobile crash diagnostics table.
-- It is also created on demand by routes/mobileDiagnostics.js, but it is added
-- here so it always exists (and is tracked) in every environment.

CREATE TABLE IF NOT EXISTS mobile_crash_reports (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  stack TEXT,
  component_stack TEXT,
  platform VARCHAR(40),
  app_version VARCHAR(80),
  route_name VARCHAR(120),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mobile_crash_reports_created
  ON mobile_crash_reports(created_at DESC);
