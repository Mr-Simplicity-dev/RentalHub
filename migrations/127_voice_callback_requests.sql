-- Voice callback requests: DTMF numbers collected during the after-hours
-- IVR branch (press 3 → enter callback number). Admins can review them via
-- GET /voice/callbacks (authenticated admin/super-admin only).

CREATE TABLE IF NOT EXISTS voice_callback_requests (
  id BIGSERIAL PRIMARY KEY,
  call_sid VARCHAR(64),
  phone_number VARCHAR(20) NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_callback_requests_created
  ON voice_callback_requests(created_at DESC);
