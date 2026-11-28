ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS receiver_viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_call_sessions_unread_missed_receiver
  ON call_sessions (receiver_id, requested_at DESC)
  WHERE status = 'missed' AND receiver_viewed_at IS NULL;
