-- ============================================================
-- Recruitment interview session controls
-- Migration 114: session expiry, inactivity abandonment and
-- auto-completion columns for the proctored interview.
-- ============================================================

ALTER TABLE recruitment_applications
  ADD COLUMN IF NOT EXISTS interview_session_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_abandoned_reason TEXT,
  ADD COLUMN IF NOT EXISTS interview_expired BOOLEAN DEFAULT FALSE;

-- Scan index used by the recruitment session cron job to find
-- active interviews that need abandonment / auto-completion.
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_interview_session_scan
  ON recruitment_applications(interview_last_ping_at)
  WHERE interview_started_at IS NOT NULL AND interview_completed = FALSE;
