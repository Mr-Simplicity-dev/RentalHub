BEGIN;

-- =============================================================
-- Onboarding market-research survey (tenant + landlord)
-- =============================================================

CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  survey_type VARCHAR(20) NOT NULL CHECK (survey_type IN ('tenant', 'landlord')),
  survey_version INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  respondent_code VARCHAR(40) NOT NULL UNIQUE,
  source VARCHAR(20) NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'paper_entry', 'public_link')),
  admin_mode VARCHAR(20),
  admin_date DATE,
  state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
  lga_name VARCHAR(120),
  consent_flags JSONB DEFAULT '{}'::jsonb,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  part_a_completed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_user
  ON survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_type_completed
  ON survey_responses(survey_type, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_responses_source
  ON survey_responses(source);
CREATE INDEX IF NOT EXISTS idx_survey_responses_state
  ON survey_responses(state_id);

-- Gate state on the users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS survey_part_a_completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS survey_completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS survey_exempt BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
