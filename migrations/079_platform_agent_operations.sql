CREATE TABLE IF NOT EXISTS platform_agent_operations (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES platform_agents(id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  agent_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_agent_operations_agent
  ON platform_agent_operations(agent_id, created_at DESC);
