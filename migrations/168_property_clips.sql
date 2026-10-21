-- Property clips: short live-camera video clips a landlord records while
-- standing in the property. They are slow-motioned into the automatic tour
-- video so the advert moves, not just pans.
--
-- Kept separate from properties.video_url (the landlord's own single uploaded
-- video) so the generated tour never overwrites a real video.

CREATE TABLE IF NOT EXISTS property_clips (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  clip_url VARCHAR(1000) NOT NULL,
  clip_order INTEGER NOT NULL DEFAULT 0,
  shot_key VARCHAR(60),
  duration_seconds NUMERIC(6,2),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_property_clips_property
  ON property_clips(property_id, clip_order ASC, id ASC);
