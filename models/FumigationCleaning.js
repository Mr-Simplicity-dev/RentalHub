const db = require('../config/middleware/database');
const { v4: uuidv4 } = require('uuid');

class FumigationCleaningService {
  static operationsSchemaReady = false;

  static async ensureOperationsSchema() {
    if (this.operationsSchemaReady) return;

    await db.query(`
      ALTER TABLE booking_provider_assignments
        DROP CONSTRAINT IF EXISTS booking_provider_assignments_assignment_status_check
    `);
    await db.query(`
      ALTER TABLE booking_provider_assignments
        ADD CONSTRAINT booking_provider_assignments_assignment_status_check
        CHECK (assignment_status IN ('assigned', 'accepted', 'declined', 'in_progress', 'completed'))
    `);
    await db.query(`
      ALTER TABLE booking_provider_assignments
        ADD COLUMN IF NOT EXISTS arrival_confirmed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS completion_confirmed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS arrival_proof_url TEXT,
        ADD COLUMN IF NOT EXISTS completion_proof_url TEXT,
        ADD COLUMN IF NOT EXISTS operations_note TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS fumigation_booking_operations (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES fumigation_cleaning_bookings(id) ON DELETE CASCADE,
        provider_id INTEGER REFERENCES service_providers(id) ON DELETE SET NULL,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        actor_name VARCHAR(255),
        event_type VARCHAR(80) NOT NULL,
        note TEXT,
        proof_url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_fc_booking_operations_booking
      ON fumigation_booking_operations(booking_id, created_at DESC)
    `);

    this.operationsSchemaReady = true;
  }

  // ============ SERVICE CATALOG METHODS ============

