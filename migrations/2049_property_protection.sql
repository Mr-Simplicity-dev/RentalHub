BEGIN;
CREATE TABLE IF NOT EXISTS protection_properties (
 id BIGSERIAL PRIMARY KEY,submission_id UUID NOT NULL,owner_id INTEGER NOT NULL REFERENCES users(id),listing_id INTEGER REFERENCES properties(id),
 title VARCHAR(200) NOT NULL,property_type VARCHAR(50) NOT NULL,state_id INTEGER NOT NULL REFERENCES states(id),lga_name VARCHAR(120) NOT NULL,town VARCHAR(120),area VARCHAR(160),address TEXT NOT NULL,
 parcel_number VARCHAR(150),survey_number VARCHAR(150),latitude NUMERIC(10,7),longitude NUMERIC(10,7),boundary_details TEXT,
 acquisition_method VARCHAR(30) NOT NULL CHECK(acquisition_method IN ('purchase','inheritance','allocation','transfer','other')),
 ownership_capacity VARCHAR(30) NOT NULL CHECK(ownership_capacity IN ('individual','family','joint','company')),
 ownership_details JSONB NOT NULL DEFAULT '{}',seller_details TEXT,
 pending_update JSONB,update_requested_by INTEGER REFERENCES users(id),update_reason TEXT,record_history JSONB NOT NULL DEFAULT '[]',verification_status VARCHAR(40) NOT NULL DEFAULT 'unregistered',verification_scope TEXT,verification_limitations TEXT,verified_at TIMESTAMPTZ,verified_until TIMESTAMPTZ,
 case_officer_id INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS protection_registration_retry ON protection_properties(owner_id,submission_id);
CREATE INDEX IF NOT EXISTS protection_properties_owner ON protection_properties(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS protection_properties_location ON protection_properties(state_id,lga_name);
CREATE INDEX IF NOT EXISTS protection_properties_parcel ON protection_properties(state_id,lower(parcel_number)) WHERE parcel_number IS NOT NULL;
CREATE TABLE IF NOT EXISTS protection_representatives (
 id BIGSERIAL PRIMARY KEY,property_id BIGINT NOT NULL REFERENCES protection_properties(id),user_id INTEGER NOT NULL REFERENCES users(id),
 capacity TEXT NOT NULL,authority_description TEXT NOT NULL,can_upload BOOLEAN NOT NULL DEFAULT FALSE,can_open_cases BOOLEAN NOT NULL DEFAULT FALSE,can_request_services BOOLEAN NOT NULL DEFAULT FALSE,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),requested_by INTEGER NOT NULL REFERENCES users(id),reviewed_by INTEGER REFERENCES users(id),review_note TEXT,expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(property_id,user_id)
);
CREATE TABLE IF NOT EXISTS protection_checks (
 id BIGSERIAL PRIMARY KEY,property_id BIGINT NOT NULL REFERENCES protection_properties(id),stage VARCHAR(30) NOT NULL CHECK(stage IN ('documents','consistency','registry','survey','inspection','professional','final')),
 history JSONB NOT NULL DEFAULT '[]',status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','assigned','submitted','approved','returned','rejected')),
 assigned_to INTEGER REFERENCES users(id),public_summary TEXT,private_findings TEXT,source_details JSONB NOT NULL DEFAULT '{}',document_ids JSONB NOT NULL DEFAULT '[]',
 submitted_by INTEGER REFERENCES users(id),reviewed_by INTEGER REFERENCES users(id),review_reason TEXT,submitted_at TIMESTAMPTZ,reviewed_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(property_id,stage)
);
CREATE TABLE IF NOT EXISTS protection_services (
 code VARCHAR(40) PRIMARY KEY,description TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT FALSE,available_states JSONB NOT NULL DEFAULT '[]',period_days INTEGER,cadence_days INTEGER,updated_by INTEGER REFERENCES users(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(period_days IS NULL OR period_days BETWEEN 1 AND 366),CHECK(cadence_days IS NULL OR cadence_days BETWEEN 1 AND 366)
);
INSERT INTO protection_services(code,description) VALUES
 ('registry','A recorded search at the relevant land registry, with its reference, source, date and limitations.'),
 ('survey','Assessment of the survey documents and boundary information by an authorised survey reviewer.'),
 ('inspection','A scheduled physical inspection and a recorded report of observed conditions.'),
 ('professional','Restricted title and document review, with findings and limitations.'),
 ('monitoring','Optional periodic authorised checks and reports during the selected monitoring period.') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS protection_service_requests (
 id UUID PRIMARY KEY,property_id BIGINT NOT NULL REFERENCES protection_properties(id),service_code VARCHAR(40) NOT NULL REFERENCES protection_services(code),user_id INTEGER NOT NULL REFERENCES users(id),payment_id INTEGER UNIQUE REFERENCES payments(id),
 amount NUMERIC(14,2) NOT NULL CHECK(amount>0),currency VARCHAR(3) NOT NULL DEFAULT 'NGN',payment_email TEXT NOT NULL,scope_snapshot TEXT NOT NULL,period_days INTEGER,cadence_days INTEGER,
 status VARCHAR(25) NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','paid','in_progress','completed','cancelled')),
 authorization_url TEXT,access_code TEXT,last_checked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),paid_at TIMESTAMPTZ,completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS protection_payment_reconcile ON protection_service_requests(COALESCE(last_checked_at,created_at)) WHERE status='pending_payment';
CREATE UNIQUE INDEX IF NOT EXISTS protection_service_one_open ON protection_service_requests(property_id,service_code) WHERE status IN ('pending_payment','paid','in_progress');
ALTER TABLE property_inspection_requests ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE property_inspection_requests ALTER COLUMN application_id DROP NOT NULL;
ALTER TABLE property_inspection_requests ADD COLUMN IF NOT EXISTS protection_property_id BIGINT REFERENCES protection_properties(id),ADD COLUMN IF NOT EXISTS protection_request_id UUID REFERENCES protection_service_requests(id),ADD COLUMN IF NOT EXISTS protection_purpose VARCHAR(20),ADD COLUMN IF NOT EXISTS assigned_agent_id INTEGER REFERENCES users(id),ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,ADD COLUMN IF NOT EXISTS supervisor_note TEXT;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='inspection_source_required' AND conrelid='property_inspection_requests'::regclass) THEN ALTER TABLE property_inspection_requests ADD CONSTRAINT inspection_source_required CHECK((protection_property_id IS NULL AND property_id IS NOT NULL AND application_id IS NOT NULL) OR protection_property_id IS NOT NULL);END IF;END $$;
CREATE INDEX IF NOT EXISTS protection_inspection_assigned ON property_inspection_requests(assigned_agent_id,status) WHERE protection_property_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS protection_inspection_request ON property_inspection_requests(protection_request_id) WHERE protection_purpose='verification';
CREATE TABLE IF NOT EXISTS property_inspection_operations(id SERIAL PRIMARY KEY,inspection_id INTEGER NOT NULL REFERENCES property_inspection_requests(id) ON DELETE CASCADE,admin_id INTEGER REFERENCES users(id),actor_name VARCHAR(255),event_type VARCHAR(80) NOT NULL,note TEXT,proof_url TEXT,metadata JSONB DEFAULT '{}',created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS protection_documents (
 id UUID PRIMARY KEY,property_id BIGINT NOT NULL REFERENCES protection_properties(id),inspection_id INTEGER REFERENCES property_inspection_requests(id),uploaded_by INTEGER NOT NULL REFERENCES users(id),kind VARCHAR(40) NOT NULL,
 original_name VARCHAR(255) NOT NULL,storage_name VARCHAR(100) NOT NULL UNIQUE,mime_type VARCHAR(100) NOT NULL,file_size BIGINT NOT NULL,sha256 CHAR(64) NOT NULL,scan_status VARCHAR(20) NOT NULL CHECK(scan_status='clean'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),retention_consent BOOLEAN NOT NULL DEFAULT FALSE,retain_until TIMESTAMPTZ NOT NULL,withdrawn_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS protection_documents_property ON protection_documents(property_id,created_at DESC);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS protection_property_id BIGINT REFERENCES protection_properties(id),ADD COLUMN IF NOT EXISTS protection_request_key UUID,ADD COLUMN IF NOT EXISTS protection_outcome_history JSONB NOT NULL DEFAULT '[]',ADD COLUMN IF NOT EXISTS protection_outcome VARCHAR(50),ADD COLUMN IF NOT EXISTS outcome_limitations TEXT;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='dispute_evidence' AND column_name='created_at') THEN ALTER TABLE dispute_evidence ADD COLUMN created_at TIMESTAMP;UPDATE dispute_evidence SET created_at=uploaded_at;ALTER TABLE dispute_evidence ALTER COLUMN created_at SET DEFAULT NOW();END IF;END $$;
CREATE UNIQUE INDEX IF NOT EXISTS protection_case_retry ON disputes(opened_by,protection_request_key) WHERE protection_request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS protection_disputes ON disputes(protection_property_id) WHERE protection_property_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS protection_case_participants (
 dispute_id INTEGER NOT NULL REFERENCES disputes(id),user_id INTEGER NOT NULL REFERENCES users(id),capacity VARCHAR(30) NOT NULL CHECK(capacity IN ('representative','respondent','officer','professional')),approved_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),revoked_at TIMESTAMPTZ,PRIMARY KEY(dispute_id,user_id)
);
CREATE TABLE IF NOT EXISTS lawyer_case_notes(id SERIAL PRIMARY KEY,dispute_id INTEGER NOT NULL REFERENCES disputes(id),lawyer_user_id INTEGER NOT NULL REFERENCES users(id),note_type VARCHAR(50) DEFAULT 'case_analysis',title VARCHAR(255),content TEXT NOT NULL,is_visible_to_client BOOLEAN DEFAULT FALSE,created_at TIMESTAMP NOT NULL DEFAULT NOW(),updated_at TIMESTAMP NOT NULL DEFAULT NOW());
ALTER TABLE lawyer_case_notes ADD COLUMN IF NOT EXISTS client_user_id INTEGER REFERENCES users(id);
CREATE TABLE IF NOT EXISTS socket_io_attachments(id BIGSERIAL UNIQUE,created_at TIMESTAMPTZ DEFAULT NOW(),payload BYTEA);
CREATE INDEX IF NOT EXISTS socket_io_attachments_created ON socket_io_attachments(created_at);
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS room_state JSONB,ADD COLUMN IF NOT EXISTS dispute_id INTEGER REFERENCES disputes(id),ADD COLUMN IF NOT EXISTS protection_property_id BIGINT REFERENCES protection_properties(id);
CREATE TABLE IF NOT EXISTS protection_monitoring (
 property_id BIGINT PRIMARY KEY REFERENCES protection_properties(id),request_id UUID NOT NULL REFERENCES protection_service_requests(id),active_until TIMESTAMPTZ NOT NULL,next_check_at TIMESTAMPTZ NOT NULL,cadence_days INTEGER NOT NULL CHECK(cadence_days>0),cancelled_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS protection_alerts (
 id BIGSERIAL PRIMARY KEY,property_id BIGINT NOT NULL REFERENCES protection_properties(id),category VARCHAR(35) NOT NULL CHECK(category IN ('amana_platform','independent_finding','official_information')),rule_key VARCHAR(150) NOT NULL,
 summary TEXT NOT NULL,source_details JSONB NOT NULL DEFAULT '{}',status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','closed')),review_note TEXT,created_by INTEGER REFERENCES users(id),reviewed_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(property_id,rule_key)
);
COMMIT;
