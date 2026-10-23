-- 171: structured property features (three-state: true/false/null) with details
BEGIN;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS structured_features JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_properties_structured_features_gin
  ON properties USING GIN (structured_features);

COMMIT;
