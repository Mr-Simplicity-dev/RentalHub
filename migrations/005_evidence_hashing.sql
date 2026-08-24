ALTER TABLE dispute_evidence
ADD COLUMN IF NOT EXISTS file_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_evidence_hash
ON dispute_evidence(file_hash);