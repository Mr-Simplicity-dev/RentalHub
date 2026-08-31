-- Audio ads for the voice hold loop ("voice_hold" placement).
-- Also adds a per-call impression dedupe so repeated waitUrl fetches for the
-- same caller never double-count an impression.

ALTER TABLE ad_spaces
  ADD COLUMN IF NOT EXISTS audio_url VARCHAR(1000);

-- Extend media_type to allow 'audio'.
ALTER TABLE ad_spaces
  DROP CONSTRAINT IF EXISTS chk_ad_spaces_media_type;

ALTER TABLE ad_spaces
  ADD CONSTRAINT chk_ad_spaces_media_type
  CHECK (media_type IN ('image', 'video', 'audio'));

-- Extend placements with the voice hold slot.
ALTER TABLE ad_spaces
  DROP CONSTRAINT IF EXISTS chk_ad_spaces_placement;

ALTER TABLE ad_spaces
  ADD CONSTRAINT chk_ad_spaces_placement
  CHECK (placement IN (
    'home_top', 'home_featured', 'dashboard_top', 'dashboard_inline',
    'properties_top', 'properties_inline', 'voice_hold'
  ));

CREATE TABLE IF NOT EXISTS voice_ad_impressions (
  id BIGSERIAL PRIMARY KEY,
  ad_id INTEGER NOT NULL REFERENCES ad_spaces(id) ON DELETE CASCADE,
  call_sid VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT voice_ad_impressions_unique UNIQUE (ad_id, call_sid)
);

CREATE INDEX IF NOT EXISTS idx_voice_ad_impressions_created
  ON voice_ad_impressions(created_at DESC);
