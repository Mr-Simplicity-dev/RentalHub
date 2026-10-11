-- 165: property ownership document upload
-- Landlords attach proof of ownership/authority so admins can verify before a
-- listing is treated as ownership-verified.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ownership_document_url VARCHAR(500);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ownership_document_uploaded_at TIMESTAMPTZ;
