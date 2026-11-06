CREATE TABLE IF NOT EXISTS registration_phone_challenges (
  id UUID PRIMARY KEY,
  phone_key VARCHAR(64) NOT NULL,
  payload_digest VARCHAR(64) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS registration_phone_challenges_phone_created_idx
  ON registration_phone_challenges(phone_key, created_at DESC);
