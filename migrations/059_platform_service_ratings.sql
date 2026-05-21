-- Verified RentalHub NG service ratings and live public fly-ins.

CREATE TABLE IF NOT EXISTS platform_rating_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  flyins_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  submissions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  show_user_images BOOLEAN NOT NULL DEFAULT FALSE,
  display_name_mode VARCHAR(30) NOT NULL DEFAULT 'first_name',
  flyin_frequency_seconds INTEGER NOT NULL DEFAULT 45,
  min_stars_for_public INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_platform_rating_display_mode
    CHECK (display_name_mode IN ('first_name', 'initials', 'role_location')),
  CONSTRAINT chk_platform_rating_frequency
    CHECK (flyin_frequency_seconds BETWEEN 15 AND 600),
  CONSTRAINT chk_platform_rating_min_stars
    CHECK (min_stars_for_public BETWEEN 1 AND 5)
);

INSERT INTO platform_rating_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_service_ratings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_role VARCHAR(40) NOT NULL,
  rating_context VARCHAR(60) NOT NULL,
  source_type VARCHAR(60) NOT NULL,
  source_ref VARCHAR(120) NOT NULL,
  source_title VARCHAR(240),
  state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
  state_name VARCHAR(120),
  lga_name VARCHAR(120),
  city VARCHAR(120),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  display_name_mode VARCHAR(30) NOT NULL DEFAULT 'first_name',
  allow_public_image BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_platform_service_rating_status
    CHECK (status IN ('pending', 'approved', 'hidden', 'rejected')),
  CONSTRAINT chk_platform_service_rating_display_mode
    CHECK (display_name_mode IN ('first_name', 'initials', 'role_location'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_service_ratings_unique_source
  ON platform_service_ratings (user_id, rating_context, source_type, source_ref);

CREATE INDEX IF NOT EXISTS idx_platform_service_ratings_public
  ON platform_service_ratings (status, stars, reviewed_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_service_ratings_location
  ON platform_service_ratings (state_id, lga_name, user_role, rating_context);

CREATE TABLE IF NOT EXISTS platform_rating_location_rules (
  id SERIAL PRIMARY KEY,
  state_id INTEGER REFERENCES states(id) ON DELETE CASCADE,
  state_name VARCHAR(120),
  lga_name VARCHAR(120),
  user_role VARCHAR(40),
  rating_context VARCHAR(60),
  submissions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  flyins_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_rating_location_rules_scope
  ON platform_rating_location_rules (state_id, lga_name, user_role, rating_context);
