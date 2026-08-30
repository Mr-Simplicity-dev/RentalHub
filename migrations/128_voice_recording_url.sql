-- Recording URLs for recorded call legs (VOICE_RECORD_CALLS=true). The
-- /voice/recording webhook back-fills the URL onto the matching call-status
-- row when it exists.

ALTER TABLE voice_call_events
  ADD COLUMN IF NOT EXISTS recording_url VARCHAR(512);
