BEGIN;
-- The owner requested a fresh round after correcting the paper questionnaire.
-- Superseded rows remain in the database for history and are excluded from active reports.
UPDATE survey_responses SET superseded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
WHERE superseded_at IS NULL AND survey_version<3;
UPDATE users u SET
 survey_part_a_completed_at=(SELECT MAX(s.part_a_completed_at) FROM survey_responses s WHERE s.user_id=u.id AND s.survey_version=3 AND s.superseded_at IS NULL),
 survey_completed_at=(SELECT MAX(s.completed_at) FROM survey_responses s WHERE s.user_id=u.id AND s.survey_version=3 AND s.superseded_at IS NULL),
 survey_exempt=FALSE
WHERE u.user_type IN ('tenant','landlord');
COMMIT;
