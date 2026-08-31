BEGIN;

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS respondent_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS respondent_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS respondent_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS respondent_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS respondent_state_of_origin VARCHAR(120),
  ADD COLUMN IF NOT EXISTS has_email BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_survey_responses_email
  ON survey_responses(respondent_email);
CREATE INDEX IF NOT EXISTS idx_survey_responses_phone
  ON survey_responses(respondent_phone);

COMMIT;
