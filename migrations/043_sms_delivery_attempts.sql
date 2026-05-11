-- Track SMS provider delivery state so OTP messages can fail over after acceptance.

CREATE TABLE IF NOT EXISTS sms_delivery_attempts (
    id SERIAL PRIMARY KEY,
    delivery_group_id VARCHAR(64) NOT NULL,
    purpose VARCHAR(80) NOT NULL DEFAULT 'sms',
    phone_number VARCHAR(32) NOT NULL,
    message TEXT NOT NULL,
    verification_code VARCHAR(20),
    provider VARCHAR(30) NOT NULL,
    provider_order INTEGER NOT NULL DEFAULT 1,
    provider_message_id VARCHAR(160),
    provider_status VARCHAR(120),
    normalized_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    provider_response JSONB,
    last_error TEXT,
    fallback_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    fallback_of INTEGER REFERENCES sms_delivery_attempts(id) ON DELETE SET NULL,
    fallback_reason TEXT,
    expires_at TIMESTAMP NOT NULL,
    status_received_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_attempts_group
    ON sms_delivery_attempts (delivery_group_id, id);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_attempts_provider_message
    ON sms_delivery_attempts (provider, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_delivery_attempts_pending
    ON sms_delivery_attempts (normalized_status, fallback_triggered, expires_at, created_at);
