-- ============================================================
-- Recruitment Module for RentalHub NG
-- Migration 060: Core recruitment tables
-- ============================================================

-- 1. Settings / Master toggle
CREATE TABLE IF NOT EXISTS recruitment_settings (
  id SERIAL PRIMARY KEY,
  is_active BOOLEAN DEFAULT FALSE,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO recruitment_settings (is_active)
SELECT FALSE
WHERE NOT EXISTS (SELECT 1 FROM recruitment_settings);

-- 2. Recruitment cycles
CREATE TABLE IF NOT EXISTS recruitment_cycles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  open_date DATE NOT NULL,
  close_date DATE NOT NULL,
  extension_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Roles / Positions
CREATE TABLE IF NOT EXISTS recruitment_roles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('Administrative', 'Technical')),
  description TEXT,
  application_fee DECIMAL(12,2) DEFAULT 5000.00,
  premium_fee DECIMAL(12,2) DEFAULT 8000.00,
  cycle_id INTEGER REFERENCES recruitment_cycles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Location activation (per state per LGA)
CREATE TABLE IF NOT EXISTS recruitment_location_activation (
  id SERIAL PRIMARY KEY,
  state_name VARCHAR(100) NOT NULL,
  lga_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(state_name, lga_name)
);

-- 5. Applications
CREATE TABLE IF NOT EXISTS recruitment_applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  cycle_id INTEGER REFERENCES recruitment_cycles(id),
  role_id INTEGER REFERENCES recruitment_roles(id),
  
  -- Personal Information
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  state_name VARCHAR(100) NOT NULL,
  lga_name VARCHAR(100) NOT NULL,
  area_locality VARCHAR(255) NOT NULL,
  residential_address TEXT,
  date_of_birth DATE,
  
  -- Professional Information
  highest_education VARCHAR(255),
  years_of_experience INTEGER,
  current_employment_status VARCHAR(100),
  skills_qualifications TEXT,
  
  -- Application Details
  suitability_reason TEXT,
  
  -- Fee/Payment
  application_fee DECIMAL(12,2) DEFAULT 5000.00,
  payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_reference VARCHAR(255),
  payment_date TIMESTAMPTZ,
  
  -- Access Code
  access_code VARCHAR(50) UNIQUE,
  access_code_used BOOLEAN DEFAULT FALSE,
  access_code_sent_email BOOLEAN DEFAULT FALSE,
  access_code_sent_sms BOOLEAN DEFAULT FALSE,
  
  -- Track
  application_track VARCHAR(20) DEFAULT 'standard' CHECK (application_track IN ('standard', 'premium')),
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'shortlisted', 'approved', 'rejected', 'disqualified')),
  admin_notes TEXT,
  shortlist_reason TEXT,
  current_stage VARCHAR(50),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  
  -- Interview
  interview_date TIMESTAMPTZ,
  interview_activated BOOLEAN DEFAULT FALSE,
  
  -- Interview Results
  interview_score DECIMAL(5,2),
  interview_passed BOOLEAN,
  interview_completed BOOLEAN DEFAULT FALSE,
  interview_started_at TIMESTAMPTZ,
  interview_completed_at TIMESTAMPTZ,
  
  -- Disqualification
  disqualified_reason TEXT,
  disqualified_at TIMESTAMPTZ,
  
  -- Violations
  violation_detected BOOLEAN DEFAULT FALSE,
  violation_details TEXT,
  
  -- Documents emailed
  documents_emailed BOOLEAN DEFAULT FALSE,
  documents_emailed_at TIMESTAMPTZ,
  
  reference_number VARCHAR(50) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_user_id ON recruitment_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_role_id ON recruitment_applications(role_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_cycle_id ON recruitment_applications(cycle_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_status ON recruitment_applications(status);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_state ON recruitment_applications(state_name);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_lga ON recruitment_applications(lga_name);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_area ON recruitment_applications(area_locality);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_access_code ON recruitment_applications(access_code);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_payment_status ON recruitment_applications(payment_status);

ALTER TABLE recruitment_applications
  ADD COLUMN IF NOT EXISTS shortlist_reason TEXT,
  ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50);

CREATE TABLE IF NOT EXISTS recruitment_application_operations (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_application_operations_application
  ON recruitment_application_operations(application_id, created_at DESC);

-- 6. Uploaded documents per application
CREATE TABLE IF NOT EXISTS recruitment_documents (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN (
    'cv', 'cover_letter', 'guarantor_letter', 'government_id', 'proof_of_address', 'certificate', 'other'
  )),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_documents_application_id ON recruitment_documents(application_id);

-- 7. Interview questions bank
CREATE TABLE IF NOT EXISTS recruitment_questions (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  option_a VARCHAR(500) NOT NULL,
  option_b VARCHAR(500) NOT NULL,
  option_c VARCHAR(500) NOT NULL,
  option_d VARCHAR(500) NOT NULL,
  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  category VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_questions_category ON recruitment_questions(category);

ALTER TABLE recruitment_questions
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 8. Interview assignments (which questions each applicant got)
CREATE TABLE IF NOT EXISTS recruitment_interview_assignments (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES recruitment_questions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  answer_given CHAR(1),
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ,
  UNIQUE(application_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_interview_assignments_app ON recruitment_interview_assignments(application_id);

-- 9. Interview recording metadata
CREATE TABLE IF NOT EXISTS recruitment_interview_recordings (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  recording_path VARCHAR(500),
  recording_duration INTEGER, -- seconds
  violation_log TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Analytics materialized data (optional, for performance)
CREATE TABLE IF NOT EXISTS recruitment_analytics_snapshot (
  id SERIAL PRIMARY KEY,
  cycle_id INTEGER REFERENCES recruitment_cycles(id),
  total_applicants INTEGER DEFAULT 0,
  total_fees_collected DECIMAL(14,2) DEFAULT 0.00,
  per_role_data JSONB DEFAULT '{}',
  monthly_trends JSONB DEFAULT '{}',
  interview_pass_rate DECIMAL(5,2),
  snapshot_date DATE DEFAULT CURRENT_DATE,
  UNIQUE(cycle_id, snapshot_date)
);

-- Add recruitment_permission to user_types if needed
-- We'll use a new role check: recruitment_admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_recruitment_admin BOOLEAN DEFAULT FALSE;

DO $$
DECLARE
  existing_check_name TEXT;
  current_len INTEGER;
  col_has_views INTEGER;
BEGIN
  -- Drop existing check constraint on user_type if it exists
  SELECT c.conname
  INTO existing_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'users'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%user_type%';

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', existing_check_name);
  END IF;

  -- Get current character maximum length
  SELECT COALESCE(character_maximum_length, 0) INTO current_len
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'user_type';

  -- Only ALTER if column is narrower than VARCHAR(50)
  IF current_len < 50 THEN
    -- Check for dependent views
    SELECT COUNT(*) INTO col_has_views
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v ON v.oid = r.ev_class
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.refclassid = 'pg_class'::regclass
      AND d.classid = 'pg_rewrite'::regclass
      AND d.refobjsubid > 0
      AND a.attrelid = 'users'::regclass
      AND v.relkind = 'v'
      AND a.attname = 'user_type';

    IF col_has_views > 0 THEN
      RAISE NOTICE '% view(s) depend on user_type, dropping temporarily', col_has_views;
      DROP VIEW IF EXISTS financial_admin_dashboard CASCADE;
      DROP VIEW IF EXISTS lga_admin_hierarchy CASCADE;
      DROP VIEW IF EXISTS state_admin_earnings CASCADE;
      DROP VIEW IF EXISTS state_admin_transportation_view CASCADE;
      DROP VIEW IF EXISTS super_admin_transportation_oversight_view CASCADE;
      DROP VIEW IF EXISTS transportation_system_health_view CASCADE;
    END IF;

    ALTER TABLE users ALTER COLUMN user_type TYPE VARCHAR(50);
    RAISE NOTICE 'Altered user_type to VARCHAR(50)';
  ELSE
    RAISE NOTICE 'user_type is already VARCHAR(%), skipping ALTER COLUMN', current_len;
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_user_type_check
  CHECK (
    user_type IN (
      'tenant',
      'landlord',
      'lawyer',
      'state_lawyer',
      'super_lawyer',
      'admin',
      'lga_admin',
      'lga_support_admin',
      'state_admin',
      'lga_financial_admin',
      'lga_transportation_admin',
      'state_transportation_admin',
      'super_transportation_admin',
      'lga_fumigation_admin',
      'state_fumigation_admin',
      'super_fumigation_admin',
      'state_financial_admin',
      'state_support_admin',
      'super_admin',
      'financial_admin',
      'super_financial_admin',
      'super_support_admin',
      'recruitment_admin',
      'agent',
      'fumigation_admin',
      'transportation_admin'
    )
  );
