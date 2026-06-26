CREATE TABLE IF NOT EXISTS rent_savings_setup_fee_operations (
  id SERIAL PRIMARY KEY,
  setup_fee_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rent_savings_setup_fee_ops_fee
  ON rent_savings_setup_fee_operations(setup_fee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rent_savings_setup_fee_ops_created
  ON rent_savings_setup_fee_operations(created_at DESC);
