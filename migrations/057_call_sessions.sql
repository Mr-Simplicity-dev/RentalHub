CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY,
  caller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  receiver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  call_type VARCHAR(30) NOT NULL CHECK (call_type IN ('audio', 'video', 'virtual_tour')),
  status VARCHAR(30) NOT NULL CHECK (status IN ('ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_caller_id ON call_sessions(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_receiver_id ON call_sessions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_property_id ON call_sessions(property_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_call_type ON call_sessions(call_type);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_requested_at ON call_sessions(requested_at DESC);
