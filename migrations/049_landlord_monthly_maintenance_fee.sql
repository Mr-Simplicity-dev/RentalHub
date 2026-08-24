-- Monthly landlord maintenance fee: N100 per posted property.

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
      'landlord_monthly_maintenance_fee'
    )
  );

CREATE TABLE IF NOT EXISTS landlord_property_maintenance_fee_events (
  id SERIAL PRIMARY KEY,
  landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_at DATE NOT NULL,
  property_count INTEGER NOT NULL DEFAULT 0,
  amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  skip_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  agreed_at TIMESTAMP,
  paid_at TIMESTAMP,
  wallet_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
  rent_balance_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
  transaction_reference VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT landlord_property_maintenance_fee_status_check
    CHECK (status IN ('pending', 'insufficient', 'paid')),
  CONSTRAINT landlord_property_maintenance_fee_unique_due UNIQUE (landlord_id, due_at)
);

CREATE INDEX IF NOT EXISTS idx_landlord_property_maintenance_fee_events_lookup
  ON landlord_property_maintenance_fee_events(landlord_id, due_at DESC, status);

ALTER TABLE landlord_rent_deductions
  DROP CONSTRAINT IF EXISTS chk_landlord_rent_deduction_type;

ALTER TABLE landlord_rent_deductions
  ADD CONSTRAINT chk_landlord_rent_deduction_type
  CHECK (
    deduction_type IN (
      'subscription',
      'property_fee',
      'annual_listing_renewal',
      'monthly_maintenance'
    )
  );
