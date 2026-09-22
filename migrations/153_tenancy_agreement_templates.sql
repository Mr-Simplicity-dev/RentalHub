-- Tenancy agreement templates + legal review workflow.
--
-- Approved legal administrators manage jurisdiction-specific agreement
-- templates. Only APPROVED or ACTIVE templates may be used for production
-- execution. Ordinary landlords cannot edit core legal clauses.

CREATE TABLE IF NOT EXISTS tenancy_agreement_templates (
  id SERIAL PRIMARY KEY,
  jurisdiction_code VARCHAR(40) NOT NULL,
  jurisdiction_name VARCHAR(120) NOT NULL,
  state VARCHAR(80),
  name VARCHAR(200) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  effective_date DATE,
  retired_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_tenancy_template_status CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'RETIRED')),
  CONSTRAINT uq_tenancy_template_jurisdiction_version UNIQUE (jurisdiction_code, version)
);

CREATE INDEX IF NOT EXISTS idx_tenancy_templates_jurisdiction
  ON tenancy_agreement_templates(jurisdiction_code, status);
