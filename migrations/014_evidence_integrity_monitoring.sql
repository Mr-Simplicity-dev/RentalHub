CREATE TABLE IF NOT EXISTS evidence_integrity_monitor (
  evidence_id INTEGER PRIMARY KEY REFERENCES dispute_evidence(id) ON DELETE CASCADE,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  file_name VARCHAR(255),
  stored_hash VARCHAR(128),
  last_computed_hash VARCHAR(128),
  stored_merkle_root VARCHAR(255),
  last_computed_merkle_root VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  issue_type VARCHAR(50),
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  tamper_detected_at TIMESTAMP,
  last_status_change_at TIMESTAMP,
  last_checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evidence_integrity_monitor_dispute
  ON evidence_integrity_monitor(dispute_id);

CREATE INDEX IF NOT EXISTS idx_evidence_integrity_monitor_status
  ON evidence_integrity_monitor(status);

CREATE INDEX IF NOT EXISTS idx_evidence_integrity_monitor_checked
  ON evidence_integrity_monitor(last_checked_at DESC);
