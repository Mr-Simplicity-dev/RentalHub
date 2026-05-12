-- Persist the map pin selected during property creation so paid tenants can open
-- the property location in Google Maps from their dashboard.

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

CREATE INDEX IF NOT EXISTS idx_properties_coordinates
ON properties(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
