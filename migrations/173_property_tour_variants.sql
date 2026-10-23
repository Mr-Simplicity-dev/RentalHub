-- 173: tour aspect-ratio variants and structured feature search index
BEGIN;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS video_variants JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_properties_structured_features
  ON properties USING GIN (structured_features);

COMMIT;
