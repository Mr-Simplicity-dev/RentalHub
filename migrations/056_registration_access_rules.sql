-- Split registration flags and add location-based registration access rules

INSERT INTO feature_flags (key, enabled, description)
SELECT
  'allow_tenant_registration',
  enabled,
  'Allow new tenants to register.'
FROM feature_flags
WHERE key = 'allow_registration'
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, enabled, description)
SELECT
  'allow_landlord_registration',
  enabled,
  'Allow new landlords to register.'
FROM feature_flags
WHERE key = 'allow_registration'
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, enabled, description)
VALUES
  ('allow_tenant_registration', TRUE, 'Allow new tenants to register.'),
  ('allow_landlord_registration', TRUE, 'Allow new landlords to register.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS location_registration_access_rules (
  id SERIAL PRIMARY KEY,
  applies_to VARCHAR(20) NOT NULL CHECK (applies_to IN ('tenant', 'landlord')),
  state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  lga_name VARCHAR(120),
  location_key VARCHAR(160) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT location_registration_access_rules_scope_check CHECK (
    (location_key = '' AND lga_name IS NULL) OR
    (location_key <> '' AND lga_name IS NOT NULL)
  ),
  CONSTRAINT location_registration_access_rules_unique_scope UNIQUE (
    applies_to,
    state_id,
    location_key
  )
);

CREATE INDEX IF NOT EXISTS idx_location_registration_access_rules_lookup
  ON location_registration_access_rules(applies_to, state_id, location_key, is_active);
