-- 144_voice_relate_requests.sql
-- Phase 4 "relate to Super Admin": when super support cannot resolve a call it
-- flags a relate request for the platform Super Admin. Kept in its own small
-- table (NOT department support_tickets) so the department escalation flow is
-- untouched and the Super Admin gets a dedicated, glanceable list.

CREATE TABLE IF NOT EXISTS voice_relate_requests (
  id BIGSERIAL PRIMARY KEY,
  call_sid VARCHAR(64),
  caller_number VARCHAR(32),
  source VARCHAR(24) NOT NULL DEFAULT 'unknown',
  note TEXT,
  related_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_relate_status
  ON voice_relate_requests (status, created_at DESC);
