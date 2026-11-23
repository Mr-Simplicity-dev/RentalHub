BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE recruitment_location_activation ADD COLUMN IF NOT EXISTS volunteer_is_active BOOLEAN NOT NULL DEFAULT FALSE;
INSERT INTO recruitment_location_activation(state_name,lga_name,is_active,volunteer_is_active) VALUES
('Abuja','Abaji',FALSE,TRUE),
('Abuja','Bwari',FALSE,TRUE),
('Abuja','Gwagwalada',FALSE,TRUE),
('Abuja','Kuje',FALSE,TRUE),
('Abuja','Kwali',FALSE,TRUE),
('Abuja','Municipal Area Council',FALSE,TRUE)
ON CONFLICT(state_name,lga_name) DO UPDATE SET volunteer_is_active=TRUE;
COMMIT;
