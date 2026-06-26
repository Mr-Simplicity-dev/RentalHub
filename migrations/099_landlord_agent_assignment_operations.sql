CREATE TABLE IF NOT EXISTS landlord_agent_assignment_operations (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER REFERENCES landlord_agents(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  previous_status VARCHAR(40),
  new_status VARCHAR(40),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_landlord_agent_assignment_ops_assignment
  ON landlord_agent_assignment_operations(assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landlord_agent_assignment_ops_created
  ON landlord_agent_assignment_operations(created_at DESC);
