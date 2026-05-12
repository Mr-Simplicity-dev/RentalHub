-- Tenant property request support review and state admin sourcing workflow.

ALTER TABLE tenant_property_alerts
  ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(40) NOT NULL DEFAULT 'pending_support_review',
  ADD COLUMN IF NOT EXISTS support_note TEXT,
  ADD COLUMN IF NOT EXISTS support_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS assigned_state_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS state_admin_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS state_admin_note TEXT,
  ADD COLUMN IF NOT EXISTS state_admin_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS state_admin_updated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS lga_coverage_missing_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP;

UPDATE tenant_property_alerts
SET workflow_status = 'approved_assigned'
WHERE workflow_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_alerts_workflow
  ON tenant_property_alerts(workflow_status, state_id, lga_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_alerts_assigned_admin
  ON tenant_property_alerts(assigned_state_admin_id, workflow_status);
