BEGIN;

ALTER TABLE tenant_registration_payments
  ADD COLUMN IF NOT EXISTS ip_country VARCHAR(2),
  ADD COLUMN IF NOT EXISTS ip_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS foreign_card_adjustment_ngn INTEGER,
  ADD COLUMN IF NOT EXISTS foreign_card_adjustment_paid_at TIMESTAMP;

INSERT INTO app_settings (key, value)
VALUES
  ('black_market_usd_rate', '{"value":1600}'),
  ('foreign_card_conversion_fee_usd', '{"value":5}')
ON CONFLICT (key) DO NOTHING;

COMMIT;
