-- Migration: 033_fumigation_cleaning_services.sql
-- Description: Creates fumigation and cleaning service booking system
-- Created: 2024-01-15

-- ============================================
-- FUMIGATION & CLEANING SERVICES DATABASE SCHEMA
-- ============================================

-- Service Categories Table
CREATE TABLE IF NOT EXISTS fumigation_cleaning_categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    category_type VARCHAR(50) NOT NULL CHECK (category_type IN ('fumigation', 'cleaning')),
    description TEXT,
    icon_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Packages Table
CREATE TABLE IF NOT EXISTS fumigation_cleaning_services (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES fumigation_cleaning_categories(id),
    service_name VARCHAR(200) NOT NULL,
    service_description TEXT NOT NULL,
    
    -- Service Details
    property_type VARCHAR(50) NOT NULL CHECK (property_type IN ('apartment', 'house', 'duplex', 'studio', 'bungalow', 'flat', 'room', 'office', 'commercial')),
    property_size VARCHAR(50) NOT NULL CHECK (property_size IN ('small', 'medium', 'large', 'extra_large')),
    
    -- Pricing
    base_price DECIMAL(12, 2) NOT NULL,
    price_per_sqm DECIMAL(12, 2),
    min_price DECIMAL(12, 2) NOT NULL,
    max_price DECIMAL(12, 2),
    
    -- Service Specifications
    duration_hours DECIMAL(5, 2) NOT NULL, -- Estimated duration in hours
    team_size INTEGER DEFAULT 2, -- Number of professionals needed
    equipment_included JSONB DEFAULT '[]', -- List of equipment included
    chemicals_used JSONB DEFAULT '[]', -- List of chemicals/cleaning agents
    safety_gear_included BOOLEAN DEFAULT TRUE,
    
    -- Compliance & Certifications
    certifications_required JSONB DEFAULT '[]',
    safety_guidelines TEXT,
    post_service_guarantee_days INTEGER DEFAULT 30,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Add-ons Table
CREATE TABLE IF NOT EXISTS service_addons (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES fumigation_cleaning_services(id),
    addon_name VARCHAR(200) NOT NULL,
    addon_description TEXT,
    addon_price DECIMAL(12, 2) NOT NULL,
    duration_addition_hours DECIMAL(5, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Bookings Table
CREATE TABLE IF NOT EXISTS fumigation_cleaning_bookings (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES users(id),
    property_id INTEGER NOT NULL REFERENCES properties(id),
    service_id INTEGER NOT NULL REFERENCES fumigation_cleaning_services(id),
    
    -- Booking Details
    booking_reference VARCHAR(50) UNIQUE NOT NULL,
    booking_date DATE NOT NULL,
    preferred_time_slot VARCHAR(50) NOT NULL CHECK (preferred_time_slot IN ('morning', 'afternoon', 'evening', 'specific')),
    specific_time TIME, -- Only if preferred_time_slot is 'specific'
    
    -- Property Details (snapshot at time of booking)
    property_size_sqm DECIMAL(8, 2),
    number_of_rooms INTEGER,
    property_condition VARCHAR(50) DEFAULT 'normal',
    special_instructions TEXT,
    
    -- Selected Add-ons
    selected_addons JSONB DEFAULT '[]',
    
    -- Pricing Details
    base_service_price DECIMAL(12, 2) NOT NULL,
    addons_total_price DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total_price DECIMAL(12, 2) NOT NULL,
    
    -- Booking Status
    booking_status VARCHAR(50) DEFAULT 'pending' CHECK (booking_status IN (
        'pending', 'confirmed', 'scheduled', 'in_progress', 
        'completed', 'cancelled', 'rescheduled'
    )),
    
    -- Payment Status
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN (
        'pending', 'processing', 'completed', 'failed', 'refunded'
    )),
    
    -- Service Team Details (filled when confirmed)
    assigned_team_leader VARCHAR(200),
    assigned_team_members JSONB DEFAULT '[]',
    team_contact_phone VARCHAR(20),
    
    -- Service Execution Details
    service_start_time TIMESTAMP,
    service_end_time TIMESTAMP,
    actual_duration_hours DECIMAL(5, 2),
    chemicals_used_list JSONB DEFAULT '[]',
    equipment_used_list JSONB DEFAULT '[]',
    
    -- Safety & Compliance
    safety_checks_completed BOOLEAN DEFAULT FALSE,
    compliance_document_urls JSONB DEFAULT '[]',
    customer_safety_briefing BOOLEAN DEFAULT FALSE,
    
    -- Customer Feedback
    customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
    customer_feedback TEXT,
    feedback_submitted_at TIMESTAMP,
    
    -- Cancellation Details
    cancellation_reason TEXT,
    cancelled_by VARCHAR(50) CHECK (cancelled_by IN ('tenant', 'admin', 'system')),
    cancellation_fee DECIMAL(12, 2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    scheduled_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

-- Service Providers/Teams Table
CREATE TABLE IF NOT EXISTS service_providers (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(200),
    contact_phone VARCHAR(20) NOT NULL,
    contact_email VARCHAR(255),
    license_number VARCHAR(100),
    certifications JSONB DEFAULT '[]',
    service_areas JSONB DEFAULT '[]', -- Array of state codes
    services_offered JSONB DEFAULT '[]', -- Array of service IDs
    is_active BOOLEAN DEFAULT TRUE,
    rating DECIMAL(3, 2) DEFAULT 0,
    total_jobs_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Booking-Provider Assignment Table
CREATE TABLE IF NOT EXISTS booking_provider_assignments (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES fumigation_cleaning_bookings(id),
    provider_id INTEGER NOT NULL REFERENCES service_providers(id),
    assignment_status VARCHAR(50) DEFAULT 'assigned' CHECK (assignment_status IN (
        'assigned', 'accepted', 'declined', 'completed'
    )),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    declined_at TIMESTAMP,
    declined_reason TEXT
);

-- Payment Records Table
CREATE TABLE IF NOT EXISTS fumigation_payments (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES fumigation_cleaning_bookings(id),
    payment_reference VARCHAR(255) UNIQUE,
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('paystack', 'flutterwave', 'bank_transfer', 'cash')),
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'NGN',
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN (
        'pending', 'processing', 'completed', 'failed', 'refunded'
    )),
    gateway_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Service Reviews Table
CREATE TABLE IF NOT EXISTS service_reviews (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES fumigation_cleaning_bookings(id),
    tenant_id INTEGER NOT NULL REFERENCES users(id),
    service_id INTEGER NOT NULL REFERENCES fumigation_cleaning_services(id),
    provider_id INTEGER REFERENCES service_providers(id),
    
    -- Ratings
    overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
    professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    timeliness_rating INTEGER CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
    
    -- Review Details
    review_title VARCHAR(200),
    review_text TEXT,
    photos_urls JSONB DEFAULT '[]',
    
    -- Response from Provider
    provider_response TEXT,
    responded_at TIMESTAMP,
    
    -- Status
    is_approved BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Safety Compliance Records
CREATE TABLE IF NOT EXISTS safety_compliance_records (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES fumigation_cleaning_bookings(id),
    provider_id INTEGER NOT NULL REFERENCES service_providers(id),
    
    -- Safety Checks
    safety_briefing_completed BOOLEAN DEFAULT FALSE,
    ppe_used BOOLEAN DEFAULT FALSE,
    area_secured BOOLEAN DEFAULT FALSE,
    warning_signs_posted BOOLEAN DEFAULT FALSE,
    ventilation_adequate BOOLEAN DEFAULT FALSE,
    
    -- Chemical Safety
    msds_available BOOLEAN DEFAULT FALSE, -- Material Safety Data Sheets
    proper_storage BOOLEAN DEFAULT FALSE,
    spill_kit_available BOOLEAN DEFAULT FALSE,
    
    -- Environmental Compliance
    waste_disposal_proper BOOLEAN DEFAULT FALSE,
    recycling_compliant BOOLEAN DEFAULT FALSE,
    
    -- Documentation
    compliance_officer_name VARCHAR(200),
    inspection_date DATE,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INSERT SAMPLE DATA
-- ============================================

-- Insert Service Categories (if not exists)
INSERT INTO fumigation_cleaning_categories (category_name, category_type, description, icon_url) VALUES
    ('General Fumigation', 'fumigation', 'Complete pest elimination for all types of properties', '/icons/fumigation.png'),
    ('Deep Cleaning', 'cleaning', 'Thorough cleaning for move-in/move-out situations', '/icons/cleaning.png'),
    ('Carpet Cleaning', 'cleaning', 'Professional carpet and upholstery cleaning', '/icons/carpet.png'),
    ('Post-Construction Cleaning', 'cleaning', 'Cleaning after construction or renovation work', '/icons/construction.png'),
    ('Rodent Control', 'fumigation', 'Specialized rodent elimination and prevention', '/icons/rodent.png'),
    ('Disinfection Services', 'cleaning', 'Medical-grade disinfection for health safety', '/icons/disinfection.png')
ON CONFLICT (category_name) DO NOTHING;

-- Insert Fumigation Services (if not exists)
INSERT INTO fumigation_cleaning_services (
    category_id, service_name, service_description, property_type, property_size,
    base_price, price_per_sqm, min_price, max_price, duration_hours, team_size,
    equipment_included, chemicals_used, certifications_required, safety_guidelines
) VALUES
    -- General Fumigation Services
    ((SELECT id FROM fumigation_cleaning_categories WHERE category_name = 'General Fumigation'), 
     'Basic Apartment Fumigation', 'Complete pest control for small apartments', 'apartment', 'small',
     15000.00, 200.00, 15000.00, 25000.00, 3.0, 2,
     '["Fogging Machine", "Sprayers", "Protective Gear"]',
     '["Pyrethroid-based insecticide", "IGR (Insect Growth Regulator)"]',
     '["NAFDAC Certified", "Environmental Safety Certified"]',
     'Vacate property for 4 hours after treatment. Keep pets away for 24 hours.'
    ),
    ((SELECT id FROM fumigation_cleaning_categories WHERE category_name = 'General Fumigation'), 
     'Premium House Fumigation', 'Comprehensive fumigation for large houses', 'house', 'large',
     35000.00, 250.00, 35000.00, 60000.00, 6.0, 3,
     '["Industrial Fogger", "Spray Systems", "Full PPE"]',
     '["Professional-grade insecticide", "Residual Spray", "Bait Stations"]',
     '["NAFDAC Certified", "LASEPA Approved", "Safety Certified"]',
     'Property must be vacant for 6 hours. No re-entry for 24 hours for sensitive individuals.'
    ),
    
    -- Deep Cleaning Services
    ((SELECT id FROM fumigation_cleaning_categories WHERE category_name = 'Deep Cleaning'), 
     'Move-In Deep Clean', 'Complete cleaning for new tenants', 'apartment', 'medium',
     20000.00, 150.00, 20000.00, 35000.00, 5.0, 3,
     '["Industrial Vacuum", "Steam Cleaner", "Scrubbers"]',
     '["Eco-friendly cleaners", "Disinfectants", "Degreasers"]',
     '["Cleaning Certification", "Safety Trained"]',
     'Provide access to all areas. Remove personal items from surfaces.'
    ),
    ((SELECT id FROM fumigation_cleaning_categories WHERE category_name = 'Deep Cleaning'), 
     'Move-Out Cleaning', 'Professional cleaning for property handover', 'house', 'large',
     30000.00, 200.00, 30000.00, 50000.00, 8.0, 4,
     '["Pressure Washer", "Window Cleaning Kit", "Floor Polisher"]',
     '["Heavy-duty cleaners", "Stain Removers", "Sanitizers"]',
     '["Professional Cleaning License", "Insurance Certified"]',
     'All personal items must be removed. Provide electricity and water access.'
    )
ON CONFLICT (service_name) DO NOTHING;

-- Insert Service Add-ons (if not exists)
INSERT INTO service_addons (service_id, addon_name, addon_description, addon_price, duration_addition_hours) VALUES
    ((SELECT id FROM fumigation_cleaning_services WHERE service_name = 'Basic Apartment Fumigation'), 
     'Extended Warranty', '6-month pest-free guarantee extension', 5000.00, 0),
    ((SELECT id FROM fumigation_cleaning_services WHERE service_name = 'Basic Apartment Fumigation'), 
     'Follow-up Inspection', 'Post-service inspection after 2 weeks', 3000.00, 1.0),
    ((SELECT id FROM fumigation_cleaning_services WHERE service_name = 'Move-In Deep Clean'), 
     'Carpet Protection', 'Stain protection treatment', 8000.00, 0.5),
    ((SELECT id FROM fumigation_cleaning_services WHERE service_name = 'Move-In Deep Clean'), 
     'Odor Elimination', 'Professional odor removal treatment', 6000.00, 1.0)
ON CONFLICT (service_id, addon_name) DO NOTHING;

-- Insert Service Providers (if not exists)
INSERT INTO service_providers (
    company_name, contact_person, contact_phone, contact_email, 
    license_number, certifications, service_areas, services_offered
) VALUES
    ('CleanPro Services Ltd', 'John Adekunle', '+2348012345678', 'info@