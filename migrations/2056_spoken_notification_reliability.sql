BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE spoken_notification_events
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failure_reason VARCHAR(64),
  ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_eligible_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS playback_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS playback_failure_reason VARCHAR(64),
  ADD COLUMN IF NOT EXISTS claim_token VARCHAR(120);

ALTER TABLE spoken_notification_events DROP CONSTRAINT IF EXISTS spoken_notification_events_status_check;
ALTER TABLE spoken_notification_events
  ADD CONSTRAINT spoken_notification_events_status_check
  CHECK (status IN ('pending', 'claimed', 'acknowledged', 'expired', 'cancelled', 'failed'));

CREATE INDEX IF NOT EXISTS idx_spoken_notification_events_retry
  ON spoken_notification_events(user_id, status, next_eligible_at, expires_at DESC);

COMMIT;
