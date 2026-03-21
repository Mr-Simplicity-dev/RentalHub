-- Add evidence verification tracking columns to dispute_evidence
ALTER TABLE dispute_evidence
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS lawyer_notes TEXT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_verification_status
ON dispute_evidence(verification_status);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_verified_by
ON dispute_evidence(verified_by);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_verified_at
ON dispute_evidence(verified_at);
