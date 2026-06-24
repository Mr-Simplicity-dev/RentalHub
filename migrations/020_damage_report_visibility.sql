-- Add damage report visibility and status fields
-- Allows landlords/admins to control which reports are shown to tenants

CREATE TABLE IF NOT EXISTS property_damage_reports (
  id              SERIAL PRIMARY KEY,
  property_id     INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  landlord_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_location   VARCHAR(100),
  damage_type     VARCHAR(50),
  description     TEXT,
  width_cm        NUMERIC(8,2),
  height_cm       NUMERIC(8,2),
  depth_level     VARCHAR(20),
  severity        VARCHAR(20),
  photo_urls      JSONB DEFAULT '[]',
  ai_analysis     JSONB,
  reported_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE property_damage_reports
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
-- Status: 'draft' (internal only), 'published' (visible to tenants)
ADD COLUMN IF NOT EXISTS is_visible_to_tenant BOOLEAN DEFAULT FALSE,
-- Legacy field for visibility control
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS published_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS report_title VARCHAR(255),
ADD COLUMN IF NOT EXISTS urgency VARCHAR(20),
-- 'low', 'medium', 'high'
ADD COLUMN IF NOT EXISTS recommendation TEXT,
ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index for finding published reports
CREATE INDEX IF NOT EXISTS idx_damage_reports_property_published
  ON property_damage_reports(property_id, status)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_damage_reports_property_date
  ON property_damage_reports(property_id, published_at DESC)
  WHERE status = 'published';

-- Create constraint for valid statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'property_damage_reports' AND constraint_name = 'chk_damage_status'
  ) THEN
    ALTER TABLE property_damage_reports
    ADD CONSTRAINT chk_damage_status CHECK (status IN ('draft', 'published'));
  END IF;
END $$;
