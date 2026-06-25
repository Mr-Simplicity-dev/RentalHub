-- Tenant-paid RentalHub NG property inspection requests.

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
      'tenant_multiple_property_subscription',
      'landlord_subscription',
      'landlord_listing',
      'rent_payment',
      'property_unlock',
      'property_inspection_fee',
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

CREATE TABLE IF NOT EXISTS property_inspection_requests (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 10000,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
  tenant_note TEXT,
  inspection_summary TEXT,
  assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT property_inspection_requests_status_check
    CHECK (status IN ('pending_payment', 'paid', 'assigned', 'inspecting', 'completed', 'cancelled'))
);

ALTER TABLE property_inspection_requests
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS inspection_report_url TEXT,
  ADD COLUMN IF NOT EXISTS inspection_proof_urls JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS inspection_findings JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

CREATE TABLE IF NOT EXISTS property_inspection_operations (
  id SERIAL PRIMARY KEY,
  inspection_id INTEGER NOT NULL REFERENCES property_inspection_requests(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  proof_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_inspection_requests_application
  ON property_inspection_requests(application_id);

CREATE INDEX IF NOT EXISTS idx_property_inspection_requests_tenant
  ON property_inspection_requests(tenant_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_inspection_requests_property
  ON property_inspection_requests(property_id);

CREATE INDEX IF NOT EXISTS idx_property_inspection_operations_request
  ON property_inspection_operations(inspection_id, created_at DESC);
