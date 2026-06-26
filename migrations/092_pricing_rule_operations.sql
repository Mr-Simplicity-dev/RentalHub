CREATE TABLE IF NOT EXISTS pricing_rule_operations (
  id SERIAL PRIMARY KEY,
  pricing_rule_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pricing_rule_operations_rule
  ON pricing_rule_operations(pricing_rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_rule_operations_created
  ON pricing_rule_operations(created_at DESC);
