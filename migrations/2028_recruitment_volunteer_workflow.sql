ALTER TABLE recruitment_roles ADD COLUMN IF NOT EXISTS opportunity_type VARCHAR(20) DEFAULT 'employment';
UPDATE recruitment_roles SET opportunity_type = 'employment' WHERE opportunity_type IS NULL;
ALTER TABLE recruitment_roles ALTER COLUMN opportunity_type SET DEFAULT 'employment';
ALTER TABLE recruitment_roles ALTER COLUMN opportunity_type SET NOT NULL;
ALTER TABLE recruitment_roles ADD CONSTRAINT recruitment_roles_opportunity_type_check CHECK (opportunity_type IN ('employment', 'volunteer'));
UPDATE recruitment_roles SET application_fee = 0, premium_fee = 0 WHERE opportunity_type = 'volunteer';
ALTER TABLE recruitment_roles ADD CONSTRAINT recruitment_roles_volunteer_fees_check CHECK (opportunity_type <> 'volunteer' OR (application_fee = 0 AND premium_fee = 0));
ALTER TABLE recruitment_settings ADD COLUMN IF NOT EXISTS volunteer_applications_enabled BOOLEAN DEFAULT FALSE;
UPDATE recruitment_settings SET volunteer_applications_enabled = FALSE WHERE volunteer_applications_enabled IS NULL;
ALTER TABLE recruitment_settings ALTER COLUMN volunteer_applications_enabled SET NOT NULL;
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS volunteer_motivation TEXT;
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS availability TEXT;
ALTER TABLE recruitment_applications DROP CONSTRAINT IF EXISTS recruitment_applications_payment_status_check;
ALTER TABLE recruitment_applications ADD CONSTRAINT recruitment_applications_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'not_applicable'));
CREATE OR REPLACE FUNCTION protect_recruitment_opportunity_history() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opportunity_type IS DISTINCT FROM OLD.opportunity_type THEN
    RAISE EXCEPTION 'Opportunity type cannot be changed; create a new opportunity to preserve application history' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER recruitment_opportunity_history BEFORE UPDATE OF opportunity_type ON recruitment_roles FOR EACH ROW EXECUTE FUNCTION protect_recruitment_opportunity_history();
CREATE OR REPLACE FUNCTION enforce_recruitment_application_payment() RETURNS TRIGGER AS $$
DECLARE opportunity VARCHAR(20);
BEGIN
  SELECT opportunity_type INTO opportunity FROM recruitment_roles WHERE id = NEW.role_id;
  IF opportunity = 'volunteer' THEN
    NEW.application_fee := 0;
    NEW.payment_status := 'not_applicable';
    NEW.application_track := 'standard';
    NEW.payment_reference := NULL;
    NEW.payment_date := NULL;
  ELSIF NEW.payment_status = 'not_applicable' THEN
    RAISE EXCEPTION 'Employment applications require the employment payment workflow' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER recruitment_application_payment_guard BEFORE INSERT OR UPDATE ON recruitment_applications FOR EACH ROW EXECUTE FUNCTION enforce_recruitment_application_payment();
