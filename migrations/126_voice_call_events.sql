-- Twilio voice call-event log. Receives the Dial statusCallback webhook
-- (/voice/status) for every inbound and outbound call leg and records each
-- state transition for analytics and operational correlation.
--
-- Twilio retries failed webhooks, so (call_sid, status) is unique: replaying
-- the same status event for the same leg updates the row instead of
-- duplicating it.

CREATE TABLE IF NOT EXISTS voice_call_events (
  id BIGSERIAL PRIMARY KEY,
  call_sid VARCHAR(64) NOT NULL,
  parent_call_sid VARCHAR(64),
  direction VARCHAR(16) NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'unknown',
  status VARCHAR(24) NOT NULL,
  from_number VARCHAR(32),
  to_number VARCHAR(64),
  duration_sec INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT voice_call_events_call_status_unique UNIQUE (call_sid, status),
  CONSTRAINT voice_call_events_status_check
    CHECK (status IN (
      'initiated', 'ringing', 'answered', 'in-progress',
      'completed', 'busy', 'failed', 'no-answer', 'cancel'
    ))
);

CREATE INDEX IF NOT EXISTS idx_voice_call_events_call_sid
  ON voice_call_events(call_sid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_call_events_created
  ON voice_call_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_call_events_source_status
  ON voice_call_events(source, status, created_at DESC);
