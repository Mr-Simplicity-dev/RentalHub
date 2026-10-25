ALTER TABLE recruitment_roles ADD COLUMN IF NOT EXISTS opportunity_type VARCHAR(20) DEFAULT 'employment';
UPDATE recruitment_roles SET opportunity_type='employment' WHERE opportunity_type IS NULL;
ALTER TABLE recruitment_settings ADD COLUMN IF NOT EXISTS volunteer_applications_enabled BOOLEAN DEFAULT FALSE;
INSERT INTO recruitment_settings (is_active, volunteer_applications_enabled) SELECT FALSE,FALSE WHERE NOT EXISTS (SELECT 1 FROM recruitment_settings);
UPDATE recruitment_settings SET volunteer_applications_enabled=COALESCE(volunteer_applications_enabled,FALSE);
CREATE INDEX IF NOT EXISTS idx_recruitment_roles_opportunity_type ON recruitment_roles(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_role_id ON recruitment_applications(role_id);
