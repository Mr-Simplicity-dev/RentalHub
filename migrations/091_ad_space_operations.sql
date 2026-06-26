CREATE TABLE IF NOT EXISTS ad_space_operations (
  id SERIAL PRIMARY KEY,
  ad_space_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ad_space_operations_ad_space
  ON ad_space_operations(ad_space_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_space_operations_created
  ON ad_space_operations(created_at DESC);
