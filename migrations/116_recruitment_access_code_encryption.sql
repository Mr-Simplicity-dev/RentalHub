-- ============================================================
-- Recruitment access code encryption at rest
-- Migration 116: access codes are no longer stored as plaintext.
-- The encrypted value is AES-256-GCM (v1:<iv>:<tag>:<cipher>)
-- using RECRUITMENT_ACCESS_CODE_KEY (64 hex chars).
-- ============================================================

ALTER TABLE recruitment_applications
  ADD COLUMN IF NOT EXISTS access_code_encrypted TEXT;
