BEGIN;

-- ── Diaspora registration tier & identity evidence on users ────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_tier VARCHAR(10) NOT NULL DEFAULT 'local'
    CHECK (registration_tier IN ('local', 'diaspora')),
  ADD COLUMN IF NOT EXISTS passport_issuing_country VARCHAR(80),
  ADD COLUMN IF NOT EXISTS diaspora_country VARCHAR(80),
  ADD COLUMN IF NOT EXISTS billing_country VARCHAR(10),
  ADD COLUMN IF NOT EXISTS card_brand VARCHAR(30);

-- ── Registration payment record: USD quote, FX and card evidence ───────────
ALTER TABLE tenant_registration_payments
  ADD COLUMN IF NOT EXISTS registration_tier VARCHAR(10) DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS target_state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_currency VARCHAR(3) DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS quote_amount_usd DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(14,6),
  ADD COLUMN IF NOT EXISTS fx_markup_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS amount_ngn DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS passport_issuing_country VARCHAR(80),
  ADD COLUMN IF NOT EXISTS billing_country VARCHAR(10),
  ADD COLUMN IF NOT EXISTS card_brand VARCHAR(30);

-- ── Location pricing rules: currency + diaspora targets ────────────────────
ALTER TABLE location_pricing_rules
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'NGN';

ALTER TABLE location_pricing_rules
  DROP CONSTRAINT IF EXISTS location_pricing_rules_applies_to_check;

ALTER TABLE location_pricing_rules
  ADD CONSTRAINT location_pricing_rules_applies_to_check
  CHECK (
    applies_to IN (
      'tenant_registration',
      'landlord_registration',
      'property_alert_request',
      'tenant_location_access',
      'tenant_monthly_subscription',
      'landlord_monthly_subscription',
      'tenant_multiple_property_subscription',
      'landlord_annual_listing_renewal_fee',
      'landlord_monthly_maintenance_fee',
      'tenant_registration_diaspora',
      'landlord_registration_diaspora'
    )
  );

-- ── Mineral state classification (Super Admin toggles) ─────────────────────
ALTER TABLE states
  ADD COLUMN IF NOT EXISTS is_mineral_state BOOLEAN NOT NULL DEFAULT FALSE;

-- Oil & gas producers
UPDATE states SET is_mineral_state = TRUE WHERE state_name IN (
  'Abia', 'Akwa Ibom', 'Anambra', 'Bayelsa', 'Delta', 'Edo', 'Imo',
  'Lagos', 'Ondo', 'Rivers'
);

-- Major solid-mineral producers
UPDATE states SET is_mineral_state = TRUE WHERE state_name IN (
  'Adamawa', 'Bauchi', 'Benue', 'Cross River', 'Ebonyi', 'Ekiti', 'Enugu',
  'Federal Capital Territory', 'Gombe', 'Kaduna', 'Kebbi', 'Kogi', 'Kwara',
  'Nasarawa', 'Niger', 'Ogun', 'Osun', 'Plateau', 'Sokoto', 'Taraba', 'Zamfara'
);

-- ── FX rate cache (USD → NGN) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_rates (
  currency_from VARCHAR(3) NOT NULL,
  currency_to VARCHAR(3) NOT NULL,
  rate DECIMAL(18,6) NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'manual',
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (currency_from, currency_to)
);

-- ── App settings (diaspora fee configuration) ──────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(80) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_settings (key, value) VALUES
  ('diaspora_base_fee_usd', '{"value": 12.85}'::jsonb),
  ('diaspora_fx_markup_pct', '{"value": 2}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
