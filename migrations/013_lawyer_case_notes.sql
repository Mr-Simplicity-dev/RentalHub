-- Create lawyer case notes table
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

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_lawyer_case_notes_dispute
  ON lawyer_case_notes(dispute_id);

CREATE INDEX IF NOT EXISTS idx_lawyer_case_notes_lawyer
  ON lawyer_case_notes(lawyer_user_id);

CREATE INDEX IF NOT EXISTS idx_lawyer_case_notes_visible
  ON lawyer_case_notes(is_visible_to_client);

-- Add column to disputes table for lawyer summary
ALTER TABLE disputes
ADD COLUMN IF NOT EXISTS lawyer_summary TEXT,
ADD COLUMN IF NOT EXISTS lawyer_summary_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS lawyer_summary_at TIMESTAMP;