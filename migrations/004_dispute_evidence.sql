CREATE TABLE IF NOT EXISTS dispute_evidence (
  id SERIAL PRIMARY KEY,
  dispute_id INT REFERENCES disputes(id) ON DELETE CASCADE,
  uploaded_by INT REFERENCES users(id),
  file_name VARCHAR(255),
  file_path TEXT NOT NULL,
  mime_type VARCHAR(120),
  file_size BIGINT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute
ON dispute_evidence(dispute_id);