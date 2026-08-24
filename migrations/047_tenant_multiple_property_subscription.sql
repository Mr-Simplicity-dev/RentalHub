-- Tenant add-on for renting more than one property.

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
      'tenant_multiple_property_subscription'
    )
  );

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_payment_type_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (
    payment_type IN (
      'tenant_subscription',
      'tenant_multiple_property_subscription',
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

ALTER TABLE admin_commissions
  DROP CONSTRAINT IF EXISTS admin_commissions_source_check;

ALTER TABLE admin_commissions
  ADD CONSTRAINT admin_commissions_source_check
  CHECK (
    source IN (
      'rent_payment',
      'tenant_subscription',
      'tenant_multiple_property_subscription',
      'landlord_subscription',
      'landlord_listing',
      'wallet_funding',
      'property_unlock',
      'withdrawal_fee',
      'performance_bonus',
      'lawyer_access_fee',
      'agent_access_fee'
    )
  );

CREATE TABLE IF NOT EXISTS tenant_multiple_property_subscriptions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  transaction_reference VARCHAR(120),
  amount NUMERIC(12,2) NOT NULL DEFAULT 5000,
  activated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_multiple_property_subscriptions_active
  ON tenant_multiple_property_subscriptions(tenant_id, expires_at);
