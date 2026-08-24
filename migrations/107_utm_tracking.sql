-- UTM tracking: store marketing attribution on users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS utm_source VARCHAR(64),
  ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(64),
  ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(128),
  ADD COLUMN IF NOT EXISTS utm_term VARCHAR(128),
  ADD COLUMN IF NOT EXISTS utm_content VARCHAR(128),
  ADD COLUMN IF NOT EXISTS utm_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS utm_landing_page VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_utm_source ON users(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_utm_campaign ON users(utm_campaign) WHERE utm_campaign IS NOT NULL;
