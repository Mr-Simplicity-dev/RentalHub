CREATE TABLE IF NOT EXISTS rental_application_operations (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  previous_status VARCHAR(40),
  new_status VARCHAR(40),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rental_application_ops_application
  ON rental_application_operations(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_application_ops_created
  ON rental_application_operations(created_at DESC);
