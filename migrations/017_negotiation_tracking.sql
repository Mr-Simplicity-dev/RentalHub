-- Add negotiation tracking to properties table
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS is_negotiated_rent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_negotiation_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_negotiated_by INTEGER REFERENCES users(id);

-- Add index for finding negotiated properties
CREATE INDEX IF NOT EXISTS idx_properties_negotiated_rent
  ON properties(is_negotiated_rent, last_negotiation_date DESC);

-- Application notes field to track things like "Price updated from X to Y via negotiation"
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS internal_notes TEXT;
