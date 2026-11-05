-- Migration 2034: Advanced Real-Time Transportation Tracking System
-- Adds live GPS tracking, vehicle telemetry, breadcrumb pings, driver operations, and incident logging

-- 1. Extend transportation_bookings table with live GPS tracking fields
ALTER TABLE transportation_bookings
  ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS driver_license_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS current_longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS current_heading DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS current_speed DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS pickup_longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS destination_latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS destination_longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(50) DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS is_tracking_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eta_pickup_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS eta_destination_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS distance_remaining_km DECIMAL(8, 2),
  ADD COLUMN IF NOT EXISTS tracking_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_ended_at TIMESTAMPTZ;

-- 2. Create GPS breadcrumb pings table for real-time location history
CREATE TABLE IF NOT EXISTS transportation_tracking_pings (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES transportation_bookings(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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

-- 3. Create transportation driver profiles table
CREATE TABLE IF NOT EXISTS transportation_driver_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type VARCHAR(50) NOT NULL DEFAULT 'truck',
  vehicle_model VARCHAR(100),
  vehicle_plate_number VARCHAR(50) NOT NULL,
  vehicle_color VARCHAR(50),
  license_number VARCHAR(100),
  is_available BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT TRUE,
  rating DECIMAL(3, 2) DEFAULT 5.0,
  total_trips INTEGER DEFAULT 0,
  current_booking_id INTEGER REFERENCES transportation_bookings(id) ON DELETE SET NULL,
  last_latitude DECIMAL(10, 7),
  last_longitude DECIMAL(10, 7),
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create transportation incidents table
CREATE TABLE IF NOT EXISTS transportation_incidents (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES transportation_bookings(id) ON DELETE CASCADE,
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_role VARCHAR(50) DEFAULT 'driver',
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

-- 5. Indexes for fast lookup and time-series query
CREATE INDEX IF NOT EXISTS idx_transportation_bookings_driver ON transportation_bookings(driver_id);
CREATE INDEX IF NOT EXISTS idx_transportation_bookings_tracking_status ON transportation_bookings(tracking_status);
CREATE INDEX IF NOT EXISTS idx_transportation_bookings_tracking_active ON transportation_bookings(is_tracking_active);
CREATE INDEX IF NOT EXISTS idx_transportation_pings_booking_recorded ON transportation_tracking_pings(booking_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_transportation_pings_driver_recorded ON transportation_tracking_pings(driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_transportation_incidents_booking ON transportation_incidents(booking_id);
CREATE INDEX IF NOT EXISTS idx_transportation_incidents_status ON transportation_incidents(status);
CREATE INDEX IF NOT EXISTS idx_transportation_driver_user ON transportation_driver_profiles(user_id);
