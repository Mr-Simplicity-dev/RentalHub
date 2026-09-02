BEGIN;

-- Survey gate: exact state+LGA list (name-based, admin-configured).
-- Old lat/lng circles are replaced by explicit {state_name, lga_name} rows.
UPDATE app_settings
SET value = '{"value":"lga_list"}', updated_at = CURRENT_TIMESTAMP
WHERE key = 'survey_allowed_scope';

UPDATE app_settings
SET value = '{"value":"[{\"state_name\":\"Federal Capital Territory\",\"lga_name\":\"Gwagwalada\"}]"}', updated_at = CURRENT_TIMESTAMP
WHERE key = 'survey_allowed_locations';

COMMIT;
