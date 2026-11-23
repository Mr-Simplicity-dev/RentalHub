BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE IF NOT EXISTS spoken_notification_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  source_type VARCHAR(80),
  source_id BIGINT,
  dedup_key VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  language VARCHAR(16) NOT NULL DEFAULT 'en',
  audio_key VARCHAR(120),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by_device VARCHAR(120),
  claim_expires_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_device VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT spoken_notification_events_status_check CHECK (status IN ('pending', 'claimed', 'acknowledged', 'expired', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spoken_notification_events_user_dedup
  ON spoken_notification_events(user_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_spoken_notification_events_user_status_expires
  ON spoken_notification_events(user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_spoken_notification_events_expires
  ON spoken_notification_events(expires_at);

COMMIT;
