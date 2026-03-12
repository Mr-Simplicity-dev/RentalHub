BEGIN;

CREATE TABLE IF NOT EXISTS tenant_registration_payments (
  id SERIAL PRIMARY KEY,
  user_type VARCHAR(20) NOT NULL DEFAULT 'tenant',
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 2500,
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'paystack',
  transaction_reference VARCHAR(255) NOT NULL UNIQUE,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  registration_payload JSONB NOT NULL,
  verification_meta JSONB,
  gateway_response JSONB,
  registered_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

ALTER TABLE tenant_registration_payments
  ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) NOT NULL DEFAULT 'tenant';

CREATE INDEX IF NOT EXISTS idx_tenant_registration_payments_reference
  ON tenant_registration_payments(transaction_reference);

CREATE INDEX IF NOT EXISTS idx_tenant_registration_payments_email
  ON tenant_registration_payments(email);

DO $$
DECLARE
  existing_check_name TEXT;
BEGIN
  SELECT c.conname
    INTO existing_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'payments'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%payment_type%';

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', existing_check_name);
  END IF;
END $$;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (
    payment_type IN (
      'tenant_subscription',
      'landlord_listing',
      'rent_payment',
      'property_unlock',
      'general_platform_fee'
    )
  );

COMMIT;
