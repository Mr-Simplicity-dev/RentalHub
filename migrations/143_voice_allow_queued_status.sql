-- 143_voice_allow_queued_status.sql
-- /voice/wait persists the parked caller's leg with status 'queued', but the
-- original CHECK (migration 126) did not list 'queued', so that insert always
-- failed silently inside its best-effort try/catch. Relax the constraint.

ALTER TABLE voice_call_events DROP CONSTRAINT IF EXISTS voice_call_events_status_check;

ALTER TABLE voice_call_events
  ADD CONSTRAINT voice_call_events_status_check
  CHECK (status IN (
    'initiated', 'ringing', 'answered', 'in-progress', 'queued',
    'completed', 'busy', 'failed', 'no-answer', 'cancel'
  ));
