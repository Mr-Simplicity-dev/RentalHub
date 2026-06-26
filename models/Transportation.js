const db = require('../config/middleware/database');

class TransportationService {
  // Get all active transportation services
  static async getAllServices(filters = {}) {
    let query = `
      SELECT * FROM transportation_services 
      WHERE is_active = TRUE
    `;
    const params = [];
    
    if (filters.service_type) {
      query += ` AND service_type = $${params.length + 1}`;
      params.push(filters.service_type);
    }
    
    if (filters.min_capacity) {
      query += ` AND capacity_kg >= $${params.length + 1}`;
      params.push(filters.min_capacity);
    }
    
    query += ` ORDER BY base_price ASC`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Get service by ID
  static async getServiceById(serviceId) {
    const result = await db.query(
      'SELECT * FROM transportation_services WHERE id = $1 AND is_active = TRUE',
      [serviceId]
    );
    return result.rows[0];
  }

  // Create a new transportation booking
  static async createBooking(bookingData) {
    const {
      tenant_id,
      property_id,
      service_id,
      pickup_address,
      destination_address,
      estimated_distance_km,
      booking_date,
      booking_time,
      items_description,
      special_requirements,
      base_price,
      distance_price,
      total_price
    } = bookingData;

    const result = await db.query(
      `INSERT INTO transportation_bookings (
        tenant_id, property_id, service_id,
        pickup_address, destination_address, estimated_distance_km,
        booking_date, booking_time, items_description, special_requirements,
        base_price, distance_price, total_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        tenant_id, property_id, service_id,
        pickup_address, destination_address, estimated_distance_km,
        booking_date, booking_time, items_description, special_requirements,
        base_price, distance_price, total_price
      ]
    );
    
    return result.rows[0];
  }

  // Get tenant's transportation bookings
  static async getTenantBookings(tenantId, filters = {}) {
    let query = `
      SELECT 
        tb.*,
        ts.service_name,
        ts.service_type,
        ts.provider_name,
        p.title as property_title,
        p.full_address as property_address
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      JOIN properties p ON tb.property_id = p.id
      WHERE tb.tenant_id = $1
    `;
    const params = [tenantId];
    
    if (filters.booking_status) {
      query += ` AND tb.booking_status = $${params.length + 1}`;
      params.push(filters.booking_status);
    }
    
    if (filters.payment_status) {
      query += ` AND tb.payment_status = $${params.length + 1}`;
      params.push(filters.payment_status);
    }
    
    query += ` ORDER BY tb.created_at DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Get booking by ID
  static async getBookingById(bookingId) {
    const result = await db.query(
      `SELECT 
        tb.*,
        ts.service_name,
        ts.service_type,
        ts.provider_name,
        ts.provider_phone,
        p.title as property_title,
        p.full_address as property_address,
        u.full_name as tenant_name,
        u.email as tenant_email,
        u.phone as tenant_phone
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      JOIN properties p ON tb.property_id = p.id
      JOIN users u ON tb.tenant_id = u.id
      WHERE tb.id = $1`,
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
      if (updateData.driver_name) {
        updates.push(`driver_name = $${paramCount}`);
        params.push(updateData.driver_name);
        paramCount++;
      }
      if (updateData.driver_phone) {
        updates.push(`driver_phone = $${paramCount}`);
        params.push(updateData.driver_phone);
        paramCount++;
      }
      if (updateData.vehicle_number) {
        updates.push(`vehicle_number = $${paramCount}`);
        params.push(updateData.vehicle_number);
        paramCount++;
      }
    } else if (status === 'in_progress') {
      updates.push(`started_at = CURRENT_TIMESTAMP`);
    } else if (status === 'completed') {
      updates.push(`completed_at = CURRENT_TIMESTAMP`);
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
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    
    params.push(bookingId);
    
    const query = `
      UPDATE transportation_bookings 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await db.query(query, params);
    return result.rows[0];
  }

  // Update payment status
  static async updatePaymentStatus(bookingId, paymentStatus, paymentId = null) {
    const updates = ['payment_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [paymentStatus];
    
    if (paymentId) {
      updates.push('payment_id = $2');
      params.push(paymentId);
      params.push(bookingId);
      
      const query = `
        UPDATE transportation_bookings 
        SET ${updates.join(', ')}
        WHERE id = $3
        RETURNING *
      `;
      
      const result = await db.query(query, params);
      return result.rows[0];
    } else {
      params.push(bookingId);
      
      const query = `
        UPDATE transportation_bookings 
        SET ${updates.join(', ')}
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await db.query(query, params);
      return result.rows[0];
    }
  }

  // Link payment to booking
  static async linkPaymentToBooking(bookingId, paymentId) {
    const result = await db.query(
      `INSERT INTO transportation_payments (booking_id, payment_id)
       VALUES ($1, $2)
       RETURNING *`,
      [bookingId, paymentId]
    );
    return result.rows[0];
  }

    // Check if tenant has paid rent for property
  static async hasPaidRentForProperty(tenantId, propertyId) {
    const result = await db.query(
      `SELECT COUNT(*) as count 
       FROM payments 
       WHERE user_id = $1 
         AND property_id = $2 
         AND payment_type = 'rent_payment' 
         AND payment_status = 'completed'`,
      [tenantId, propertyId]
    );
    
    return parseInt(result.rows[0].count) > 0;
  }

  // Get available booking dates (exclude fully booked dates)
  static async getAvailableBookingDates(serviceId, month, year) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
    
    const result = await db.query(
      `SELECT booking_date, COUNT(*) as bookings_count
       FROM transportation_bookings 
       WHERE service_id = $1 
         AND booking_date BETWEEN $2 AND $3
         AND booking_status NOT IN ('cancelled')
       GROUP BY booking_date
       HAVING COUNT(*) >= 3`, // Limit to 3 bookings per day per service
      [serviceId, startDate, endDate]
    );
    
    const fullyBookedDates = result.rows.map(row => row.booking_date.toISOString().split('T')[0]);
    return { fullyBookedDates };
  }

  // Calculate price for transportation service
  static async calculatePrice(serviceId, distanceKm) {
    const service = await this.getServiceById(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }
    
    const basePrice = parseFloat(service.base_price);
    const pricePerKm = parseFloat(service.price_per_km);
    const distance = parseFloat(distanceKm) || 0;
    
    let distancePrice = 0;
    if (distance > 0) {
      distancePrice = distance * pricePerKm;
    }
    
    const totalPrice = basePrice + distancePrice;
    
    return {
      base_price: basePrice,
      distance_price: distancePrice,
      total_price: totalPrice,
      service_name: service.service_name,
      service_type: service.service_type
    };
  }

  // Get transportation statistics for dashboard
  static async getTenantTransportStats(tenantId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN booking_status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as paid_bookings,
        COALESCE(SUM(total_price), 0) as total_spent
       FROM transportation_bookings 
       WHERE tenant_id = $1`,
      [tenantId]
    );
    
    return result.rows[0];
  }

  // Get upcoming bookings for tenant
  static async getUpcomingBookings(tenantId, limit = 5) {
    const result = await db.query(
      `SELECT 
        tb.*,
        ts.service_name,
        ts.service_type,
        p.title as property_title
       FROM transportation_bookings tb
       JOIN transportation_services ts ON tb.service_id = ts.id
       JOIN properties p ON tb.property_id = p.id
       WHERE tb.tenant_id = $1 
         AND tb.booking_date >= CURRENT_DATE
         AND tb.booking_status NOT IN ('cancelled', 'completed')
       ORDER BY tb.booking_date ASC, tb.booking_time ASC
       LIMIT $2`,
      [tenantId, limit]
    );
    
    return result.rows;
  }

  // Check if tenant can book transportation (has paid rent)
  static async canBookTransportation(tenantId, propertyId) {
    const hasPaidRent = await this.hasPaidRentForProperty(tenantId, propertyId);
    
    if (!hasPaidRent) {
      return {
        can_book: false,
        reason: 'You need to complete rent payment for this property before booking transportation'
      };
    }
    
    // Check for existing active bookings
    const existingBookings = await db.query(
      `SELECT COUNT(*) as count 
       FROM transportation_bookings 
       WHERE tenant_id = $1 
         AND property_id = $2 
         AND booking_status NOT IN ('cancelled', 'completed')`,
      [tenantId, propertyId]
    );
    
    if (parseInt(existingBookings.rows[0].count) > 0) {
      return {
        can_book: false,
        reason: 'You already have an active transportation booking for this property'
      };
    }
    
    return {
      can_book: true,
      reason: ''
    };
  }

  // Get booking by payment reference
  static async getBookingByPaymentId(paymentId) {
    const result = await db.query(
      `SELECT tb.* 
       FROM transportation_bookings tb
       JOIN transportation_payments tp ON tb.id = tp.booking_id
       WHERE tp.payment_id = $1`,
      [paymentId]
    );
    
    return result.rows[0];
  }
}

module.exports = TransportationService;
