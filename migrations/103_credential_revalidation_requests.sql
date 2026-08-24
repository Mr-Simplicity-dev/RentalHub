BEGIN;

CREATE TABLE IF NOT EXISTS credential_revalidation_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL,
  instructions TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'requested',
  due_at TIMESTAMP,
  baseline_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  pending_identity_value TEXT,
  pending_identity_hash VARCHAR(64),
  pending_identity_type VARCHAR(20),
  pending_nationality VARCHAR(80),
  verification_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  review_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_credential_revalidation_status
    CHECK (status IN ('requested', 'submitted', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT chk_credential_revalidation_identity_type
    CHECK (pending_identity_type IS NULL OR pending_identity_type IN ('nin', 'passport')),
  CONSTRAINT chk_credential_revalidation_fields_array
    CHECK (jsonb_typeof(requested_fields) = 'array'),
  CONSTRAINT chk_credential_revalidation_fields_allowed
    CHECK (requested_fields <@ '["nin", "international_passport", "live_photo"]'::jsonb)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credential_revalidation_one_active
  ON credential_revalidation_requests(user_id)
  WHERE status IN ('requested', 'submitted', 'rejected');

CREATE INDEX IF NOT EXISTS idx_credential_revalidation_user
  ON credential_revalidation_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credential_revalidation_status
  ON credential_revalidation_requests(status, created_at DESC);

COMMIT;
