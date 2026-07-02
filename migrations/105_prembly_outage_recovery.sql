BEGIN;

ALTER TABLE credential_revalidation_requests
  DROP CONSTRAINT IF EXISTS chk_credential_revalidation_status;

ALTER TABLE credential_revalidation_requests
  ADD CONSTRAINT chk_credential_revalidation_status
  CHECK (status IN (
    'requested',
    'provider_pending',
    'submitted',
    'approved',
    'rejected',
    'cancelled'
  ));

DROP INDEX IF EXISTS idx_credential_revalidation_one_active;

CREATE UNIQUE INDEX idx_credential_revalidation_one_active
  ON credential_revalidation_requests(user_id)
  WHERE status IN ('requested', 'provider_pending', 'submitted', 'rejected');

CREATE TABLE IF NOT EXISTS prembly_verification_attempts (
  id UUID PRIMARY KEY,
  callback_token UUID NOT NULL UNIQUE,
  context_type VARCHAR(40) NOT NULL,
  context_id BIGINT,
  request_key_hash VARCHAR(64) NOT NULL,
  subject_hash VARCHAR(64) NOT NULL,
  identity_type VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'initiating',
  provider_reference VARCHAR(255),
  response_code VARCHAR(20),
  verification_status VARCHAR(40),
  billing_status BOOLEAN,
  provider_message TEXT,
  post_attempts INTEGER NOT NULL DEFAULT 1,
  poll_attempts INTEGER NOT NULL DEFAULT 0,
  next_check_at TIMESTAMP,
  last_checked_at TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_prembly_attempt_context
    CHECK (context_type IN ('registration', 'credential_revalidation')),
  CONSTRAINT chk_prembly_attempt_identity
    CHECK (identity_type IN ('nin', 'passport')),
  CONSTRAINT chk_prembly_attempt_status
    CHECK (status IN (
      'initiating',
      'pending',
      'verified',
      'not_verified',
      'attention_required',
      'expired'
    )),
  CONSTRAINT chk_prembly_attempt_context_id
    CHECK (
      (context_type = 'registration' AND context_id IS NULL) OR
      (context_type = 'credential_revalidation' AND context_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prembly_registration_request
  ON prembly_verification_attempts(request_key_hash)
  WHERE context_type = 'registration' AND status <> 'expired';

CREATE UNIQUE INDEX IF NOT EXISTS idx_prembly_revalidation_active
  ON prembly_verification_attempts(context_type, context_id)
  WHERE context_type = 'credential_revalidation'
    AND status IN ('initiating', 'pending', 'attention_required');

CREATE UNIQUE INDEX IF NOT EXISTS idx_prembly_provider_reference
  ON prembly_verification_attempts(provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prembly_attempts_due
  ON prembly_verification_attempts(next_check_at)
  WHERE status IN ('pending', 'attention_required')
    AND provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS prembly_webhook_events (
  token VARCHAR(255) PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES prembly_verification_attempts(id) ON DELETE CASCADE,
  payload_hash VARCHAR(64) NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prembly_webhook_attempt
  ON prembly_webhook_events(attempt_id, received_at DESC);

COMMIT;
