ALTER TABLE disputes
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_disputes_property
ON disputes(property_id);

CREATE INDEX IF NOT EXISTS idx_disputes_status
ON disputes(status);

CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute
ON dispute_messages(dispute_id);