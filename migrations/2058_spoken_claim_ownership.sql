BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS user_notification_preferences (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, preferences JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS claim_token VARCHAR(120);
UPDATE spoken_notification_events SET status=CASE WHEN expires_at<=CURRENT_TIMESTAMP THEN 'expired' WHEN attempt_count>=COALESCE(max_attempts,3) THEN 'failed' ELSE 'pending' END,claimed_by_device=NULL,claim_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE status='claimed' AND claim_token IS NULL;
COMMIT;
