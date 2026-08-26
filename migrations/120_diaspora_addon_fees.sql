BEGIN;

INSERT INTO app_settings (key, value) VALUES
  ('diaspora_lawyer_fee_usd', '{"value": 15}'::jsonb),
  ('diaspora_agent_fee_usd', '{"value": 15}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
