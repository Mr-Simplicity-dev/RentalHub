-- 163: device/account-link analysis
-- Links device fingerprints to accounts so shared-device / multi-account abuse
-- can be detected and flagged.
CREATE TABLE IF NOT EXISTS device_links (
  id BIGSERIAL PRIMARY KEY,
  device_fingerprint VARCHAR(64) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_fingerprint, user_id)
);

CREATE INDEX IF NOT EXISTS idx_device_links_fingerprint ON device_links (device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_links_user ON device_links (user_id);
