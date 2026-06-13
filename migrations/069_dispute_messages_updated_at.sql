ALTER TABLE dispute_messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute
  ON dispute_messages(dispute_id);
