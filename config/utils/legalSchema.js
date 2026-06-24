const db = require('../middleware/database');

let lawyerCaseNotesSchemaReady = false;
let evidenceIntegritySchemaReady = false;

const ensureLawyerCaseNotesSchema = async () => {
  if (lawyerCaseNotesSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS lawyer_case_notes (
      id SERIAL PRIMARY KEY,
      dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
      lawyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note_type VARCHAR(50) DEFAULT 'case_analysis',
      title VARCHAR(255),
      content TEXT NOT NULL,
      is_visible_to_client BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lawyer_case_notes_dispute
      ON lawyer_case_notes(dispute_id);

    CREATE INDEX IF NOT EXISTS idx_lawyer_case_notes_lawyer
      ON lawyer_case_notes(lawyer_user_id);

    CREATE INDEX IF NOT EXISTS idx_lawyer_case_notes_visible
      ON lawyer_case_notes(is_visible_to_client);

    ALTER TABLE disputes
    ADD COLUMN IF NOT EXISTS lawyer_summary TEXT,
    ADD COLUMN IF NOT EXISTS lawyer_summary_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS lawyer_summary_at TIMESTAMP;
  `);

  lawyerCaseNotesSchemaReady = true;
};

const ensureEvidenceIntegritySchema = async () => {
  if (evidenceIntegritySchemaReady) return;

  await db.query(`
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
  `);

  evidenceIntegritySchemaReady = true;
};

module.exports = {
  ensureLawyerCaseNotesSchema,
  ensureEvidenceIntegritySchema,
};
