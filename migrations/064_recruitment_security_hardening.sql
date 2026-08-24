-- ============================================================
-- Recruitment security hardening
-- Migration 064: payment idempotency, SMS status, and interview timing
-- ============================================================

ALTER TABLE recruitment_applications
  ADD COLUMN IF NOT EXISTS payment_gateway_payload JSONB,
  ADD COLUMN IF NOT EXISTS payment_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_code_email_last_error TEXT,
  ADD COLUMN IF NOT EXISTS access_code_sms_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS access_code_sms_delivery_attempt_id INTEGER,
  ADD COLUMN IF NOT EXISTS access_code_sms_last_error TEXT,
  ADD COLUMN IF NOT EXISTS interview_fingerprint VARCHAR(300),
  ADD COLUMN IF NOT EXISTS interview_user_agent VARCHAR(500),
  ADD COLUMN IF NOT EXISTS interview_challenge_token VARCHAR(128),
  ADD COLUMN IF NOT EXISTS interview_last_ping_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_security_log TEXT;

ALTER TABLE recruitment_interview_assignments
  ADD COLUMN IF NOT EXISTS answer_elapsed_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS timing_violation BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_payment_reference_pending
  ON recruitment_applications(payment_reference, payment_status)
  WHERE payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_interview_active
  ON recruitment_applications(user_id, interview_completed, interview_started_at)
  WHERE interview_started_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recruitment_assignments_unanswered
  ON recruitment_interview_assignments(application_id, question_order)
  WHERE answered_at IS NULL;
