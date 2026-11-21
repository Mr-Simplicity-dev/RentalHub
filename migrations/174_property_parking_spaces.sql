-- Add numeric parking_spaces column to properties and backfill from structured_features/amenities
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS parking_spaces INTEGER NOT NULL DEFAULT 0;

UPDATE properties
SET parking_spaces = CASE
  WHEN (structured_features -> 'parking' -> 'details' ->> 'capacity') ~ '^[0-9]+$'
    THEN LEAST(100, GREATEST(0, (structured_features -> 'parking' -> 'details' ->> 'capacity')::INTEGER))
  WHEN COALESCE(structured_features -> 'parking' ->> 'available', '') = 'true'
    OR COALESCE(structured_features -> 'covered_parking' ->> 'available', '') = 'true'
    THEN 1
  WHEN amenities IS NOT NULL AND amenities::text ~* '(parking|garage|car[[:space:]]*park)'
    THEN 1
  ELSE 0
END
WHERE parking_spaces = 0;
