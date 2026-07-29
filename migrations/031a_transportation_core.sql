-- Transportation core tables must exist before migration 032 adds the
-- administration and monitoring layer. This forward migration replaces SQL
-- that was incorrectly appended to the already-applied migration 013.

CREATE TABLE IF NOT EXISTS transportation_services (
  id SERIAL PRIMARY KEY,
  service_name VARCHAR(100) NOT NULL,
  service_type VARCHAR(50) NOT NULL
    CHECK (service_type IN ('van', 'truck', 'pickup', 'moving_company')),
  description TEXT,
  base_price DECIMAL(12, 2) NOT NULL,
  price_per_km DECIMAL(12, 2) NOT NULL,
  min_distance_km INTEGER DEFAULT 0,
  max_distance_km INTEGER,
  capacity_kg INTEGER,
  provider_name VARCHAR(255),
  provider_phone VARCHAR(20),
  provider_email VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  rating DECIMAL(3, 2) DEFAULT 0.0,
  total_bookings INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transportation_bookings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES transportation_services(id),
  pickup_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  estimated_distance_km DECIMAL(8, 2),
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  items_description TEXT,
  special_requirements TEXT,
  base_price DECIMAL(12, 2) NOT NULL,
  distance_price DECIMAL(12, 2),
  total_price DECIMAL(12, 2) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_id INTEGER REFERENCES payments(id),
  booking_status VARCHAR(20) DEFAULT 'pending'
    CHECK (booking_status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  assigned_provider_id INTEGER REFERENCES transportation_services(id),
  driver_name VARCHAR(255),
  driver_phone VARCHAR(20),
  vehicle_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transportation_payments (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES transportation_bookings(id) ON DELETE CASCADE,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transportation_services_type
  ON transportation_services(service_type);
CREATE INDEX IF NOT EXISTS idx_transportation_services_active
  ON transportation_services(is_active);
CREATE INDEX IF NOT EXISTS idx_transportation_bookings_tenant
  ON transportation_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transportation_bookings_status
  ON transportation_bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_transportation_bookings_date
  ON transportation_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_transportation_payments_booking
  ON transportation_payments(booking_id);

INSERT INTO transportation_services (
  service_name,
  service_type,
  description,
  base_price,
  price_per_km,
  capacity_kg,
  provider_name,
  provider_phone
)
SELECT *
FROM (VALUES
  ('Small Van', 'van', 'Ideal for small apartments (1-2 rooms)', 5000.00, 200.00, 500, 'QuickMove Logistics', '+2348012345678'),
  ('Medium Truck', 'truck', 'Suitable for 3-4 room apartments', 8000.00, 300.00, 1000, 'QuickMove Logistics', '+2348012345678'),
  ('Pickup Truck', 'pickup', 'For light furniture and appliances', 4000.00, 150.00, 300, 'City Movers', '+2348023456789'),
  ('Full Moving Service', 'moving_company', 'Complete moving service with packers', 15000.00, 500.00, 2000, 'Professional Movers Ltd', '+2348034567890')
) AS seed(
  service_name,
  service_type,
  description,
  base_price,
  price_per_km,
  capacity_kg,
  provider_name,
  provider_phone
)
WHERE NOT EXISTS (
  SELECT 1
  FROM transportation_services existing
  WHERE existing.service_name = seed.service_name
);
