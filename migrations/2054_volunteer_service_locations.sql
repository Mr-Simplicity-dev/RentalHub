BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE recruitment_roles ADD COLUMN IF NOT EXISTS service_state VARCHAR(100);
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS preferred_service_state VARCHAR(100), ADD COLUMN IF NOT EXISTS preferred_service_lga VARCHAR(255);
INSERT INTO recruitment_roles(title,type,description,application_fee,premium_fee,cycle_id,opportunity_type,is_active,service_state)
SELECT 'Volunteer LGA Admin — FCT','Administrative','Unpaid volunteer opportunity: LGA Admin for the FCT campaign. Choose any of the six FCT area councils as your preferred place to serve. Your residence may be elsewhere.

Support approved lga admin activities under supervision. Tell us your skills, language levels and availability. No formal degree is required. Applying is free and does not create an admin or agent account, grant authority, guarantee selection, employment or salary. Our team reviews applications and contacts selected applicants. Any later appointment, duties and access require separate approval.',0,0,c.id,'volunteer',TRUE,'FCT'
FROM recruitment_cycles c WHERE c.is_active=TRUE AND c.open_date<=CURRENT_DATE AND COALESCE(c.extension_date,c.close_date)>=CURRENT_DATE
AND NOT EXISTS(SELECT 1 FROM recruitment_roles r WHERE r.cycle_id=c.id AND r.opportunity_type='volunteer' AND LOWER(TRIM(r.title))=LOWER('Volunteer LGA Admin — FCT'));
INSERT INTO recruitment_roles(title,type,description,application_fee,premium_fee,cycle_id,opportunity_type,is_active,service_state)
SELECT 'Volunteer Marketing Agent — FCT','Administrative','Unpaid volunteer opportunity: Marketing Agent for the FCT campaign. Choose any of the six FCT area councils as your preferred place to serve. Your residence may be elsewhere.

Support approved marketing agent activities under supervision. Tell us your skills, language levels and availability. No formal degree is required. Applying is free and does not create an admin or agent account, grant authority, guarantee selection, employment or salary. Our team reviews applications and contacts selected applicants. Any later appointment, duties and access require separate approval.',0,0,c.id,'volunteer',TRUE,'FCT'
FROM recruitment_cycles c WHERE c.is_active=TRUE AND c.open_date<=CURRENT_DATE AND COALESCE(c.extension_date,c.close_date)>=CURRENT_DATE
AND NOT EXISTS(SELECT 1 FROM recruitment_roles r WHERE r.cycle_id=c.id AND r.opportunity_type='volunteer' AND LOWER(TRIM(r.title))=LOWER('Volunteer Marketing Agent — FCT'));
INSERT INTO recruitment_roles(title,type,description,application_fee,premium_fee,cycle_id,opportunity_type,is_active,service_state)
SELECT 'Volunteer Transport Admin — FCT','Technical','Unpaid volunteer opportunity: Transport Admin for the FCT campaign. Choose any of the six FCT area councils as your preferred place to serve. Your residence may be elsewhere.

Support approved transport admin activities under supervision. Tell us your skills, language levels and availability. No formal degree is required. Applying is free and does not create an admin or agent account, grant authority, guarantee selection, employment or salary. Our team reviews applications and contacts selected applicants. Any later appointment, duties and access require separate approval.',0,0,c.id,'volunteer',TRUE,'FCT'
FROM recruitment_cycles c WHERE c.is_active=TRUE AND c.open_date<=CURRENT_DATE AND COALESCE(c.extension_date,c.close_date)>=CURRENT_DATE
AND NOT EXISTS(SELECT 1 FROM recruitment_roles r WHERE r.cycle_id=c.id AND r.opportunity_type='volunteer' AND LOWER(TRIM(r.title))=LOWER('Volunteer Transport Admin — FCT'));
INSERT INTO recruitment_roles(title,type,description,application_fee,premium_fee,cycle_id,opportunity_type,is_active,service_state)
SELECT 'Volunteer Fumigation Admin — FCT','Technical','Unpaid volunteer opportunity: Fumigation Admin for the FCT campaign. Choose any of the six FCT area councils as your preferred place to serve. Your residence may be elsewhere.

Support approved fumigation admin activities under supervision. Tell us your skills, language levels and availability. No formal degree is required. Applying is free and does not create an admin or agent account, grant authority, guarantee selection, employment or salary. Our team reviews applications and contacts selected applicants. Any later appointment, duties and access require separate approval.',0,0,c.id,'volunteer',TRUE,'FCT'
FROM recruitment_cycles c WHERE c.is_active=TRUE AND c.open_date<=CURRENT_DATE AND COALESCE(c.extension_date,c.close_date)>=CURRENT_DATE
AND NOT EXISTS(SELECT 1 FROM recruitment_roles r WHERE r.cycle_id=c.id AND r.opportunity_type='volunteer' AND LOWER(TRIM(r.title))=LOWER('Volunteer Fumigation Admin — FCT'));
INSERT INTO recruitment_roles(title,type,description,application_fee,premium_fee,cycle_id,opportunity_type,is_active,service_state)
SELECT 'Volunteer Zonal Admin — FCT','Administrative','Unpaid volunteer opportunity: Zonal Admin for the FCT campaign. Choose any of the six FCT area councils as your preferred place to serve. Your residence may be elsewhere.

Support approved zonal admin activities under supervision. Tell us your skills, language levels and availability. No formal degree is required. Applying is free and does not create an admin or agent account, grant authority, guarantee selection, employment or salary. Our team reviews applications and contacts selected applicants. Any later appointment, duties and access require separate approval.',0,0,c.id,'volunteer',TRUE,'FCT'
FROM recruitment_cycles c WHERE c.is_active=TRUE AND c.open_date<=CURRENT_DATE AND COALESCE(c.extension_date,c.close_date)>=CURRENT_DATE
AND NOT EXISTS(SELECT 1 FROM recruitment_roles r WHERE r.cycle_id=c.id AND r.opportunity_type='volunteer' AND LOWER(TRIM(r.title))=LOWER('Volunteer Zonal Admin — FCT'));
INSERT INTO recruitment_roles(title,type,description,application_fee,premium_fee,cycle_id,opportunity_type,is_active,service_state)
SELECT 'Volunteer State Admin — FCT','Administrative','Unpaid volunteer opportunity: State Admin for the FCT campaign. Choose any of the six FCT area councils as your preferred place to serve. Your residence may be elsewhere.

Support approved state admin activities under supervision. Tell us your skills, language levels and availability. No formal degree is required. Applying is free and does not create an admin or agent account, grant authority, guarantee selection, employment or salary. Our team reviews applications and contacts selected applicants. Any later appointment, duties and access require separate approval.',0,0,c.id,'volunteer',TRUE,'FCT'
FROM recruitment_cycles c WHERE c.is_active=TRUE AND c.open_date<=CURRENT_DATE AND COALESCE(c.extension_date,c.close_date)>=CURRENT_DATE
AND NOT EXISTS(SELECT 1 FROM recruitment_roles r WHERE r.cycle_id=c.id AND r.opportunity_type='volunteer' AND LOWER(TRIM(r.title))=LOWER('Volunteer State Admin — FCT'));
COMMIT;
