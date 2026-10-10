-- 161: security alerts table for monitoring + detection
CREATE TABLE IF NOT EXISTS security_alerts (
  id BIGSERIAL PRIMARY KEY,
  event VARCHAR(120) NOT NULL,
  actor_id INTEGER,
  actor_type VARCHAR(40),
  target_type VARCHAR(40),
  target_id INTEGER,
  ip VARCHAR(64),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_event ON security_alerts(event);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created ON security_alerts(created_at);
