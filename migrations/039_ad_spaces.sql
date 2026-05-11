-- Super admin controlled ad spaces for public banner placements.

CREATE TABLE IF NOT EXISTS ad_spaces (
    id SERIAL PRIMARY KEY,
    placement VARCHAR(80) NOT NULL DEFAULT 'home_top',
    title VARCHAR(160) NOT NULL,
    description TEXT,
    sponsor_name VARCHAR(160),
    image_url VARCHAR(1000),
    target_url VARCHAR(1000),
    cta_label VARCHAR(80),
    background_color VARCHAR(20) DEFAULT '#ffffff',
    text_color VARCHAR(20) DEFAULT '#111827',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    impression_count INTEGER NOT NULL DEFAULT 0,
    click_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ad_spaces_placement
        CHECK (placement IN ('home_top', 'home_featured', 'dashboard_top', 'dashboard_inline', 'properties_top', 'properties_inline')),
    CONSTRAINT chk_ad_spaces_schedule
        CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_ad_spaces_public
    ON ad_spaces (placement, is_active, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_spaces_schedule
    ON ad_spaces (starts_at, ends_at);

CREATE TABLE IF NOT EXISTS feature_flags (
    key VARCHAR(100) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO feature_flags (key, enabled, description)
VALUES ('ads_enabled', TRUE, 'Show Super Admin managed ads on Home, Dashboard, and Properties pages.')
ON CONFLICT (key)
DO UPDATE SET description = EXCLUDED.description;
