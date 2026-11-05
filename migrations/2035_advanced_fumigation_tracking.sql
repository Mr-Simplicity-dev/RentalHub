-- Migration 2035: Advanced Real-Time Fumigation Tracking & Safety Monitoring System
-- Adds live GPS telemetry, chemical logs, ventilation re-entry timers, specialist operations, and incident logging

-- 1. Extend fumigation_cleaning_bookings table with live GPS tracking, safety compliance, and evidence fields
ALTER TABLE fumigation_cleaning_bookings
  ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS team_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS team_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS team_vehicle_plate VARCHAR(50),
  ADD COLUMN IF NOT EXISTS team_vehicle_type VARCHAR(50) DEFAULT 'van',
  ADD COLUMN IF NOT EXISTS team_equipment_details TEXT,
  ADD COLUMN IF NOT EXISTS current_latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS current_longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS current_heading DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS current_speed DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS property_latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS property_longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(50) DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS is_tracking_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eta_arrival_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS distance_remaining_km DECIMAL(8, 2),
  ADD COLUMN IF NOT EXISTS tracking_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS treatment_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS treatment_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ventilation_hours_required DECIMAL(4, 1) DEFAULT 4.0,
  ADD COLUMN IF NOT EXISTS reentry_permitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chemical_used VARCHAR(255),
  ADD COLUMN IF NOT EXISTS chemical_registration_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS application_method VARCHAR(100),
  ADD COLUMN IF NOT EXISTS safety_instructions TEXT,
  ADD COLUMN IF NOT EXISTS customer_notes TEXT,
  ADD COLUMN IF NOT EXISTS before_photos TEXT[],
  ADD COLUMN IF NOT EXISTS after_photos TEXT[],
  ADD COLUMN IF NOT EXISTS service_report_url TEXT,
  ADD COLUMN IF NOT EXISTS tenant_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tenant_feedback TEXT,
  ADD COLUMN IF NOT EXISTS tenant_problem_reported BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tenant_problem_description TEXT,
  ADD COLUMN IF NOT EXISTS tenant_problem_reported_at TIMESTAMPTZ;

-- 2. Create GPS breadcrumb pings table for real-time team location history
CREATE TABLE IF NOT EXISTS fumigation_tracking_pings (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES fumigation_cleaning_bookings(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  accuracy DECIMAL(8, 2),
  heading DECIMAL(5, 2),
  speed DECIMAL(6, 2),
  altitude DECIMAL(8, 2),
  battery_level DECIMAL(5, 2),
  is_mocked BOOLEAN DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create fumigation team specialist profiles table
CREATE TABLE IF NOT EXISTS fumigation_team_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  certified_license_number VARCHAR(100),
  ppe_certified BOOLEAN DEFAULT TRUE,
  vehicle_type VARCHAR(50) DEFAULT 'van',
  vehicle_plate_number VARCHAR(50),
  is_available BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT TRUE,
  rating DECIMAL(3, 2) DEFAULT 5.0,
  total_jobs INTEGER DEFAULT 0,
  current_booking_id INTEGER REFERENCES fumigation_cleaning_bookings(id) ON DELETE SET NULL,
  last_latitude DECIMAL(10, 7),
  last_longitude DECIMAL(10, 7),
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create fumigation incidents & delay reporting table
CREATE TABLE IF NOT EXISTS fumigation_incidents (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES fumigation_cleaning_bookings(id) ON DELETE CASCADE,
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_role VARCHAR(50) DEFAULT 'team',
  incident_type VARCHAR(60) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  status VARCHAR(30) NOT NULL DEFAULT 'reported'
    CHECK (status IN ('reported', 'acknowledged', 'dispatched_help', 'resolved')),
  resolution_note TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create fumigation service reports and evidence table
CREATE TABLE IF NOT EXISTS fumigation_service_reports (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES fumigation_cleaning_bookings(id) ON DELETE CASCADE,
  provider_id INTEGER,
  compiled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  targeted_pests TEXT[],
  chemical_name VARCHAR(255) NOT NULL,
  active_ingredient VARCHAR(255),
  nafdac_reg_number VARCHAR(100),
  dilution_rate VARCHAR(100),
  quantity_applied VARCHAR(100),
  target_areas TEXT[],
  safety_gear_worn TEXT[],
  ventilation_hours DECIMAL(4, 1) NOT NULL DEFAULT 4.0,
  reentry_safe_time TIMESTAMPTZ,
  waste_disposal_method TEXT,
  customer_briefing_given BOOLEAN DEFAULT TRUE,
  before_photos TEXT[],
  after_photos TEXT[],
  safety_notice TEXT,
  technician_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Indexes for fast lookup and time-series query
CREATE INDEX IF NOT EXISTS idx_fumigation_bookings_team ON fumigation_cleaning_bookings(team_id);
CREATE INDEX IF NOT EXISTS idx_fumigation_bookings_tracking_status ON fumigation_cleaning_bookings(tracking_status);
CREATE INDEX IF NOT EXISTS idx_fumigation_bookings_tracking_active ON fumigation_cleaning_bookings(is_tracking_active);
CREATE INDEX IF NOT EXISTS idx_fumigation_pings_booking_recorded ON fumigation_tracking_pings(booking_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fumigation_pings_team_recorded ON fumigation_tracking_pings(team_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fumigation_incidents_booking ON fumigation_incidents(booking_id);
CREATE INDEX IF NOT EXISTS idx_fumigation_incidents_status ON fumigation_incidents(status);
CREATE INDEX IF NOT EXISTS idx_fumigation_team_user ON fumigation_team_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_fumigation_reports_booking ON fumigation_service_reports(booking_id);
