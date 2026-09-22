-- Tenancy agreement lifecycle (landlord <-> tenant).
--
-- A property application is NOT itself a tenancy. Approving an application
-- creates a DRAFT agreement which must be reviewed and electronically
-- executed by both parties before the tenancy is considered executed.
--
-- Tables:
--   tenancy_agreements           - one row per agreement (parties + current status)
--   tenancy_agreement_versions   - immutable versioned snapshot of the terms
--   tenancy_agreement_signatures - electronic signature events
--   tenancy_agreement_events     - lifecycle audit trail

CREATE TABLE IF NOT EXISTS tenancy_agreements (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP,
  CONSTRAINT chk_tenancy_agreement_status CHECK (status IN (
    'DRAFT',
    'PENDING_LANDLORD_REVIEW',
    'PENDING_LANDLORD_SIGNATURE',
    'PENDING_TENANT_REVIEW',
    'PENDING_TENANT_SIGNATURE',
    'PARTIALLY_EXECUTED',
    'FULLY_EXECUTED',
    'DECLINED',
    'CANCELLED',
    'EXPIRED',
    'AMENDED',
    'SUPERSEDED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_tenancy_agreements_landlord ON tenancy_agreements(landlord_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_agreements_tenant ON tenancy_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_agreements_property ON tenancy_agreements(property_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_agreements_status ON tenancy_agreements(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenancy_agreements_application ON tenancy_agreements(application_id);

CREATE TABLE IF NOT EXISTS tenancy_agreement_versions (
  id SERIAL PRIMARY KEY,
  agreement_id INTEGER NOT NULL REFERENCES tenancy_agreements(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_hash VARCHAR(128),
  document_path VARCHAR(500),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMP,
  UNIQUE (agreement_id, version)
);

CREATE INDEX IF NOT EXISTS idx_tenancy_agreement_versions_agreement
  ON tenancy_agreement_versions(agreement_id);

CREATE TABLE IF NOT EXISTS tenancy_agreement_signatures (
  id SERIAL PRIMARY KEY,
  agreement_id INTEGER NOT NULL REFERENCES tenancy_agreements(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  signer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signer_role VARCHAR(20) NOT NULL,
  signatory_name VARCHAR(200) NOT NULL,
  signature_event_id VARCHAR(64) NOT NULL,
  authentication_method VARCHAR(40),
  document_hash VARCHAR(128),
  ip_address VARCHAR(64),
  user_agent TEXT,
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_tenancy_signature_role CHECK (signer_role IN ('landlord', 'tenant', 'witness')),
  CONSTRAINT uq_tenancy_signature UNIQUE (agreement_id, version, signer_role, signer_id)
);

CREATE INDEX IF NOT EXISTS idx_tenancy_agreement_signatures_agreement
  ON tenancy_agreement_signatures(agreement_id, version);

CREATE TABLE IF NOT EXISTS tenancy_agreement_events (
  id SERIAL PRIMARY KEY,
  agreement_id INTEGER NOT NULL REFERENCES tenancy_agreements(id) ON DELETE CASCADE,
  version INTEGER,
  event_type VARCHAR(60) NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenancy_agreement_events_agreement
  ON tenancy_agreement_events(agreement_id, created_at DESC);
