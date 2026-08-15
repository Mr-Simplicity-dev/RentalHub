-- ============================================================
-- Recruitment interview consent
-- Migration 115: explicit applicant consent for video/audio
-- recording during the proctored interview (NDPR awareness).
-- ============================================================

ALTER TABLE recruitment_applications
  ADD COLUMN IF NOT EXISTS interview_consent_at TIMESTAMPTZ;
