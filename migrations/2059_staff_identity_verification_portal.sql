BEGIN;

CREATE TABLE IF NOT EXISTS staff_identities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  staff_verification_id VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  official_photo_url TEXT,
  official_role VARCHAR(150) NOT NULL,
  department VARCHAR(150) NOT NULL,
  engagement_type VARCHAR(40) NOT NULL CHECK (
    engagement_type IN (
      'employee',
      'contract_staff',
      'field_agent',
      'volunteer',
      'approved_representative'
    )
  ),
  status VARCHAR(30) NOT NULL DEFAULT 'pending_approval' CHECK (
    status IN (
      'pending_approval',
      'active',
      'suspended',
      'revoked',
      'rejected'
    )
  ),
  approved_activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  financial_collection_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status_reason TEXT,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_identities_verification_id
  ON staff_identities (staff_verification_id);

CREATE INDEX IF NOT EXISTS idx_staff_identities_status
  ON staff_identities (status, expires_at);

CREATE TABLE IF NOT EXISTS staff_verification_challenges (
  id SERIAL PRIMARY KEY,
  staff_identity_id INTEGER NOT NULL REFERENCES staff_identities(id) ON DELETE CASCADE,
  challenge_reference VARCHAR(32) NOT NULL UNIQUE,
  challenge_code_hash VARCHAR(128) NOT NULL UNIQUE,
  challenge_token_hash VARCHAR(128) NOT NULL UNIQUE,
  visitor_poll_token_hash VARCHAR(128) NOT NULL,
  purpose VARCHAR(300) NOT NULL,
  status VARCHAR(25) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'confirmed', 'rejected', 'expired', 'cancelled')
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  responded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  response_note VARCHAR(300),
  requester_ip VARCHAR(64),
  requester_user_agent VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_challenges_identity_status
  ON staff_verification_challenges (staff_identity_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_challenges_expires_at
  ON staff_verification_challenges (expires_at);

CREATE TABLE IF NOT EXISTS staff_verification_events (
  id SERIAL PRIMARY KEY,
  staff_identity_id INTEGER REFERENCES staff_identities(id) ON DELETE SET NULL,
  challenge_id INTEGER REFERENCES staff_verification_challenges(id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lookup_identifier_hash VARCHAR(64),
  outcome VARCHAR(40),
  ip_address VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_events_identity_created
  ON staff_verification_events (staff_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_events_ip_created
  ON staff_verification_events (ip_address, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS staff_impersonation_reports (
  id SERIAL PRIMARY KEY,
  report_reference VARCHAR(32) NOT NULL UNIQUE,
  staff_identity_id INTEGER REFERENCES staff_identities(id) ON DELETE SET NULL,
  reported_staff_id VARCHAR(64),
  challenge_reference VARCHAR(32),
  category VARCHAR(60) NOT NULL CHECK (
    category IN (
      'fake_identity',
      'stolen_staff_id',
      'photo_mismatch',
      'unauthorised_payment_request',
      'unauthorised_permissions_claimed',
      'refused_live_confirmation',
      'suspicious_or_rejected_request',
      'other'
    )
  ),
  description TEXT NOT NULL,
  incident_location VARCHAR(200),
  reporter_name VARCHAR(150),
  reporter_contact VARCHAR(150),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'investigating', 'resolved', 'dismissed')
  ),
  investigation_notes TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_impersonation_status_created
  ON staff_impersonation_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_impersonation_identity
  ON staff_impersonation_reports (staff_identity_id, created_at DESC);

COMMIT;
