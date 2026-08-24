CREATE TABLE IF NOT EXISTS admin_appeals (
  id SERIAL PRIMARY KEY,
  appeal_type VARCHAR(20) NOT NULL CHECK (appeal_type IN ('property', 'verification')),
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  appellant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_decision_maker_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  original_rejection_reason TEXT,
  appeal_reason TEXT NOT NULL,
  additional_info TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'upheld', 'dismissed')),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_appeals_status ON admin_appeals(status);
CREATE INDEX IF NOT EXISTS idx_admin_appeals_type ON admin_appeals(appeal_type);
CREATE INDEX IF NOT EXISTS idx_admin_appeals_appellant ON admin_appeals(appellant_id);
CREATE INDEX IF NOT EXISTS idx_admin_appeals_property ON admin_appeals(property_id) WHERE property_id IS NOT NULL;
