-- Paid cross-location property browsing for tenants.

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
      'landlord_monthly_subscription'
    )
  );

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_payment_type_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (
    payment_type IN (
      'tenant_subscription',
      'landlord_subscription',
      'landlord_listing',
      'rent_payment',
      'property_unlock',
      'general_platform_fee',
      'registration_fee',
      'wallet_funding',
      'tenant_property_alert',
      'tenant_location_access',
      'evidence_verification',
      'lawyer_directory_unlock',
      'lawyer_access_fee',
      'agent_access_fee',
      'transportation_booking'
    )
  );

CREATE TABLE IF NOT EXISTS tenant_location_access_payments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  state_name VARCHAR(120),
  lga_name VARCHAR(120),
  location_key VARCHAR(160) NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  transaction_reference VARCHAR(120) NOT NULL UNIQUE,
  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  gateway_response JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_location_access_payments_reference
  ON tenant_location_access_payments(transaction_reference);

CREATE TABLE IF NOT EXISTS tenant_location_access_grants (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  state_name VARCHAR(120),
  lga_name VARCHAR(120),
  location_key VARCHAR(160) NOT NULL DEFAULT '',
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  transaction_reference VARCHAR(120),
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE (tenant_id, state_id, location_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_location_access_grants_lookup
  ON tenant_location_access_grants(tenant_id, state_id, location_key, expires_at);
