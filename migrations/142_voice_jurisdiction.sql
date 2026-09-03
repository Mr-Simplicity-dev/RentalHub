-- 142_voice_jurisdiction.sql
-- Geo support line (Phase 0/1): persist the caller's area on voice records so
-- reads can be scoped to LGA / state / super tiers and later inbound routing
-- (docs/geo-support-escalation-design.md). Columns are additive; legacy rows
-- have NULL jurisdiction and remain visible only to super-tier readers.

ALTER TABLE voice_call_events
  ADD COLUMN IF NOT EXISTS jurisdiction_state VARCHAR(120),
  ADD COLUMN IF NOT EXISTS jurisdiction_lga VARCHAR(120),
  ADD COLUMN IF NOT EXISTS jurisdiction_source VARCHAR(16);

ALTER TABLE voice_callback_requests
  ADD COLUMN IF NOT EXISTS jurisdiction_state VARCHAR(120),
  ADD COLUMN IF NOT EXISTS jurisdiction_lga VARCHAR(120),
  ADD COLUMN IF NOT EXISTS jurisdiction_source VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_voice_call_events_jurisdiction
  ON voice_call_events (jurisdiction_state, jurisdiction_lga, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_callback_requests_jurisdiction
  ON voice_callback_requests (jurisdiction_state, jurisdiction_lga, created_at DESC);
