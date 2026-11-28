CREATE TABLE IF NOT EXISTS landlord_listing_assistance_requests (
  id SERIAL PRIMARY KEY,
  landlord_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE RESTRICT,
  state_name VARCHAR(120) NOT NULL,
  lga_name VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'awaiting_assignment',
  assigned_agent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  landlord_agent_assignment_id INTEGER REFERENCES landlord_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_at TIMESTAMP,
  CONSTRAINT chk_listing_assistance_request_status
    CHECK (status IN ('awaiting_assignment', 'assigned', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_assistance_pending_request
  ON landlord_listing_assistance_requests (
    landlord_user_id,
    state_id,
    lower(lga_name),
    (COALESCE(property_id, 0))
  )
  WHERE status = 'awaiting_assignment';

CREATE INDEX IF NOT EXISTS idx_listing_assistance_request_queue
  ON landlord_listing_assistance_requests(status, state_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_assistance_request_landlord
  ON landlord_listing_assistance_requests(landlord_user_id, created_at DESC);
