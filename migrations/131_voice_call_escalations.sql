-- Department call escalations initiated by agents from the Voice Desk.
-- Audit trail only: the live transfer is performed through the Twilio REST
-- API on the caller's leg.

CREATE TABLE IF NOT EXISTS voice_call_escalations (
  id BIGSERIAL PRIMARY KEY,
  call_sid VARCHAR(64) NOT NULL,
  agent_call_sid VARCHAR(64) NOT NULL,
  department VARCHAR(64) NOT NULL,
  escalated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_call_escalations_created
  ON voice_call_escalations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_call_escalations_call_sid
  ON voice_call_escalations(call_sid);