  // Get all service categories
  static async getAllCategories(filters = {}) {
    let query = 'SELECT * FROM fumigation_cleaning_categories WHERE is_active = TRUE';
    const params = [];
    
    if (filters.category_type) {
      query += ` AND category_type = $${params.length + 1}`;
      params.push(filters.category_type);
    }
    
    query += ' ORDER BY category_name ASC';
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Get all active services with optional filters
  static async getAllServices(filters = {}) {
    let query = `
      SELECT 
        fcs.*,
        fcc.category_name,
        fcc.category_type
      FROM fumigation_cleaning_services fcs
      JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
      WHERE fcs.is_active = TRUE
    `;
    const params = [];
    
    if (filters.category_id) {
      query += ` AND fcs.category_id = $${params.length + 1}`;
      params.push(filters.category_id);
    }
    
    if (filters.category_type) {
      query += ` AND fcc.category_type = $${params.length + 1}`;
      params.push(filters.category_type);
    }
    
    if (filters.property_type) {
      query += ` AND fcs.property_type = $${params.length + 1}`;
      params.push(filters.property_type);
    }
    
    if (filters.property_size) {
      query += ` AND fcs.property_size = $${params.length + 1}`;
      params.push(filters.property_size);
    }
    
    if (filters.min_price || filters.max_price) {
      if (filters.min_price) {
        query += ` AND fcs.base_price >= $${params.length + 1}`;
        params.push(filters.min_price);
      }
      if (filters.max_price) {
        query += ` AND fcs.base_price <= $${params.length + 1}`;
        params.push(filters.max_price);
      }
    }
    
    query += ' ORDER BY fcs.display_order ASC, fcs.service_name ASC';
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Get service by ID with details
  static async getServiceById(serviceId) {
    const result = await db.query(
      `SELECT 
        fcs.*,
        fcc.category_name,
        fcc.category_type,
        json_agg(
          json_build_object(
            'id', sa.id,
            'addon_name', sa.addon_name,
            'addon_description', sa.addon_description,
            'addon_price', sa.addon_price,
            'duration_addition_hours', sa.duration_addition_hours
          )
        ) FILTER (WHERE sa.id IS NOT NULL) as addons
      FROM fumigation_cleaning_services fcs
      JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
      LEFT JOIN service_addons sa ON fcs.id = sa.service_id AND sa.is_active = TRUE
      WHERE fcs.id = $1 AND fcs.is_active = TRUE
      GROUP BY fcs.id, fcc.id`,
      [serviceId]
    );
    return result.rows[0];
  }

  // Get addons for a service
  static async getServiceAddons(serviceId) {
    const result = await db.query(
      'SELECT * FROM service_addons WHERE service_id = $1 AND is_active = TRUE ORDER BY addon_name ASC',
      [serviceId]
    );
    return result.rows;
  }

  // ============ BOOKING METHODS ============

  // Create a new booking
  static async createBooking(bookingData) {
    const {
      tenant_id,
      property_id,
      service_id,
      booking_date,
      preferred_time_slot,
      specific_time,
      property_size_sqm,
      number_of_rooms,
      property_condition,
      special_instructions,
      selected_addons,
      base_service_price,
      addons_total_price,
      discount_amount,
      total_price
    } = bookingData;

    // Generate unique booking reference
    const booking_reference = `FC-${uuidv4().substring(0, 8).toUpperCase()}`;

    const result = await db.query(
      `INSERT INTO fumigation_cleaning_bookings (
        tenant_id, property_id, service_id, booking_reference,
        booking_date, preferred_time_slot, specific_time,
        property_size_sqm, number_of_rooms, property_condition,
        special_instructions, selected_addons,
        base_service_price, addons_total_price, discount_amount, total_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        tenant_id, property_id, service_id, booking_reference,
        booking_date, preferred_time_slot, specific_time,
        property_size_sqm, number_of_rooms, property_condition,
        special_instructions, JSON.stringify(selected_addons || []),
        base_service_price, addons_total_price, discount_amount, total_price
      ]
    );
    
    return result.rows[0];
  }

  // Get tenant's bookings
  static async getTenantBookings(tenantId, filters = {}) {
    let query = `
      SELECT 
        fcb.*,
        fcs.service_name,
        fcc.category_name,
        fcc.category_type,
        p.title as property_title,
        p.full_address as property_address,
        jsonb_array_length(fcb.selected_addons) as addons_count
      FROM fumigation_cleaning_bookings fcb
      JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
      JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
      JOIN properties p ON fcb.property_id = p.id
      WHERE fcb.tenant_id = $1
    `;
    const params = [tenantId];
    
    if (filters.booking_status) {
      query += ` AND fcb.booking_status = $${params.length + 1}`;
      params.push(filters.booking_status);
    }
    
    if (filters.payment_status) {
      query += ` AND fcb.payment_status = $${params.length + 1}`;
      params.push(filters.payment_status);
    }
    
    if (filters.start_date) {
      query += ` AND fcb.booking_date >= $${params.length + 1}`;
      params.push(filters.start_date);
    }
    
    if (filters.end_date) {
      query += ` AND fcb.booking_date <= $${params.length + 1}`;
      params.push(filters.end_date);
    }
    
    query += ` ORDER BY fcb.booking_date DESC, fcb.created_at DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Get booking by ID with full details
  static async getBookingById(bookingId) {
    const result = await db.query(
      `SELECT 
        fcb.*,
        fcs.service_name,
        fcs.service_description,
        fcs.duration_hours,
        fcs.team_size,
        fcc.category_name,
        fcc.category_type,
        p.title as property_title,
        p.full_address as property_address,
        p.property_type as property_type,
        p.bedrooms,
        p.bathrooms,
        u.full_name as tenant_name,
        u.email as tenant_email,
        u.phone as tenant_phone,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', sa.id,
              'addon_name', sa.addon_name,
              'addon_price', sa.addon_price
            )
          ) FILTER (WHERE sa.id IS NOT NULL), '[]'
        ) as addon_details
      FROM fumigation_cleaning_bookings fcb
      JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
      JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
      JOIN properties p ON fcb.property_id = p.id
      JOIN users u ON fcb.tenant_id = u.id
      LEFT JOIN service_addons sa ON sa.id = ANY(
        SELECT jsonb_array_elements_text(fcb.selected_addons)::integer
      )
      WHERE fcb.id = $1
      GROUP BY fcb.id, fcs.id, fcc.id, p.id, u.id`,
      [bookingId]
    );
    return result.rows[0];
  }

  // Update booking status
  static async updateBookingStatus(bookingId, status, updateData = {}) {
    const updates = [];
    const params = [];
    let paramCount = 1;
    
    updates.push(`booking_status = $${paramCount}`);
    params.push(status);
    paramCount++;
    
    // Add timestamp based on status
    if (status === 'confirmed') {
      updates.push(`confirmed_at = CURRENT_TIMESTAMP`);
      if (updateData.assigned_team_leader) {
        updates.push(`assigned_team_leader = $${paramCount}`);
        params.push(updateData.assigned_team_leader);
        paramCount++;
      }
      if (updateData.team_contact_phone) {
        updates.push(`team_contact_phone = $${paramCount}`);
        params.push(updateData.team_contact_phone);
        paramCount++;
      }
      if (updateData.assigned_team_members) {
        updates.push(`assigned_team_members = $${paramCount}`);
        params.push(JSON.stringify(updateData.assigned_team_members));
        paramCount++;
      }
    } else if (status === 'scheduled') {
      updates.push(`scheduled_at = CURRENT_TIMESTAMP`);
    } else if (status === 'in_progress') {
      updates.push(`service_start_time = CURRENT_TIMESTAMP`);
    } else if (status === 'completed') {
      updates.push(`service_end_time = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP`);
      if (updateData.actual_duration_hours) {
        updates.push(`actual_duration_hours = $${paramCount}`);
        params.push(updateData.actual_duration_hours);
        paramCount++;
      }
      if (updateData.chemicals_used_list) {
        updates.push(`chemicals_used_list = $${paramCount}`);
        params.push(JSON.stringify(updateData.chemicals_used_list));
        paramCount++;
      }
      if (updateData.equipment_used_list) {
        updates.push(`equipment_used_list = $${paramCount}`);
        params.push(JSON.stringify(updateData.equipment_used_list));
        paramCount++;
      }
    } else if (status === 'cancelled') {
      updates.push(`cancelled_at = CURRENT_TIMESTAMP`);
      if (updateData.cancellation_reason) {
        updates.push(`cancellation_reason = $${paramCount}`);
        params.push(updateData.cancellation_reason);
        paramCount++;
      }
      if (updateData.cancelled_by) {
        updates.push(`cancelled_by = $${paramCount}`);
        params.push(updateData.cancelled_by);
        paramCount++;
      }
      if (updateData.cancellation_fee) {
        updates.push(`cancellation_fee = $${paramCount}`);
        params.push(updateData.cancellation_fee);
        paramCount++;
      }
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(bookingId);
    
    const query = `
      UPDATE fumigation_cleaning_bookings 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await db.query(query, params);
    return result.rows[0];
  }

  // Update payment status
  static async updatePaymentStatus(bookingId, paymentStatus, paymentData = {}) {
    const updates = ['payment_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [paymentStatus];
    
    if (paymentData.payment_reference) {
      updates.push('payment_reference = $2');
      params.push(paymentData.payment_reference);
    }
    
    params.push(bookingId);
    
    const query = `
      UPDATE fumigation_cleaning_bookings 
      SET ${updates.join(', ')}
      WHERE id = $${params.length}
      RETURNING *
    `;
    
    const result = await db.query(query, params);
    return result.rows[0];
  }

  // ============ PRICE CALCULATION METHODS ============

  // Calculate service price
  static async calculateServicePrice(serviceId, propertySizeSqm = null, selectedAddons = []) {
    const service = await this.getServiceById(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }
    
    let basePrice = parseFloat(service.base_price);
    
    // Adjust price based on property size if price_per_sqm is set
    if (propertySizeSqm && service.price_per_sqm) {
      const sizePrice = parseFloat(propertySizeSqm) * parseFloat(service.price_per_sqm);
      basePrice = Math.max(parseFloat(service.min_price), sizePrice);
      
      if (service.max_price) {
        basePrice = Math.min(basePrice, parseFloat(service.max_price));
      }
    }
    
    // Calculate addons total
    let addonsTotal = 0;
    let addonDetails = [];
    
    if (selectedAddons && selectedAddons.length > 0) {
      const addonsResult = await db.query(
        'SELECT id, addon_name, addon_price FROM service_addons WHERE id = ANY($1) AND is_active = TRUE',
        [selectedAddons]
      );
      
      addonDetails = addonsResult.rows;
      addonsTotal = addonDetails.reduce((sum, addon) => sum + parseFloat(addon.addon_price), 0);
    }
    
    const totalPrice = basePrice + addonsTotal;
    
    return {
      base_price: basePrice,
      addons_total: addonsTotal,
      total_price: totalPrice,
      service_details: {
        service_name: service.service_name,
        duration_hours: service.duration_hours,
        team_size: service.team_size
      },
      addon_details: addonDetails
    };
  }

  // ============ ELIGIBILITY & VALIDATION METHODS ============

  // Check if tenant can book service
  static async checkBookingEligibility(tenantId, propertyId) {
    // Check if tenant has paid rent for the property
    const hasPaidRent = await db.query(
      `SELECT COUNT(*) as count 
       FROM payments 
       WHERE user_id = $1 
         AND property_id = $2 
         AND payment_type = 'rent_payment' 
         AND payment_status = 'completed'`,
      [tenantId, propertyId]
    );
    
    if (parseInt(hasPaidRent.rows[0].count) === 0) {
      return {
        can_book: false,
        reason: 'You need to complete rent payment for this property before booking fumigation/cleaning services'
      };
    }
    
    // Check for existing active bookings
    const existingBookings = await db.query(
      `SELECT COUNT(*) as count 
       FROM fumigation_cleaning_bookings 
       WHERE tenant_id = $1 
         AND property_id = $2 
         AND booking_status NOT IN ('cancelled', 'completed')`,
      [tenantId, propertyId]
    );
    
    if (parseInt(existingBookings.rows[0].count) > 0) {
      return {
        can_book: false,
        reason: 'You already have an active fumigation/cleaning booking for this property'
      };
    }
    
    return {
      can_book: true,
      reason: ''
    };
  }

  // Get available booking dates
  static async getAvailableBookingDates(serviceId, month, year) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
    
    const result = await db.query(
      `SELECT booking_date, COUNT(*) as bookings_count
       FROM fumigation_cleaning_bookings 
       WHERE service_id = $1 
         AND booking_date BETWEEN $2 AND $3
         AND booking_status NOT IN ('cancelled')
       GROUP BY booking_date
       HAVING COUNT(*) >= 5`, // Limit to 5 bookings per day per service
      [serviceId, startDate, endDate]
    );
    
    const fullyBookedDates = result.rows.map(row => row.booking_date.toISOString().split('T')[0]);
    return { fullyBookedDates };
  }

  // ============ DASHBOARD STATISTICS ============

  // Get tenant service statistics
  static async getTenantStats(tenantId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN booking_status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as paid_bookings,
        COALESCE(SUM(total_price), 0) as total_spent,
        COUNT(DISTINCT service_id) as unique_services_used
       FROM fumigation_cleaning_bookings 
       WHERE tenant_id = $1`,
      [tenantId]
    );
    
    return result.rows[0];
  }

    // Get upcoming bookings
  static async getUpcomingBookings(tenantId, limit = 5) {
    const result = await db.query(
      `SELECT 
        fcb.*,
        fcs.service_name,
        fcc.category_name,
        fcc.category_type,
        p.title as property_title
       FROM fumigation_cleaning_bookings fcb
       JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
       JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
       JOIN properties p ON fcb.property_id = p.id
       WHERE fcb.tenant_id = $1 
         AND fcb.booking_date >= CURRENT_DATE
         AND fcb.booking_status NOT IN ('cancelled', 'completed')
       ORDER BY fcb.booking_date ASC, 
                CASE fcb.preferred_time_slot 
                  WHEN 'morning' THEN 1
                  WHEN 'afternoon' THEN 2
                  WHEN 'evening' THEN 3
                  WHEN 'specific' THEN 4
                  ELSE 5
                END ASC
       LIMIT $2`,
      [tenantId, limit]
    );
    
    return result.rows;
  }

  // ============ PAYMENT METHODS ============

  // Create payment record
  static async createPaymentRecord(paymentData) {
    const {
      booking_id,
      payment_reference,
      payment_method,
      amount,
      currency = 'NGN',
      gateway_response = null
    } = paymentData;

    const result = await db.query(
      `INSERT INTO fumigation_payments (
        booking_id, payment_reference, payment_method,
        amount, currency, gateway_response
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        booking_id, payment_reference, payment_method,
        amount, currency, JSON.stringify(gateway_response)
      ]
    );
    
    return result.rows[0];
  }

  // Get payment by reference
  static async getPaymentByReference(paymentReference) {
    const result = await db.query(
      `SELECT 
        fp.*,
        fcb.booking_reference,
        fcb.tenant_id,
        fcb.total_price
       FROM fumigation_payments fp
       JOIN fumigation_cleaning_bookings fcb ON fp.booking_id = fcb.id
       WHERE fp.payment_reference = $1`,
      [paymentReference]
    );
    
    return result.rows[0];
  }

  // Update payment status
  static async updatePaymentStatus(paymentId, status, gatewayResponse = null) {
    const updates = ['payment_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];
    
    if (status === 'completed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }
    
    if (gatewayResponse) {
      updates.push('gateway_response = $2');
      params.push(JSON.stringify(gatewayResponse));
      params.push(paymentId);
      
      const query = `
        UPDATE fumigation_payments 
        SET ${updates.join(', ')}
        WHERE id = $3
        RETURNING *
      `;
      
      const result = await db.query(query, params);
      return result.rows[0];
    } else {
      params.push(paymentId);
      
      const query = `
        UPDATE fumigation_payments 
        SET ${updates.join(', ')}
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await db.query(query, params);
      return result.rows[0];
    }
  }

  // ============ SERVICE PROVIDER METHODS ============

  // Get available service providers for a service
  static async getAvailableProviders(serviceId, stateCode) {
    const result = await db.query(
      `SELECT 
        sp.*,
        COALESCE(AVG(sr.overall_rating), 0) as avg_rating,
        COUNT(sr.id) as total_reviews
       FROM service_providers sp
       LEFT JOIN service_reviews sr ON sp.id = sr.provider_id
       WHERE sp.is_active = TRUE
         AND $1::integer = ANY(sp.services_offered)
         AND $2::text = ANY(sp.service_areas)
       GROUP BY sp.id
       ORDER BY avg_rating DESC, sp.total_jobs_completed DESC`,
      [serviceId, stateCode]
    );
    
    return result.rows;
  }

  // Assign provider to booking
  static async assignProviderToBooking(bookingId, providerId) {
    await this.ensureOperationsSchema();
    const result = await db.query(
      `INSERT INTO booking_provider_assignments (booking_id, provider_id)
       VALUES ($1, $2)
       RETURNING *`,
      [bookingId, providerId]
    );
    
    return result.rows[0];
  }

  static async getLatestProviderAssignment(bookingId) {
    await this.ensureOperationsSchema();
    const result = await db.query(
      `SELECT bpa.*, sp.company_name, sp.contact_person, sp.contact_phone, sp.contact_email, sp.service_specialization
       FROM booking_provider_assignments bpa
       JOIN service_providers sp ON sp.id = bpa.provider_id
       WHERE bpa.booking_id = $1
       ORDER BY bpa.assigned_at DESC, bpa.id DESC
       LIMIT 1`,
      [bookingId]
    );

    return result.rows[0];
  }

  static async updateProviderAssignmentLifecycle(bookingId, lifecycleData = {}) {
    await this.ensureOperationsSchema();
    const { status, note, proof_url } = lifecycleData;
    const updates = ['assignment_status = $1', 'operations_note = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status, note || null];
    let paramCount = 3;

    if (status === 'accepted') {
      updates.push('accepted_at = CURRENT_TIMESTAMP');
    }

    if (status === 'declined') {
      updates.push('declined_at = CURRENT_TIMESTAMP', 'declined_reason = $' + paramCount);
      params.push(note || null);
      paramCount++;
    }

    if (status === 'in_progress') {
      updates.push('arrival_confirmed_at = CURRENT_TIMESTAMP');
      if (proof_url) {
        updates.push('arrival_proof_url = $' + paramCount);
        params.push(proof_url);
        paramCount++;
      }
    }

    if (status === 'completed') {
      updates.push('completion_confirmed_at = CURRENT_TIMESTAMP');
      if (proof_url) {
        updates.push('completion_proof_url = $' + paramCount);
        params.push(proof_url);
        paramCount++;
      }
    }

    params.push(bookingId);

    const result = await db.query(
      `UPDATE booking_provider_assignments
       SET ${updates.join(', ')}
       WHERE id = (
         SELECT id FROM booking_provider_assignments
         WHERE booking_id = $${paramCount}
         ORDER BY assigned_at DESC, id DESC
         LIMIT 1
       )
       RETURNING *`,
      params
    );

    return result.rows[0];
  }

  static async createBookingOperation(operationData) {
    await this.ensureOperationsSchema();
    const {
      booking_id,
      provider_id,
      actor_id,
      actor_name,
      event_type,
      note,
      proof_url,
      metadata = {}
    } = operationData;

    const result = await db.query(
      `INSERT INTO fumigation_booking_operations (
        booking_id, provider_id, actor_id, actor_name, event_type, note, proof_url, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        booking_id,
        provider_id || null,
        actor_id || null,
        actor_name || null,
        event_type,
        note || null,
        proof_url || null,
        JSON.stringify(metadata || {})
      ]
    );

    return result.rows[0];
  }

  static async getBookingOperations(bookingId) {
    await this.ensureOperationsSchema();
    const result = await db.query(
      `SELECT fbo.*, sp.company_name AS provider_name
       FROM fumigation_booking_operations fbo
       LEFT JOIN service_providers sp ON sp.id = fbo.provider_id
       WHERE fbo.booking_id = $1
       ORDER BY fbo.created_at DESC, fbo.id DESC`,
      [bookingId]
    );

    return result.rows;
  }

  // ============ REVIEW & FEEDBACK METHODS ============

  // Submit service review
  static async submitReview(reviewData) {
    const {
      booking_id,
      tenant_id,
      service_id,
      provider_id,
      overall_rating,
      professionalism_rating,
      quality_rating,
      timeliness_rating,
      review_title,
      review_text,
      photos_urls = []
    } = reviewData;

    const result = await db.query(
      `INSERT INTO service_reviews (
        booking_id, tenant_id, service_id, provider_id,
        overall_rating, professionalism_rating, quality_rating, timeliness_rating,
        review_title, review_text, photos_urls
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        booking_id, tenant_id, service_id, provider_id,
        overall_rating, professionalism_rating, quality_rating, timeliness_rating,
        review_title, review_text, JSON.stringify(photos_urls)
      ]
    );
    
    return result.rows[0];
  }

  // Get service reviews
  static async getServiceReviews(serviceId, filters = {}) {
    let query = `
      SELECT 
        sr.*,
        u.full_name as reviewer_name,
        u.profile_picture as reviewer_photo,
        sp.company_name as provider_name
      FROM service_reviews sr
      JOIN users u ON sr.tenant_id = u.id
      LEFT JOIN service_providers sp ON sr.provider_id = sp.id
      WHERE sr.service_id = $1 AND sr.is_approved = TRUE
    `;
    const params = [serviceId];
    
    if (filters.min_rating) {
      query += ` AND sr.overall_rating >= $${params.length + 1}`;
      params.push(filters.min_rating);
    }
    
    if (filters.provider_id) {
      query += ` AND sr.provider_id = $${params.length + 1}`;
      params.push(filters.provider_id);
    }
    
    query += ` ORDER BY 
      CASE WHEN sr.is_featured = TRUE THEN 0 ELSE 1 END,
      sr.created_at DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // ============ SAFETY COMPLIANCE METHODS ============

  // Create safety compliance record
  static async createSafetyComplianceRecord(complianceData) {
    const {
      booking_id,
      provider_id,
      safety_briefing_completed = false,
      ppe_used = false,
      area_secured = false,
      warning_signs_posted = false,
      ventilation_adequate = false,
      msds_available = false,
      proper_storage = false,
      spill_kit_available = false,
      waste_disposal_proper = false,
      recycling_compliant = false,
      compliance_officer_name,
      inspection_date,
      notes = ''
    } = complianceData;

    const result = await db.query(
      `INSERT INTO safety_compliance_records (
        booking_id, provider_id,
        safety_briefing_completed, ppe_used, area_secured,
        warning_signs_posted, ventilation_adequate,
        msds_available, proper_storage, spill_kit_available,
        waste_disposal_proper, recycling_compliant,
        compliance_officer_name, inspection_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        booking_id, provider_id,
        safety_briefing_completed, ppe_used, area_secured,
        warning_signs_posted, ventilation_adequate,
        msds_available, proper_storage, spill_kit_available,
        waste_disposal_proper, recycling_compliant,
        compliance_officer_name, inspection_date, notes
      ]
    );
    
    return result.rows[0];
  }

  // Get compliance record for booking
  static async getComplianceRecord(bookingId) {
    const result = await db.query(
      `SELECT scr.*, sp.company_name
       FROM safety_compliance_records scr
       JOIN service_providers sp ON scr.provider_id = sp.id
       WHERE scr.booking_id = $1`,
      [bookingId]
    );
    
    return result.rows[0];
  }

  // ============ ADMIN METHODS ============

  // Get all bookings for admin (with filters)
  static async getAllBookings(filters = {}) {
    await this.ensureOperationsSchema();
    let query = `
      SELECT 
        fcb.*,
        fcs.service_name,
        fcc.category_name,
        fcc.category_type,
        p.title as property_title,
        p.full_address as property_address,
        u.full_name as tenant_name,
        u.email as tenant_email,
        u.phone as tenant_phone,
        CASE
          WHEN sp.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', sp.id,
            'company_name', sp.company_name,
            'contact_person', sp.contact_person,
            'contact_phone', sp.contact_phone,
            'contact_email', sp.contact_email,
            'service_specialization', sp.service_specialization,
            'assignment_status', bpa.assignment_status,
            'accepted_at', bpa.accepted_at,
            'declined_at', bpa.declined_at,
            'declined_reason', bpa.declined_reason,
            'arrival_confirmed_at', bpa.arrival_confirmed_at,
            'completion_confirmed_at', bpa.completion_confirmed_at,
            'arrival_proof_url', bpa.arrival_proof_url,
            'completion_proof_url', bpa.completion_proof_url,
            'operations_note', bpa.operations_note
          )
        END as assigned_provider
      FROM fumigation_cleaning_bookings fcb
      JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
      JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
      JOIN properties p ON fcb.property_id = p.id
      JOIN users u ON fcb.tenant_id = u.id
      LEFT JOIN LATERAL (
        SELECT *
        FROM booking_provider_assignments
        WHERE booking_id = fcb.id
        ORDER BY assigned_at DESC, id DESC
        LIMIT 1
      ) bpa ON TRUE
      LEFT JOIN service_providers sp ON sp.id = bpa.provider_id
      WHERE 1=1
    `;
    const params = [];
    
    if (filters.booking_status) {
      query += ` AND fcb.booking_status = $${params.length + 1}`;
      params.push(filters.booking_status);
    }
    
    if (filters.payment_status) {
      query += ` AND fcb.payment_status = $${params.length + 1}`;
      params.push(filters.payment_status);
    }
    
    if (filters.start_date) {
      query += ` AND fcb.booking_date >= $${params.length + 1}`;
      params.push(filters.start_date);
    }
    
    if (filters.end_date) {
      query += ` AND fcb.booking_date <= $${params.length + 1}`;
      params.push(filters.end_date);
    }
    
    if (filters.service_type) {
      query += ` AND fcc.category_type = $${params.length + 1}`;
      params.push(filters.service_type);
    }
    
    if (filters.search) {
      query += ` AND (
        fcb.booking_reference ILIKE $${params.length + 1} OR
        u.full_name ILIKE $${params.length + 1} OR
        u.email ILIKE $${params.length + 1} OR
        p.title ILIKE $${params.length + 1}
      )`;
      params.push(`%${filters.search}%`);
    }
    
    query += ` ORDER BY fcb.created_at DESC`;
    
    if (filters.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(filters.limit);
    }
    
    if (filters.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(filters.offset);
    }
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Get booking statistics for admin dashboard
  static async getAdminStats(filters = {}) {
    let query = `
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN booking_status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN booking_status = 'cancelled' THEN 1 END) as cancelled_bookings,
        COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as paid_bookings,
        COALESCE(SUM(total_price), 0) as total_revenue,
        COUNT(DISTINCT tenant_id) as unique_customers,
        COUNT(DISTINCT service_id) as unique_services_booked
      FROM fumigation_cleaning_bookings
      WHERE 1=1
    `;
    const params = [];
    
    if (filters.start_date) {
      query += ` AND booking_date >= $${params.length + 1}`;
      params.push(filters.start_date);
    }
    
    if (filters.end_date) {
      query += ` AND booking_date <= $${params.length + 1}`;
      params.push(filters.end_date);
    }
    
    const result = await db.query(query, params);
    return result.rows[0];
  }

  // ============ UTILITY METHODS ============

  // Generate booking reference
  static generateBookingReference() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `FC-${timestamp}-${random}`.toUpperCase();
  }

  // Validate booking date and time
  static validateBookingDateTime(bookingDate, preferredTimeSlot, specificTime = null) {
    const today = new Date();
    const selectedDate = new Date(bookingDate);
    
    // Cannot book for past dates
    if (selectedDate < today.setHours(0, 0, 0, 0)) {
      return { valid: false, error: 'Cannot book for past dates' };
    }
    
    // Cannot book same day (need at least 24 hours notice)
    const oneDay = 24 * 60 * 60 * 1000;
    if (selectedDate.getTime() - today.getTime() < oneDay) {
      return { valid: false, error: 'Need at least 24 hours advance booking' };
    }
    
    // Validate specific time if provided
    if (preferredTimeSlot === 'specific' && specificTime) {
      const [hours, minutes] = specificTime.split(':').map(Number);
      if (hours < 8 || hours > 18) {
        return { valid: false, error: 'Service hours are between 8 AM and 6 PM' };
      }
    }
    
    return { valid: true, error: null };
  }
}

module.exports = FumigationCleaningService;
