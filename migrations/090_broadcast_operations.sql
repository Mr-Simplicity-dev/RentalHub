CREATE TABLE IF NOT EXISTS broadcast_operations (
  id SERIAL PRIMARY KEY,
  broadcast_id INTEGER REFERENCES broadcasts(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broadcast_operations_broadcast
  ON broadcast_operations(broadcast_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_operations_created
  ON broadcast_operations(created_at DESC);
