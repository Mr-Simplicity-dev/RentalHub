-- Tenant-requested tenancy grace periods and admin-enabled relocation refunds.

CREATE TABLE IF NOT EXISTS refund_requests (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(100) NOT NULL,
  details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  refunded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  landlord_note TEXT,
  refund_type VARCHAR(20) NOT NULL DEFAULT 'full',
  refund_months INTEGER,
  approved_amount NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS tenancy_adjustment_requests (
  id SERIAL PRIMARY KEY,
  request_type VARCHAR(30) NOT NULL DEFAULT 'grace_period',
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenancy_expires_at TIMESTAMP,
  requested_duration_days INTEGER,
  requested_duration_months INTEGER,
  approved_duration_days INTEGER,
  approved_duration_months INTEGER,
  tenant_note TEXT,
  landlord_note TEXT,
  admin_note TEXT,
  feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  enabled_at TIMESTAMP,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_admin_review',
  grace_ends_at TIMESTAMP,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  landlord_reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_tenancy_adjustment_request_type
    CHECK (request_type IN ('grace_period')),
  CONSTRAINT chk_tenancy_adjustment_status
    CHECK (status IN (
      'pending_admin_review',
      'enabled',
      'rejected',
      'landlord_approved',
      'landlord_rejected',
      'cancelled',
      'expired'
    ))
);

CREATE INDEX IF NOT EXISTS idx_tenancy_adjustments_tenant
  ON tenancy_adjustment_requests(tenant_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_adjustments_landlord
  ON tenancy_adjustment_requests(landlord_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_adjustments_property
  ON tenancy_adjustment_requests(property_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_adjustments_status
  ON tenancy_adjustment_requests(status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenancy_adjustments_one_active_grace
  ON tenancy_adjustment_requests(payment_id, tenant_id)
  WHERE request_type = 'grace_period'
    AND status IN ('pending_admin_review', 'enabled', 'landlord_approved');

ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS request_category VARCHAR(40) NOT NULL DEFAULT 'standard_refund',
  ADD COLUMN IF NOT EXISTS requested_move_out_date DATE,
  ADD COLUMN IF NOT EXISTS requested_refund_months INTEGER,
  ADD COLUMN IF NOT EXISTS requested_refund_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_due_days INTEGER,
  ADD COLUMN IF NOT EXISTS refund_due_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS feature_enabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS feature_enabled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

CREATE INDEX IF NOT EXISTS idx_refund_requests_feature_enabled
  ON refund_requests(request_category, feature_enabled, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_refund_requests_due_at
  ON refund_requests(refund_due_at)
  WHERE refund_due_at IS NOT NULL;
