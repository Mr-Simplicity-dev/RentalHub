-- 164: property ownership verification status
-- Tracks whether a landlord's legal authority to rent a property has been
-- verified before the listing is treated as fully verified.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ownership_verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified';
