BEGIN;

INSERT INTO app_settings (key, value)
VALUES
  ('survey_allowed_scope', '{"value":"nigeria"}'),
  ('survey_allowed_locations', '{"value":"[{\"label\":\"FCT Abuja (Gwagwalada)\",\"lat\":8.9491,\"lng\":7.0802,\"radius_km\":30},{\"label\":\"Lagos (Ikeja)\",\"lat\":6.6018,\"lng\":3.3515,\"radius_km\":30},{\"label\":\"Kano\",\"lat\":12.0022,\"lng\":8.5920,\"radius_km\":30}]"}')
ON CONFLICT (key) DO NOTHING;

COMMIT;
