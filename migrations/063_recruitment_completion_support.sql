-- ============================================================
-- Recruitment completion support
-- Migration 063: admin seed, webhook safety, and interview cleanup indexes
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_recruitment_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_cycle_email
  ON recruitment_applications(cycle_id, documents_emailed, status);

CREATE INDEX IF NOT EXISTS idx_recruitment_recordings_application
  ON recruitment_interview_recordings(application_id);
