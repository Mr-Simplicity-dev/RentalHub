-- Survey hardening: unique live draft tokens + idempotent submissions.
--
-- 1) Only ONE live (uncompleted, non-superseded) draft may exist per resume
--    token. Existing duplicates are superseded (newest kept) before the
--    partial unique index is created, or the index creation would fail.
-- 2) A client_request_id column makes a re-sent submission idempotent: the
--    same attempt never creates two completed rows.

-- Supersede any older live drafts sharing a resume token (keep the newest).
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY resume_token ORDER BY id DESC) AS rn
  FROM survey_responses
  WHERE resume_token IS NOT NULL
    AND completed_at IS NULL
    AND superseded_at IS NULL
)
UPDATE survey_responses s
SET superseded_at = COALESCE(s.superseded_at, s.created_at),
    updated_at = CURRENT_TIMESTAMP
FROM ranked
WHERE ranked.rn > 1
  AND s.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_responses_live_token
  ON survey_responses(resume_token)
  WHERE resume_token IS NOT NULL
    AND completed_at IS NULL
    AND superseded_at IS NULL;

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_responses_client_request
  ON survey_responses(client_request_id)
  WHERE client_request_id IS NOT NULL
    AND superseded_at IS NULL;
