BEGIN;

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS agent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS agent_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS agent_lga VARCHAR(120),
  ADD COLUMN IF NOT EXISTS agent_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resume_token VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_survey_responses_agent
  ON survey_responses(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_resume_token
  ON survey_responses(resume_token);

COMMIT;
