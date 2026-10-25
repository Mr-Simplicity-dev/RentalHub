ALTER TABLE tenant_property_alerts ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS whatsapp_consented_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS whatsapp_consent_version VARCHAR(50);
ALTER TABLE tenant_property_alert_payments ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS whatsapp_consented_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS whatsapp_consent_version VARCHAR(50);
CREATE TABLE IF NOT EXISTS property_alert_deliveries (
 id BIGSERIAL PRIMARY KEY, alert_id INTEGER NOT NULL REFERENCES tenant_property_alerts(id) ON DELETE CASCADE,
 channel VARCHAR(12) NOT NULL CHECK(channel IN ('email','whatsapp')), payload JSONB NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','retry','blocked','accepted','sent','delivered','read','failed','skipped','cancelled','uncertain')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 claim_token VARCHAR(64), lease_until TIMESTAMPTZ, correlation_token VARCHAR(80) NOT NULL UNIQUE,
 message_id VARCHAR(255), last_error VARCHAR(255), last_event_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(alert_id,channel)
);
CREATE INDEX IF NOT EXISTS property_alert_deliveries_due ON property_alert_deliveries(next_attempt_at) WHERE status IN ('pending','retry','blocked');
CREATE UNIQUE INDEX IF NOT EXISTS property_alert_deliveries_message_id ON property_alert_deliveries(message_id) WHERE message_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS property_alert_whatsapp_preferences (phone VARCHAR(20) PRIMARY KEY, opted_out BOOLEAN NOT NULL, event_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS property_alert_whatsapp_events (
 id BIGSERIAL PRIMARY KEY, message_id VARCHAR(255) NOT NULL, status VARCHAR(12) NOT NULL CHECK(status IN ('sent','delivered','read','failed')),
 correlation_token VARCHAR(80), event_at TIMESTAMPTZ NOT NULL, error_code INTEGER, processed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(message_id,status,event_at)
);
CREATE INDEX IF NOT EXISTS property_alert_whatsapp_events_pending ON property_alert_whatsapp_events(id) WHERE processed_at IS NULL;
