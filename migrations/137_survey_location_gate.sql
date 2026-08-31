BEGIN;

INSERT INTO app_settings (key, value, description)
VALUES
  ('survey_allowed_scope', 'nigeria', 'survey location gate scope: "nigeria" (anywhere in Nigeria) or "locations" (only listed places)'),
  ('survey_allowed_locations', '[{"label":"FCT Abuja (Gwagwalada)","lat":8.9491,"lng":7.0802,"radius_km":30},{"label":"Lagos (Ikeja)","lat":6.6018,"lng":3.3515,"radius_km":30},{"label":"Kano","lat":12.0022,"lng":8.5920,"radius_km":30}]', 'allowed survey locations when scope is "locations"')
ON CONFLICT (key) DO NOTHING;

COMMIT;
