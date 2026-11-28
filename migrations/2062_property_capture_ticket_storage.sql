ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS submission_key VARCHAR(80),
  ADD COLUMN IF NOT EXISTS submission_fingerprint VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_landlord_submission_key
  ON properties (landlord_id, submission_key)
  WHERE submission_key IS NOT NULL;

ALTER TABLE property_photos
  ADD COLUMN IF NOT EXISTS capture_token_hash VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_photos_capture_token
  ON property_photos (capture_token_hash)
  WHERE capture_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS property_capture_tickets (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_for_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_property_capture_tickets_user_expiry
  ON property_capture_tickets (user_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS property_clips (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  clip_url VARCHAR(1000) NOT NULL,
  clip_order INTEGER NOT NULL DEFAULT 0,
  shot_key VARCHAR(60),
  duration_seconds NUMERIC(6,2),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE property_clips
  ADD COLUMN IF NOT EXISTS capture_token_hash VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_clips_capture_token
  ON property_clips (capture_token_hash)
  WHERE capture_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_clips_property
  ON property_clips (property_id, clip_order ASC, id ASC);
