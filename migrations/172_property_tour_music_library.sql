-- 172: super admin property tour music library
BEGIN;

CREATE TABLE IF NOT EXISTS property_tour_music (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  file_url VARCHAR(1000) NOT NULL,
  file_public_id VARCHAR(255),
  file_type VARCHAR(30),
  file_size INTEGER,
  duration_seconds NUMERIC(8,2),
  mood VARCHAR(40),
  property_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0,
  auto_select BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  commercial_use_approved BOOLEAN NOT NULL DEFAULT FALSE,
  license_type VARCHAR(80),
  license_source VARCHAR(150),
  license_reference VARCHAR(150),
  license_expiry DATE,
  license_notes TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_property_tour_music_active
  ON property_tour_music(is_active, is_archived, auto_select, priority DESC);

CREATE TABLE IF NOT EXISTS property_tour_music_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  music_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_volume NUMERIC(4,2) NOT NULL DEFAULT 0.25,
  ducking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ducking_volume NUMERIC(4,2) NOT NULL DEFAULT 0.12,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_property_tour_music_settings_singleton CHECK (id = 1)
);

INSERT INTO property_tour_music_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;
