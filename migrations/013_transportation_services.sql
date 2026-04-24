-- Migration 013: Transportation Services for Tenants
BEGIN;

-- Transportation service providers table
CREATE TABLE transportation_services (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('van', 'truck', 'pickup', 'moving_company')),
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

-- Transportation bookings table
CREATE TABLE transportation_bookings (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES transportation_services(id),
    
    -- Booking details
    pickup_address TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    estimated_distance_km DECIMAL(8, 2),
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    items_description TEXT,
    special_requirements TEXT,
    
    -- Pricing
    base_price DECIMAL(12, 2) NOT NULL,
    distance_price DECIMAL(12, 2),
    total_price DECIMAL(12, 2) NOT NULL,
    
    -- Payment status
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_id INTEGER REFERENCES payments(id),
    
    -- Booking status
    booking_status VARCHAR(20) DEFAULT 'pending' CHECK (booking_status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
    
    -- Provider assignment
    assigned_provider_id INTEGER REFERENCES transportation_services(id),
    driver_name VARCHAR(255),
    driver_phone VARCHAR(20),
    vehicle_number VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

-- Transportation booking payments table (links to main payments table)
CREATE TABLE transportation_payments (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES transportation_bookings(id) ON DELETE CASCADE,
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add transportation payment type to payments table
DO $$
DECLARE
    existing_check_name TEXT;
BEGIN
    SELECT c.conname
      INTO existing_check_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'payments'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%payment_type%';

    IF existing_check_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', existing_check_name);
    END IF;
END $$;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (
    payment_type IN (
      'tenant_subscription',
      'landlord_listing',
      'rent_payment',
      'property_unlock',
      'general_platform_fee',
      'transportation_booking'  -- New payment type
    )
  );

-- Create indexes for performance
CREATE INDEX idx_transportation_services_type ON transportation_services(service_type);
CREATE INDEX idx_transportation_services_active ON transportation_services(is_active);
CREATE INDEX idx_transportation_bookings_tenant ON transportation_bookings(tenant_id);
CREATE INDEX idx_transportation_bookings_status ON transportation_bookings(booking_status);
CREATE INDEX idx_transportation_bookings_date ON transportation_bookings(booking_date);
CREATE INDEX idx_transportation_payments_booking ON transportation_payments(booking_id);

-- Insert sample transportation services
INSERT INTO transportation_services (service_name, service_type, description, base_price, price_per_km, capacity_kg, provider_name, provider_phone) VALUES
    ('Small Van', 'van', 'Ideal for small apartments (1-2 rooms)', 5000.00, 200.00, 500, 'QuickMove Logistics', '+2348012345678'),
    ('Medium Truck', 'truck', 'Suitable for 3-4 room apartments', 8000.00, 300.00, 1000, 'QuickMove Logistics', '+2348012345678'),
    ('Pickup Truck', 'pickup', 'For light furniture and appliances', 4000.00, 150.00, 300, 'City Movers', '+2348023456789'),
    ('Full Moving Service', 'moving_company', 'Complete moving service with packers', 15000.00, 500.00, 2000, 'Professional Movers Ltd', '+2348034567890');

COMMIT;