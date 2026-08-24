ALTER TABLE applications
ADD COLUMN IF NOT EXISTS proposed_rent DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS counter_offer_rent DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS agreed_rent DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS negotiation_status VARCHAR(30) NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS application_negotiations (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_role VARCHAR(20) NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  offer_amount DECIMAL(12, 2),
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_negotiations_application
  ON application_negotiations(application_id);

CREATE INDEX IF NOT EXISTS idx_application_negotiations_actor
  ON application_negotiations(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_applications_negotiation_status
  ON applications(negotiation_status);
