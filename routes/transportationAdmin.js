const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const db = require('../config/middleware/database');

const TRANSPORTATION_ADMIN_ROLES = new Set([
  'admin',
  'lga_admin',
  'state_admin',
  'state_financial_admin',
  'state_support_admin',
  'super_admin',
  'super_financial_admin',
  'super_support_admin',
  'transportation_admin',
  'lga_transportation_admin',
  'state_transportation_admin',
  'super_transportation_admin',
]);

const requireTransportationAdminAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!TRANSPORTATION_ADMIN_ROLES.has(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Transportation admin access only',
    });
  }

  return next();
};

let transportationOperationsSchemaReady = false;

const getActorName = (user) =>
  user?.full_name || user?.name || user?.email || user?.username || `User ${user?.id || ''}`.trim();

const ensureTransportationOperationsSchema = async () => {
  if (transportationOperationsSchemaReady) return;

  await db.query(`
    ALTER TABLE transportation_bookings
      ADD COLUMN IF NOT EXISTS admin_notes TEXT,
      ADD COLUMN IF NOT EXISTS pickup_confirmed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS dropoff_confirmed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS pickup_proof_url TEXT,
      ADD COLUMN IF NOT EXISTS dropoff_proof_url TEXT,
      ADD COLUMN IF NOT EXISTS dispatch_notes TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS transportation_booking_operations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES transportation_bookings(id) ON DELETE CASCADE,
      admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      proof_url TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_transportation_operations_booking
    ON transportation_booking_operations(booking_id, created_at DESC)
  `);

  transportationOperationsSchemaReady = true;
};

const createTransportationOperation = async ({
  bookingId,
  adminId,
  actorName,
  eventType,
  note,
  proofUrl,
  metadata = {}
}) => {
  await ensureTransportationOperationsSchema();
  await db.query(
    `INSERT INTO transportation_booking_operations (
      booking_id, admin_id, actor_name, event_type, note, proof_url, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      bookingId,
      adminId || null,
      actorName || null,
      eventType,
      note || null,
      proofUrl || null,
      JSON.stringify(metadata || {})
    ]
  );
};

// ====================== AUTHENTICATION ======================
router.use(authenticate);
router.use(requireTransportationAdminAccess);

// ====================== TRANSPORTATION ADMIN DASHBOARD ======================

/**
 * Get transportation admin dashboard overview
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [
      overallStats,
      serviceStats,
      revenueStats,
      recentBookings,
      topProperties,
      topTenants
    ] = await Promise.all([
      // Overall statistics
      db.query(`
        SELECT 
          COUNT(*) as total_bookings,
          COUNT(CASE WHEN booking_status = 'pending' THEN 1 END) as pending_bookings,
          COUNT(CASE WHEN booking_status = 'confirmed' THEN 1 END) as confirmed_bookings,
          COUNT(CASE WHEN booking_status = 'in_progress' THEN 1 END) as in_progress_bookings,
          COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_bookings,
          COUNT(CASE WHEN booking_status = 'cancelled' THEN 1 END) as cancelled_bookings,
          COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_payments,
          COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as completed_payments,
          COUNT(CASE WHEN payment_status = 'failed' THEN 1 END) as failed_payments,
          COALESCE(SUM(total_price), 0) as total_revenue,
          COALESCE(AVG(total_price), 0) as avg_booking_value,
          COUNT(DISTINCT tenant_id) as unique_tenants,
          COUNT(DISTINCT property_id) as unique_properties
        FROM transportation_bookings
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      `),
      
      // Service type statistics
      db.query(`
        SELECT 
          ts.service_type,
          ts.service_name,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as total_revenue,
          AVG(tb.total_price) as avg_price
        FROM transportation_bookings tb
        JOIN transportation_services ts ON tb.service_id = ts.id
        WHERE tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY ts.service_type, ts.service_name
        ORDER BY booking_count DESC
      `),
      
      // Revenue statistics by date
      db.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as booking_count,
          COALESCE(SUM(total_price), 0) as daily_revenue
        FROM transportation_bookings
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
          AND payment_status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `),
      
      // Recent bookings
      db.query(`
        SELECT 
          tb.*,
          ts.service_name,
          ts.service_type,
          p.title as property_title,
          u.full_name as tenant_name,
          u.email as tenant_email
        FROM transportation_bookings tb
        JOIN transportation_services ts ON tb.service_id = ts.id
        JOIN properties p ON tb.property_id = p.id
        JOIN users u ON tb.tenant_id = u.id
        ORDER BY tb.created_at DESC
        LIMIT 10
      `),
      
      // Top properties by transportation bookings
      db.query(`
        SELECT 
          p.id,
          p.title,
          s.state_name AS state,
          p.city,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as total_revenue
        FROM transportation_bookings tb
        JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        WHERE tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY p.id, p.title, s.state_name, p.city
        ORDER BY booking_count DESC
        LIMIT 10
      `),
      
      // Top tenants by transportation usage
      db.query(`
        SELECT 
          u.id,
          u.full_name,
          u.email,
          u.phone,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as total_spent
        FROM transportation_bookings tb
        JOIN users u ON tb.tenant_id = u.id
        WHERE tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY u.id, u.full_name, u.email, u.phone
        ORDER BY booking_count DESC
        LIMIT 10
      `)
    ]);
    
    res.json({
      success: true,
      data: {
        overview: overallStats.rows[0],
        service_analytics: serviceStats.rows,
        revenue_trends: revenueStats.rows,
        recent_bookings: recentBookings.rows,
        top_properties: topProperties.rows,
        top_tenants: topTenants.rows
      }
    });
    
  } catch (error) {
    console.error('Get transportation admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transportation dashboard data'
    });
  }
});

/**
 * Get all transportation bookings with filters
 */
router.get('/bookings', async (req, res) => {
  try {
    await ensureTransportationOperationsSchema();
    const {
      page = 1,
      limit = 20,
      booking_status,
      payment_status,
      service_type,
      start_date,
      end_date,
      search,
      property_id,
      tenant_id
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        tb.*,
        ts.service_name,
        ts.service_type,
        ts.provider_name,
        p.title as property_title,
        s.state_name as property_state,
        p.city as property_city,
        u.full_name as tenant_name,
        u.email as tenant_email,
        u.phone as tenant_phone
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      JOIN properties p ON tb.property_id = p.id
      JOIN users u ON tb.tenant_id = u.id
      WHERE 1=1
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      JOIN properties p ON tb.property_id = p.id
      JOIN users u ON tb.tenant_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    const countParams = [];
    let paramCount = 1;
    
    // Apply filters
    if (booking_status) {
      query += ` AND tb.booking_status = $${paramCount}`;
      countQuery += ` AND tb.booking_status = $${paramCount}`;
      params.push(booking_status);
      countParams.push(booking_status);
      paramCount++;
    }
    
    if (payment_status) {
      query += ` AND tb.payment_status = $${paramCount}`;
      countQuery += ` AND tb.payment_status = $${paramCount}`;
      params.push(payment_status);
      countParams.push(payment_status);
      paramCount++;
    }
    
    if (service_type) {
      query += ` AND ts.service_type = $${paramCount}`;
      countQuery += ` AND ts.service_type = $${paramCount}`;
      params.push(service_type);
      countParams.push(service_type);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND tb.created_at >= $${paramCount}`;
      countQuery += ` AND tb.created_at >= $${paramCount}`;
      params.push(start_date);
      countParams.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND tb.created_at <= $${paramCount}`;
      countQuery += ` AND tb.created_at <= $${paramCount}`;
      params.push(end_date);
      countParams.push(end_date);
      paramCount++;
    }
    
    if (property_id) {
      query += ` AND tb.property_id = $${paramCount}`;
      countQuery += ` AND tb.property_id = $${paramCount}`;
      params.push(property_id);
      countParams.push(property_id);
      paramCount++;
    }
    
    if (tenant_id) {
      query += ` AND tb.tenant_id = $${paramCount}`;
      countQuery += ` AND tb.tenant_id = $${paramCount}`;
      params.push(tenant_id);
      countParams.push(tenant_id);
      paramCount++;
    }
    
    if (search) {
      query += ` AND (
        p.title ILIKE $${paramCount} OR 
        u.full_name ILIKE $${paramCount} OR 
        u.email ILIKE $${paramCount} OR
        ts.service_name ILIKE $${paramCount} OR
        tb.pickup_address ILIKE $${paramCount} OR
        tb.destination_address ILIKE $${paramCount}
      )`;
      countQuery += ` AND (
        p.title ILIKE $${paramCount} OR 
        u.full_name ILIKE $${paramCount} OR 
        u.email ILIKE $${paramCount} OR
        ts.service_name ILIKE $${paramCount} OR
        tb.pickup_address ILIKE $${paramCount} OR
        tb.destination_address ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
      paramCount++;
    }
    
    // Order and paginate
    query += ` ORDER BY tb.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        bookings: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          total_pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get transportation bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transportation bookings'
    });
  }
});

/**
 * Get transportation booking details
 */
router.get('/bookings/:bookingId', async (req, res) => {
  try {
    await ensureTransportationOperationsSchema();
    const { bookingId } = req.params;
    
    const result = await db.query(`
      SELECT 
        tb.*,
        ts.service_name,
        ts.service_type,
        ts.provider_name,
        ts.provider_phone,
        ts.base_price,
        ts.price_per_km,
        ts.capacity_kg,
        ts.description as service_description,
        p.title as property_title,
        p.full_address as property_address,
        s.state_name as property_state,
        p.city as property_city,
        u.full_name as tenant_name,
        u.email as tenant_email,
        u.phone as tenant_phone,
        l.full_name as landlord_name,
        l.email as landlord_email,
        l.phone as landlord_phone
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      JOIN properties p ON tb.property_id = p.id
      JOIN users u ON tb.tenant_id = u.id
      JOIN users l ON p.landlord_id = l.id
      WHERE tb.id = $1
    `, [bookingId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transportation booking not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get booking details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking details'
    });
  }
});

/**
 * Get transportation booking operations timeline
 */
router.get('/bookings/:bookingId/operations', async (req, res) => {
  try {
    await ensureTransportationOperationsSchema();
    const { bookingId } = req.params;

    const bookingResult = await db.query(
      'SELECT id FROM transportation_bookings WHERE id = $1',
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transportation booking not found'
      });
    }

    const result = await db.query(
      `SELECT *
       FROM transportation_booking_operations
       WHERE booking_id = $1
       ORDER BY created_at DESC, id DESC`,
      [bookingId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get transportation operations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transportation operations'
    });
  }
});

/**
 * Update transportation dispatch lifecycle
 */
router.patch('/bookings/:bookingId/dispatch', async (req, res) => {
  try {
    await ensureTransportationOperationsSchema();
    const { bookingId } = req.params;
    const {
      action,
      driver_name,
      driver_phone,
      vehicle_number,
      note = '',
      proof_url = ''
    } = req.body;
    const adminId = req.user.id;
    const actorName = getActorName(req.user);
    const validActions = ['assign_driver', 'pickup_confirmed', 'dropoff_confirmed', 'cancelled'];

    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `Invalid dispatch action. Must be one of: ${validActions.join(', ')}`
      });
    }

    if (action === 'assign_driver' && (!driver_name || !driver_phone || !vehicle_number)) {
      return res.status(400).json({
        success: false,
        message: 'Driver name, driver phone, and vehicle number are required'
      });
    }

    if (['dropoff_confirmed', 'cancelled'].includes(action) && !String(note).trim()) {
      return res.status(400).json({
        success: false,
        message: 'A dispatch note is required for this action'
      });
    }

    const bookingResult = await db.query(
      'SELECT * FROM transportation_bookings WHERE id = $1',
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transportation booking not found'
      });
    }

    const booking = bookingResult.rows[0];
    const updates = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];
    let paramCount = 1;
    let nextStatus = booking.booking_status;
    let eventType = action;

    if (action === 'assign_driver') {
      nextStatus = 'confirmed';
      updates.push(
        `booking_status = $${paramCount++}`,
        'confirmed_at = CURRENT_TIMESTAMP',
        `driver_name = $${paramCount++}`,
        `driver_phone = $${paramCount++}`,
        `vehicle_number = $${paramCount++}`
      );
      params.push(nextStatus, driver_name, driver_phone, vehicle_number);
    }

    if (action === 'pickup_confirmed') {
      nextStatus = 'in_progress';
      updates.push(
        `booking_status = $${paramCount++}`,
        'started_at = CURRENT_TIMESTAMP',
        'pickup_confirmed_at = CURRENT_TIMESTAMP'
      );
      params.push(nextStatus);
      if (proof_url) {
        updates.push(`pickup_proof_url = $${paramCount++}`);
        params.push(proof_url);
      }
    }

    if (action === 'dropoff_confirmed') {
      nextStatus = 'completed';
      updates.push(
        `booking_status = $${paramCount++}`,
        'completed_at = CURRENT_TIMESTAMP',
        'dropoff_confirmed_at = CURRENT_TIMESTAMP'
      );
      params.push(nextStatus);
      if (proof_url) {
        updates.push(`dropoff_proof_url = $${paramCount++}`);
        params.push(proof_url);
      }
    }

    if (action === 'cancelled') {
      nextStatus = 'cancelled';
      eventType = 'dispatch_cancelled';
      updates.push(
        `booking_status = $${paramCount++}`,
        'cancelled_at = CURRENT_TIMESTAMP'
      );
      params.push(nextStatus);
    }

    if (String(note).trim()) {
      updates.push(`dispatch_notes = $${paramCount++}`, `admin_notes = $${paramCount++}`);
      params.push(String(note).trim(), String(note).trim());
    }

    params.push(bookingId);

    const updateResult = await db.query(
      `UPDATE transportation_bookings
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    await createTransportationOperation({
      bookingId,
      adminId,
      actorName,
      eventType,
      note: String(note).trim() || null,
      proofUrl: String(proof_url).trim() || null,
      metadata: {
        old_status: booking.booking_status,
        new_status: nextStatus,
        driver_name: driver_name || booking.driver_name || null,
        driver_phone: driver_phone || booking.driver_phone || null,
        vehicle_number: vehicle_number || booking.vehicle_number || null
      }
    });

    await db.query(
      `INSERT INTO admin_transportation_actions
       (admin_id, booking_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        adminId,
        bookingId,
        eventType,
        JSON.stringify({
          old_status: booking.booking_status,
          new_status: nextStatus,
          note: String(note).trim() || null,
          proof_url: String(proof_url).trim() || null
        }),
        req.ip,
        req.get('User-Agent')
      ]
    );

    res.json({
      success: true,
      data: updateResult.rows[0],
      message: 'Transportation dispatch updated successfully'
    });
  } catch (error) {
    console.error('Update transportation dispatch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transportation dispatch'
    });
  }
});

/**
 * Update transportation booking status (admin override)
 */
router.patch('/bookings/:bookingId/status', async (req, res) => {
  try {
    await ensureTransportationOperationsSchema();
    const { bookingId } = req.params;
    const { booking_status, admin_notes } = req.body;
    const adminId = req.user.id;
    
    if (!booking_status) {
      return res.status(400).json({
        success: false,
        message: 'Booking status is required'
      });
    }
    
    // Valid statuses
    const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(booking_status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid booking status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Get current booking
    const bookingResult = await db.query(
      'SELECT * FROM transportation_bookings WHERE id = $1',
      [bookingId]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transportation booking not found'
      });
    }
    
    const booking = bookingResult.rows[0];
    
    // Update booking status
    const updates = ['booking_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [booking_status];
    let paramCount = 2;
    
    // Add timestamp based on status
    if (booking_status === 'confirmed') {
      updates.push(`confirmed_at = CURRENT_TIMESTAMP`);
    } else if (booking_status === 'in_progress') {
      updates.push(`started_at = CURRENT_TIMESTAMP`);
    } else if (booking_status === 'completed') {
      updates.push(`completed_at = CURRENT_TIMESTAMP`);
    } else if (booking_status === 'cancelled') {
      updates.push(`cancelled_at = CURRENT_TIMESTAMP`);
    }
    
    // Add admin notes if provided
    if (admin_notes) {
      updates.push(`admin_notes = $${paramCount}`);
      params.push(admin_notes);
      paramCount++;
    }
    
    params.push(bookingId);
    
    const updateQuery = `
      UPDATE transportation_bookings 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const updateResult = await db.query(updateQuery, params);

    await createTransportationOperation({
      bookingId,
      adminId,
      actorName: getActorName(req.user),
      eventType: `status_${booking_status}`,
      note: admin_notes || null,
      metadata: {
        old_status: booking.booking_status,
        new_status: booking_status
      }
    });
    
    // Log admin action
    await db.query(
      `INSERT INTO admin_transportation_actions 
       (admin_id, booking_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        adminId,
        bookingId,
        'update_booking_status',
        JSON.stringify({
          old_status: booking.booking_status,
          new_status: booking_status,
          admin_notes: admin_notes || null
        }),
        req.ip,
        req.get('User-Agent')
      ]
    );
    
    res.json({
      success: true,
      data: updateResult.rows[0],
      message: 'Booking status updated successfully'
    });
    
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status'
    });
  }
});

/**
 * Update transportation booking payment status (admin override)
 */
router.patch('/bookings/:bookingId/payment-status', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { payment_status, payment_id, admin_notes } = req.body;
    const adminId = req.user.id;
    
    if (!payment_status) {
      return res.status(400).json({
        success: false,
        message: 'Payment status is required'
      });
    }
    
    // Valid payment statuses
    const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
    if (!validStatuses.includes(payment_status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Get current booking
    const bookingResult = await db.query(
      'SELECT * FROM transportation_bookings WHERE id = $1',
      [bookingId]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transportation booking not found'
      });
    }
    
    const booking = bookingResult.rows[0];
    
    // Update payment status
    const updates = ['payment_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [payment_status];
    let paramCount = 2;
    
    // Add payment ID if provided
    if (payment_id) {
      updates.push(`payment_id = $${paramCount}`);
      params.push(payment_id);
      paramCount++;
    }
    
    // Add admin notes if provided
    if (admin_notes) {
      updates.push(`admin_notes = $${paramCount}`);
      params.push(admin_notes);
      paramCount++;
    }
    
    params.push(bookingId);
    
    const updateQuery = `
      UPDATE transportation_bookings 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const updateResult = await db.query(updateQuery, params);
    
    // Log admin action
    await db.query(
      `INSERT INTO admin_transportation_actions 
       (admin_id, booking_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        adminId,
        bookingId,
        'update_payment_status',
        JSON.stringify({
          old_status: booking.payment_status,
          new_status: payment_status,
          payment_id: payment_id || null,
          admin_notes: admin_notes || null
        }),
        req.ip,
        req.get('User-Agent')
      ]
    );
    
    res.json({
      success: true,
      data: updateResult.rows[0],
      message: 'Payment status updated successfully'
    });
    
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status'
    });
  }
});

/**
 * Get all transportation services (admin view)
 */
router.get('/services', async (req, res) => {
  try {
    const { is_active, service_type, search } = req.query;
    
    let query = `
      SELECT 
        ts.*,
        COUNT(tb.id) as total_bookings,
        COALESCE(SUM(tb.total_price), 0) as total_revenue,
        AVG(tb.total_price) as avg_booking_value
      FROM transportation_services ts
      LEFT JOIN transportation_bookings tb ON ts.id = tb.service_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (is_active !== undefined) {
      query += ` AND ts.is_active = $${paramCount}`;
      params.push(is_active === 'true');
      paramCount++;
    }
    
    if (service_type) {
      query += ` AND ts.service_type = $${paramCount}`;
      params.push(service_type);
      paramCount++;
    }
    
    if (search) {
      query += ` AND (
        ts.service_name ILIKE $${paramCount} OR 
        ts.provider_name ILIKE $${paramCount} OR 
        ts.description ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ` GROUP BY ts.id ORDER BY ts.created_at DESC`;
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get transportation services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transportation services'
    });
  }
});

/**
 * Create new transportation service
 */
router.post('/services', async (req, res) => {
  try {
    const {
      service_name,
      service_type,
      provider_name,
      provider_phone,
      base_price,
      price_per_km,
      capacity_kg,
      description,
      is_active = true
    } = req.body;
    
    const adminId = req.user.id;
    
    // Validate required fields
    if (!service_name || !service_type || !provider_name || !base_price || !price_per_km) {
      return res.status(400).json({
        success: false,
        message: 'Service name, type, provider name, base price, and price per km are required'
      });
    }
    
    // Create service
    const result = await db.query(
      `INSERT INTO transportation_services (
        service_name, service_type, provider_name, provider_phone,
        base_price, price_per_km, capacity_kg, description, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        service_name,
        service_type,
        provider_name,
        provider_phone || null,
        parseFloat(base_price),
        parseFloat(price_per_km),
        capacity_kg ? parseFloat(capacity_kg) : null,
        description || null,
        is_active
      ]
    );
    
    // Log admin action
    await db.query(
      `INSERT INTO admin_transportation_actions 
       (admin_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        adminId,
        'create_service',
        JSON.stringify(result.rows[0]),
        req.ip,
        req.get('User-Agent')
      ]
    );
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Transportation service created successfully'
    });
    
  } catch (error) {
    console.error('Create transportation service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create transportation service'
    });
  }
});

/**
 * Update transportation service
 */
router.patch('/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const updates = req.body;
    const adminId = req.user.id;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No update data provided'
      });
    }
    
    // Get current service
    const serviceResult = await db.query(
      'SELECT * FROM transportation_services WHERE id = $1',
      [serviceId]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transportation service not found'
      });
    }
    
    const oldService = serviceResult.rows[0];
    
    // Build update query
    const updateFields = [];
    const params = [];
    let paramCount = 1;
    
    const allowedFields = [
      'service_name', 'service_type', 'provider_name', 'provider_phone',
      'base_price', 'price_per_km', 'capacity_kg', 'description', 'is_active'
    ];
    
    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        updateFields.push(`${field} = $${paramCount}`);
        params.push(value);
        paramCount++;
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(serviceId);
    
    const updateQuery = `
      UPDATE transportation_services 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const updateResult = await db.query(updateQuery, params);
    
    // Log admin action
    await db.query(
      `INSERT INTO admin_transportation_actions 
       (admin_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        adminId,
        'update_service',
        JSON.stringify({
          service_id: serviceId,
          old_data: oldService,
          new_data: updateResult.rows[0]
        }),
        req.ip,
        req.get('User-Agent')
      ]
    );
    
    res.json({
      success: true,
      data: updateResult.rows[0],
      message: 'Transportation service updated successfully'
    });
    
  } catch (error) {
    console.error('Update transportation service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transportation service'
    });
  }
});

/**
 * Delete transportation service (soft delete)
 */
router.delete('/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const adminId = req.user.id;
    
    // Check if service exists
    const serviceResult = await db.query(
      'SELECT * FROM transportation_services WHERE id = $1',
      [serviceId]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transportation service not found'
      });
    }
    
    // Check if service has active bookings
    const bookingsResult = await db.query(
      `SELECT COUNT(*) as active_bookings
       FROM transportation_bookings 
       WHERE service_id = $1 
         AND booking_status NOT IN ('cancelled', 'completed')`,
      [serviceId]
    );
    
    if (parseInt(bookingsResult.rows[0].active_bookings) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete service with active bookings'
      });
    }
    
    // Soft delete service (deactivate)
    const updateResult = await db.query(
      `UPDATE transportation_services 
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [serviceId]
    );
    
    // Log admin action
    await db.query(
      `INSERT INTO admin_transportation_actions 
       (admin_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        adminId,
        'delete_service',
        JSON.stringify(updateResult.rows[0]),
        req.ip,
        req.get('User-Agent')
      ]
    );
    
    res.json({
      success: true,
      message: 'Transportation service deactivated successfully'
    });
    
  } catch (error) {
    console.error('Delete transportation service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete transportation service'
    });
  }
});

/**
 * Get transportation analytics and reports
 * FIX: Removed unsafe period string interpolation; use parameterized interval mapping instead.
 * FIX: Fixed revenue trends query (missing WHERE keyword before AND payment_status).
 * FIX: Fixed service/property/tenant analytics queries (removed fragile dateFilter.replace() hacks).
 */
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30 days', start_date, end_date } = req.query;

    // Map allowed period values to safe SQL intervals
    const allowedPeriods = {
      '7days': '7 days',
      '30days': '30 days',
      '90days': '90 days',
      '365days': '365 days'
    };

    let dateFrom, dateTo, params;

    if (start_date && end_date) {
      dateFrom = start_date;
      dateTo = end_date;
      params = [dateFrom, dateTo];
    } else {
      const safeInterval = allowedPeriods[period] || '30 days';
      // Use parameterized date calculation to avoid injection
      const dateResult = await db.query(
        `SELECT CURRENT_DATE - INTERVAL '${safeInterval}' AS date_from, CURRENT_TIMESTAMP AS date_to`
      );
      dateFrom = dateResult.rows[0].date_from;
      dateTo = dateResult.rows[0].date_to;
      params = [dateFrom, dateTo];
    }

    const [
      bookingTrends,
      revenueTrends,
      servicePerformance,
      propertyAnalytics,
      tenantAnalytics
    ] = await Promise.all([
      // Booking trends by day
      db.query(`
        SELECT 
          DATE(tb.created_at) as date,
          COUNT(*) as booking_count,
          COUNT(CASE WHEN tb.booking_status = 'completed' THEN 1 END) as completed_count,
          COUNT(CASE WHEN tb.booking_status = 'cancelled' THEN 1 END) as cancelled_count
        FROM transportation_bookings tb
        WHERE tb.created_at BETWEEN $1 AND $2
        GROUP BY DATE(tb.created_at)
        ORDER BY date DESC
        LIMIT 30
      `, params),

      // FIX: Revenue trends — proper WHERE clause (not bare AND)
      db.query(`
        SELECT 
          DATE(tb.created_at) as date,
          COALESCE(SUM(tb.total_price), 0) as daily_revenue,
          COUNT(*) as booking_count,
          AVG(tb.total_price) as avg_booking_value
        FROM transportation_bookings tb
        WHERE tb.created_at BETWEEN $1 AND $2
          AND tb.payment_status = 'completed'
        GROUP BY DATE(tb.created_at)
        ORDER BY date DESC
        LIMIT 30
      `, params),

      // FIX: Service performance — use explicit JOIN date filter instead of fragile string replace
      db.query(`
        SELECT 
          ts.service_name,
          ts.service_type,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as total_revenue,
          AVG(tb.total_price) as avg_price,
          CASE 
            WHEN COUNT(tb.id) > 0 
            THEN COUNT(CASE WHEN tb.booking_status = 'completed' THEN 1 END) * 100.0 / COUNT(tb.id) 
            ELSE 0 
          END as completion_rate
        FROM transportation_services ts
        LEFT JOIN transportation_bookings tb 
          ON ts.id = tb.service_id
          AND tb.created_at BETWEEN $1 AND $2
        GROUP BY ts.id, ts.service_name, ts.service_type
        ORDER BY booking_count DESC
      `, params),

      // FIX: Property analytics — use explicit JOIN date filter
      db.query(`
        SELECT 
          p.id,
          p.title,
          s.state_name AS state,
          p.city,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as total_revenue,
          COUNT(DISTINCT tb.tenant_id) as unique_tenants
        FROM properties p
        LEFT JOIN states s ON s.id = p.state_id
        LEFT JOIN transportation_bookings tb 
          ON p.id = tb.property_id
          AND tb.created_at BETWEEN $1 AND $2
        GROUP BY p.id, p.title, s.state_name, p.city
        HAVING COUNT(tb.id) > 0
        ORDER BY booking_count DESC
        LIMIT 20
      `, params),

      // FIX: Tenant analytics — use explicit JOIN date filter
      db.query(`
        SELECT 
          u.id,
          u.full_name,
          u.email,
          u.phone,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as total_spent,
          COUNT(DISTINCT tb.property_id) as unique_properties,
          AVG(tb.total_price) as avg_booking_value
        FROM users u
        LEFT JOIN transportation_bookings tb 
          ON u.id = tb.tenant_id
          AND tb.created_at BETWEEN $1 AND $2
        WHERE u.user_type = 'tenant'
        GROUP BY u.id, u.full_name, u.email, u.phone
        HAVING COUNT(tb.id) > 0
        ORDER BY booking_count DESC
        LIMIT 20
      `, params)
    ]);
    
    res.json({
      success: true,
      data: {
        booking_trends: bookingTrends.rows,
        revenue_trends: revenueTrends.rows,
        service_performance: servicePerformance.rows,
        property_analytics: propertyAnalytics.rows,
        tenant_analytics: tenantAnalytics.rows
      }
    });
    
  } catch (error) {
    console.error('Get transportation analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transportation analytics'
    });
  }
});

/**
 * Get admin transportation actions log
 */
router.get('/actions', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      action_type, 
      admin_id, 
      start_date, 
      end_date 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        ata.*,
        u.full_name as admin_name,
        u.email as admin_email,
        tb.id as booking_id,
        ts.service_name
      FROM admin_transportation_actions ata
      LEFT JOIN users u ON ata.admin_id = u.id
      LEFT JOIN transportation_bookings tb ON ata.booking_id = tb.id
      LEFT JOIN transportation_services ts ON tb.service_id = ts.id
      WHERE 1=1
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM admin_transportation_actions ata
      WHERE 1=1
    `;
    
    const params = [];
    const countParams = [];
    let paramCount = 1;
    
    if (action_type) {
      query += ` AND ata.action_type = $${paramCount}`;
      countQuery += ` AND ata.action_type = $${paramCount}`;
      params.push(action_type);
      countParams.push(action_type);
      paramCount++;
    }
    
    if (admin_id) {
      query += ` AND ata.admin_id = $${paramCount}`;
      countQuery += ` AND ata.admin_id = $${paramCount}`;
      params.push(admin_id);
      countParams.push(admin_id);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND ata.created_at >= $${paramCount}`;
      countQuery += ` AND ata.created_at >= $${paramCount}`;
      params.push(start_date);
      countParams.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND ata.created_at <= $${paramCount}`;
      countQuery += ` AND ata.created_at <= $${paramCount}`;
      params.push(end_date);
      countParams.push(end_date);
      paramCount++;
    }
    
    query += ` ORDER BY ata.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        actions: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          total_pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get admin actions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin actions'
    });
  }
});

/**
 * Get transportation revenue summary
 */
router.get('/revenue', async (req, res) => {
  try {
    const { period = 'month', start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (start_date && end_date) {
      dateFilter = `WHERE created_at BETWEEN $1 AND $2`;
      params.push(start_date, end_date);
    } else {
      // Default periods
      if (period === 'today') {
        dateFilter = `WHERE created_at >= CURRENT_DATE`;
      } else if (period === 'week') {
        dateFilter = `WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`;
      } else if (period === 'month') {
        dateFilter = `WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`;
      } else if (period === 'year') {
        dateFilter = `WHERE created_at >= CURRENT_DATE - INTERVAL '365 days'`;
      } else {
        dateFilter = `WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`;
      }
    }
    
    const revenueResult = await db.query(`
      SELECT 
        COUNT(*) as total_bookings,
        COALESCE(SUM(total_price), 0) as total_revenue,
        AVG(total_price) as avg_booking_value,
        COUNT(DISTINCT tenant_id) as unique_tenants,
        COUNT(DISTINCT property_id) as unique_properties,
        COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as paid_bookings,
        COALESCE(SUM(CASE WHEN payment_status = 'completed' THEN total_price ELSE 0 END), 0) as paid_revenue,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_bookings,
        COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN total_price ELSE 0 END), 0) as pending_revenue
      FROM transportation_bookings
      ${dateFilter}
    `, params);
    
    // Get revenue by service type
    const tbDateFilter = dateFilter.replace('WHERE created_at', 'WHERE tb.created_at');
    const serviceRevenue = await db.query(`
      SELECT 
        ts.service_type,
        ts.service_name,
        COUNT(tb.id) as booking_count,
        COALESCE(SUM(tb.total_price), 0) as total_revenue,
        AVG(tb.total_price) as avg_price
      FROM transportation_services ts
      LEFT JOIN transportation_bookings tb ON ts.id = tb.service_id
      ${tbDateFilter}
      GROUP BY ts.service_type, ts.service_name
      ORDER BY total_revenue DESC
    `, params);
    
    // Get revenue by state
    const stateRevenue = await db.query(`
      SELECT 
        s.state_name AS state,
        COUNT(tb.id) as booking_count,
        COALESCE(SUM(tb.total_price), 0) as total_revenue,
        COUNT(DISTINCT tb.tenant_id) as unique_tenants
      FROM transportation_bookings tb
      JOIN properties p ON tb.property_id = p.id
      LEFT JOIN states s ON s.id = p.state_id
      ${tbDateFilter}
      GROUP BY s.state_name
      ORDER BY total_revenue DESC
    `, params);
    
    res.json({
      success: true,
      data: {
        summary: revenueResult.rows[0],
        by_service: serviceRevenue.rows,
        by_state: stateRevenue.rows
      }
    });
    
  } catch (error) {
    console.error('Get transportation revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transportation revenue data'
    });
  }
});

/**
 * Generate transportation report
 */
router.get('/report', async (req, res) => {
  try {
    const { report_type = 'summary', start_date, end_date, format = 'json' } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required for reports'
      });
    }
    
    let reportData = {};
    
    if (report_type === 'summary') {
      // Summary report
      const [summary, bookings, services, properties] = await Promise.all([
        db.query(`
          SELECT 
            COUNT(*) as total_bookings,
            COALESCE(SUM(total_price), 0) as total_revenue,
            AVG(total_price) as avg_booking_value,
            COUNT(DISTINCT tenant_id) as unique_tenants,
            COUNT(DISTINCT property_id) as unique_properties,
            COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_bookings,
            COUNT(CASE WHEN booking_status = 'cancelled' THEN 1 END) as cancelled_bookings,
            COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as paid_bookings,
            COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_bookings
          FROM transportation_bookings
          WHERE created_at BETWEEN $1 AND $2
        `, [start_date, end_date]),
        
        db.query(`
          SELECT 
            tb.*,
            ts.service_name,
            ts.service_type,
            p.title as property_title,
            s.state_name as property_state,
            p.city as property_city,
            u.full_name as tenant_name,
            u.email as tenant_email
          FROM transportation_bookings tb
          JOIN transportation_services ts ON tb.service_id = ts.id
          JOIN properties p ON tb.property_id = p.id
          JOIN users u ON tb.tenant_id = u.id
          WHERE tb.created_at BETWEEN $1 AND $2
          ORDER BY tb.created_at DESC
        `, [start_date, end_date]),
        
        db.query(`
          SELECT 
            ts.service_name,
            ts.service_type,
            COUNT(tb.id) as booking_count,
            COALESCE(SUM(tb.total_price), 0) as total_revenue,
            AVG(tb.total_price) as avg_price
          FROM transportation_services ts
          LEFT JOIN transportation_bookings tb ON ts.id = tb.service_id
            AND tb.created_at BETWEEN $1 AND $2
          GROUP BY ts.service_name, ts.service_type
          ORDER BY booking_count DESC
        `, [start_date, end_date]),
        
        db.query(`
          SELECT 
            p.title,
            s.state_name AS state,
            p.city,
            COUNT(tb.id) as booking_count,
            COALESCE(SUM(tb.total_price), 0) as total_revenue,
            COUNT(DISTINCT tb.tenant_id) as unique_tenants
          FROM properties p
          LEFT JOIN states s ON s.id = p.state_id
          LEFT JOIN transportation_bookings tb ON p.id = tb.property_id
            AND tb.created_at BETWEEN $1 AND $2
          GROUP BY p.title, s.state_name, p.city
          HAVING COUNT(tb.id) > 0
          ORDER BY booking_count DESC
        `, [start_date, end_date])
      ]);
      
      reportData = {
        report_type: 'summary',
        period: { start_date, end_date },
        summary: summary.rows[0],
        bookings: bookings.rows,
        services: services.rows,
        properties: properties.rows
      };
      
    } else if (report_type === 'revenue') {
      // Revenue report
      const [dailyRevenue, serviceRevenue, stateRevenue] = await Promise.all([
        db.query(`
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as booking_count,
            COALESCE(SUM(total_price), 0) as daily_revenue,
            AVG(total_price) as avg_booking_value
          FROM transportation_bookings
          WHERE created_at BETWEEN $1 AND $2
            AND payment_status = 'completed'
          GROUP BY DATE(created_at)
          ORDER BY date
        `, [start_date, end_date]),
        
        db.query(`
          SELECT 
            ts.service_name,
            ts.service_type,
            COUNT(tb.id) as booking_count,
            COALESCE(SUM(tb.total_price), 0) as total_revenue,
            AVG(tb.total_price) as avg_price,
            MIN(tb.total_price) as min_price,
            MAX(tb.total_price) as max_price
          FROM transportation_services ts
          JOIN transportation_bookings tb ON ts.id = tb.service_id
          WHERE tb.created_at BETWEEN $1 AND $2
            AND tb.payment_status = 'completed'
          GROUP BY ts.service_name, ts.service_type
          ORDER BY total_revenue DESC
        `, [start_date, end_date]),
        
        db.query(`
          SELECT 
            s.state_name AS state,
            COUNT(tb.id) as booking_count,
            COALESCE(SUM(tb.total_price), 0) as total_revenue,
            AVG(tb.total_price) as avg_price,
            COUNT(DISTINCT tb.tenant_id) as unique_tenants
          FROM transportation_bookings tb
          JOIN properties p ON tb.property_id = p.id
          LEFT JOIN states s ON s.id = p.state_id
          WHERE tb.created_at BETWEEN $1 AND $2
            AND tb.payment_status = 'completed'
          GROUP BY s.state_name
          ORDER BY total_revenue DESC
        `, [start_date, end_date])
      ]);
      
      reportData = {
        report_type: 'revenue',
        period: { start_date, end_date },
        daily_revenue: dailyRevenue.rows,
        service_revenue: serviceRevenue.rows,
        state_revenue: stateRevenue.rows
      };
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid report_type. Must be "summary" or "revenue"'
      });
    }
    
    if (format === 'csv') {
      // For CSV format, you would convert the data to CSV
      // This is a simplified version - in production, use a proper CSV library
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="transportation_report_${start_date}_to_${end_date}.csv"`);
      
      // Convert to CSV (simplified)
      const csvData = JSON.stringify(reportData, null, 2);
      return res.send(csvData);
    }
    
    res.json({
      success: true,
      data: reportData,
      message: 'Transportation report generated successfully'
    });
    
  } catch (error) {
    console.error('Generate transportation report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate transportation report'
    });
  }
});

/**
 * Get transportation settings
 */
router.get('/settings', async (req, res) => {
  try {
    // Get transportation settings from database
    const settingsResult = await db.query(`
      SELECT * FROM transportation_settings
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    // Default settings if none exist
    let settings = settingsResult.rows[0] || {
      id: 1,
      booking_window_days: 30,
      max_bookings_per_day: 3,
      cancellation_hours: 24,
      refund_percentage: 50,
      admin_commission_percentage: 10,
      min_booking_amount: 1000,
      currency: 'NGN',
      created_at: new Date(),
      updated_at: new Date()
    };
    
    res.json({
      success: true,
      data: settings
    });
    
  } catch (error) {
    console.error('Get transportation settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transportation settings'
    });
  }
});

/**
 * Update transportation settings
 */
router.patch('/settings', async (req, res) => {
  try {
    const adminId = req.user.id;
    const updates = req.body;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No update data provided'
      });
    }
    
    // Get current settings
    const settingsResult = await db.query(`
      SELECT * FROM transportation_settings
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    const oldSettings = settingsResult.rows[0];
    
    // Build update query
    const updateFields = [];
    const params = [];
    let paramCount = 1;
    
    const allowedFields = new Set([
      'booking_window_days', 'max_bookings_per_day', 'cancellation_hours',
      'refund_percentage', 'admin_commission_percentage', 'min_booking_amount',
      'currency'
    ]);
    
    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.has(field)) {
        updateFields.push(`${field} = $${paramCount}`);
        params.push(value);
        paramCount++;
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    
    let updateResult;
    
    if (oldSettings) {
      // Update existing settings
      params.push(oldSettings.id);
      const updateQuery = `
        UPDATE transportation_settings 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;
      updateResult = await db.query(updateQuery, params);
    } else {
      // Insert new settings
      const insertFields = updateFields.map(f => f.split(' = ')[0]);
      const insertPlaceholders = insertFields.map((_, i) => `$${i + 1}`);
      const insertQuery = `
        INSERT INTO transportation_settings (${insertFields.join(', ')})
        VALUES (${insertPlaceholders.join(', ')})
        RETURNING *
      `;
      updateResult = await db.query(insertQuery, params.slice(0, insertFields.length));
    }
    
    // Log admin action
    await db.query(
      `INSERT INTO admin_transportation_actions 
       (admin_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        adminId,
        'update_settings',
        JSON.stringify({
          old_settings: oldSettings,
          new_settings: updateResult.rows[0]
        }),
        req.ip,
        req.get('User-Agent')
      ]
    );
    
    res.json({
      success: true,
      data: updateResult.rows[0],
      message: 'Transportation settings updated successfully'
    });
    
  } catch (error) {
    console.error('Update transportation settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transportation settings'
    });
  }
});

// ====================== STATE ADMIN TRANSPORTATION MONITORING ======================

/**
 * Get state admin transportation dashboard
 * FIX: Removed duplicate route definition. Kept the more complete/correct version.
 * FIX: Removed SQL injection via string interpolation of admin.assigned_state.
 */
router.get('/state-admin/dashboard', async (req, res) => {
  try {
    const adminId = req.user.id;
    
    // Check if user is a state admin
    const adminResult = await db.query(
      `SELECT user_type, assigned_state, assigned_city 
       FROM users 
       WHERE id = $1 
         AND user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
         AND deleted_at IS NULL`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State admin access required.'
      });
    }
    
    const admin = adminResult.rows[0];
    
    // Get state admin jurisdiction
    const jurisdictionResult = await db.query(
      `SELECT * FROM state_admin_transportation_jurisdiction 
       WHERE state_admin_id = $1 AND state = $2`,
      [adminId, admin.assigned_state]
    );
    
    if (jurisdictionResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No transportation monitoring jurisdiction assigned'
      });
    }
    
    const jurisdiction = jurisdictionResult.rows[0];
    
    // Get state-specific transportation statistics
    const [stateStats, recentBookings, serviceStats, alerts] = await Promise.all([
      // State statistics
      db.query(`
        SELECT 
          COUNT(tb.id) as total_bookings,
          COUNT(CASE WHEN tb.booking_status = 'pending' THEN 1 END) as pending_bookings,
          COUNT(CASE WHEN tb.booking_status = 'completed' THEN 1 END) as completed_bookings,
          COUNT(CASE WHEN tb.payment_status = 'completed' THEN 1 END) as paid_bookings,
          COALESCE(SUM(tb.total_price), 0) as total_revenue,
          COUNT(DISTINCT tb.tenant_id) as unique_tenants,
          COUNT(DISTINCT tb.property_id) as unique_properties,
          COUNT(DISTINCT tb.service_id) as services_used
        FROM transportation_bookings tb
        JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
          AND tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
          ${admin.assigned_city ? 'AND p.city = $2' : ''}
      `, admin.assigned_city ? [admin.assigned_state, admin.assigned_city] : [admin.assigned_state]),
      
      // Recent bookings in state
      db.query(`
        SELECT 
          tb.*,
          ts.service_name,
          ts.service_type,
          p.title as property_title,
          p.city as property_city,
          u.full_name as tenant_name,
          u.email as tenant_email
        FROM transportation_bookings tb
        JOIN transportation_services ts ON tb.service_id = ts.id
        JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        JOIN users u ON tb.tenant_id = u.id
        WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
          ${admin.assigned_city ? 'AND p.city = $2' : ''}
        ORDER BY tb.created_at DESC
        LIMIT 10
      `, admin.assigned_city ? [admin.assigned_state, admin.assigned_city] : [admin.assigned_state]),
      
      // Service statistics in state
      db.query(`
        SELECT 
          ts.service_name,
          ts.service_type,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as total_revenue,
          AVG(tb.total_price) as avg_price
        FROM transportation_services ts
        LEFT JOIN transportation_bookings tb ON ts.id = tb.service_id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        WHERE ts.is_active = TRUE
          AND (LOWER(TRIM(s.state_name)) = LOWER(TRIM($1)) OR p.state_id IS NULL)
          ${admin.assigned_city ? 'AND (p.city = $2 OR p.city IS NULL)' : ''}
          AND tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY ts.id, ts.service_name, ts.service_type
        ORDER BY booking_count DESC
      `, admin.assigned_city ? [admin.assigned_state, admin.assigned_city] : [admin.assigned_state]),
      
      // Recent alerts for state
      db.query(`
        SELECT 
          ta.*,
          tb.id as booking_id,
          ts.service_name
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        LEFT JOIN transportation_services ts ON ta.related_service_id = ts.id
        WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
          ${admin.assigned_city ? 'AND p.city = $2' : ''}
          AND ta.is_resolved = FALSE
        ORDER BY ta.created_at DESC
        LIMIT 10
      `, admin.assigned_city ? [admin.assigned_state, admin.assigned_city] : [admin.assigned_state])
    ]);
    
    res.json({
      success: true,
      data: {
        jurisdiction: jurisdiction,
        statistics: stateStats.rows[0],
        recent_bookings: recentBookings.rows,
        service_analytics: serviceStats.rows,
        alerts: alerts.rows
      }
    });
    
  } catch (error) {
    console.error('Get state admin transportation dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch state admin dashboard data'
    });
  }
});

/**
 * Get state admin transportation bookings
 */
router.get('/state-admin/bookings', async (req, res) => {
  try {
    const adminId = req.user.id;
    
    // Check if user is a state admin
    const adminResult = await db.query(
      `SELECT assigned_state, assigned_city 
       FROM users 
       WHERE id = $1 
         AND user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
         AND deleted_at IS NULL`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State admin access required.'
      });
    }
    
    const admin = adminResult.rows[0];
    
    const {
      page = 1,
      limit = 20,
      booking_status,
      payment_status,
      service_type,
      start_date,
      end_date,
      search
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        tb.*,
        ts.service_name,
        ts.service_type,
        ts.provider_name,
        p.title as property_title,
        p.city as property_city,
        p.area as property_area,
        u.full_name as tenant_name,
        u.email as tenant_email,
        u.phone as tenant_phone
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      JOIN properties p ON tb.property_id = p.id
      LEFT JOIN states s ON s.id = p.state_id
      JOIN users u ON tb.tenant_id = u.id
      WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM transportation_bookings tb
      JOIN properties p ON tb.property_id = p.id
      LEFT JOIN states s ON s.id = p.state_id
      WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
    `;
    
    const params = [admin.assigned_state];
    const countParams = [admin.assigned_state];
    let paramCount = 2;
    
    if (admin.assigned_city) {
      query += ` AND p.city = $${paramCount}`;
      countQuery += ` AND p.city = $${paramCount}`;
      params.push(admin.assigned_city);
      countParams.push(admin.assigned_city);
      paramCount++;
    }
    
    // Apply filters
    if (booking_status) {
      query += ` AND tb.booking_status = $${paramCount}`;
      countQuery += ` AND tb.booking_status = $${paramCount}`;
      params.push(booking_status);
      countParams.push(booking_status);
      paramCount++;
    }
    
    if (payment_status) {
      query += ` AND tb.payment_status = $${paramCount}`;
      countQuery += ` AND tb.payment_status = $${paramCount}`;
      params.push(payment_status);
      countParams.push(payment_status);
      paramCount++;
    }
    
    if (service_type) {
      query += ` AND ts.service_type = $${paramCount}`;
      countQuery += ` AND ts.service_type = $${paramCount}`;
      params.push(service_type);
      countParams.push(service_type);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND tb.created_at >= $${paramCount}`;
      countQuery += ` AND tb.created_at >= $${paramCount}`;
      params.push(start_date);
      countParams.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND tb.created_at <= $${paramCount}`;
      countQuery += ` AND tb.created_at <= $${paramCount}`;
      params.push(end_date);
      countParams.push(end_date);
      paramCount++;
    }
    
    if (search) {
      query += ` AND (
        p.title ILIKE $${paramCount} OR 
        u.full_name ILIKE $${paramCount} OR 
        u.email ILIKE $${paramCount} OR
        ts.service_name ILIKE $${paramCount} OR
        tb.pickup_address ILIKE $${paramCount} OR
        tb.destination_address ILIKE $${paramCount}
      )`;
      countQuery += ` AND (
        p.title ILIKE $${paramCount} OR 
        u.full_name ILIKE $${paramCount} OR 
        u.email ILIKE $${paramCount} OR
        ts.service_name ILIKE $${paramCount} OR
        tb.pickup_address ILIKE $${paramCount} OR
        tb.destination_address ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
      paramCount++;
    }
    
    // Order and paginate
    query += ` ORDER BY tb.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        bookings: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          total_pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get state admin transportation bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch state admin bookings'
    });
  }
});

  // ====================== STATE ADMIN TRANSPORTATION MANAGEMENT ======================

  /**
   * Get state admin jurisdiction information
   */
  router.get('/state-admin/jurisdiction', async (req, res) => {
    try {
      const adminId = req.user.id;
      
      const result = await db.query(`
        SELECT 
          saj.*,
          u.full_name as assigned_by_name,
          u.email as assigned_by_email
        FROM state_admin_transportation_jurisdiction saj
        LEFT JOIN users u ON saj.assigned_by = u.id
        WHERE saj.state_admin_id = $1
        ORDER BY saj.state, saj.city
      `, [adminId]);
      
      res.json({
        success: true,
        data: {
          jurisdiction: result.rows
        }
      });
      
    } catch (error) {
      console.error('Get state admin jurisdiction error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch jurisdiction information'
      });
    }
  });

  /**
   * Get state admin transportation services in jurisdiction
   */
  router.get('/state-admin/services', async (req, res) => {
    try {
      const adminId = req.user.id;
      
      // Get admin's assigned state
      const adminResult = await db.query(`
        SELECT assigned_state, assigned_city 
        FROM users 
        WHERE id = $1 
          AND user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
          AND deleted_at IS NULL
      `, [adminId]);
      
      if (adminResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. State admin access required.'
        });
      }
      
      const admin = adminResult.rows[0];
      
      const { 
        page = 1, 
        limit = 20, 
        is_active, 
        service_type, 
        search 
      } = req.query;
      const offset = (page - 1) * limit;
      
      const stateBookingCondition = admin.assigned_city
        ? `(LOWER(TRIM(s.state_name)) = LOWER(TRIM($1)) AND p.city = $2)`
        : `(LOWER(TRIM(s.state_name)) = LOWER(TRIM($1)))`;

      let query = `
        SELECT 
          ts.*,
          COUNT(tb.id) FILTER (WHERE ${stateBookingCondition}) as total_bookings,
          COALESCE(
            SUM(
              CASE
                WHEN ${stateBookingCondition} THEN tb.total_price
                ELSE 0
              END
            ),
            0
          ) as total_revenue
        FROM transportation_services ts
        LEFT JOIN transportation_bookings tb ON ts.id = tb.service_id
          AND tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        WHERE 1=1
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM transportation_services ts
        WHERE 1=1
      `;
      
      const params = admin.assigned_city
        ? [admin.assigned_state, admin.assigned_city]
        : [admin.assigned_state];
      const countParams = [];
      let paramCount = params.length + 1;
      
      if (is_active !== undefined) {
        query += ` AND ts.is_active = $${paramCount}`;
        countQuery += ` AND ts.is_active = $${paramCount}`;
        params.push(is_active === 'true');
        countParams.push(is_active === 'true');
        paramCount++;
      }
      
      if (service_type) {
        query += ` AND ts.service_type = $${paramCount}`;
        countQuery += ` AND ts.service_type = $${paramCount}`;
        params.push(service_type);
        countParams.push(service_type);
        paramCount++;
      }
      
      if (search) {
        query += ` AND (
          ts.service_name ILIKE $${paramCount} OR
          ts.provider_name ILIKE $${paramCount} OR
          ts.description ILIKE $${paramCount}
        )`;
        countQuery += ` AND (
          ts.service_name ILIKE $${paramCount} OR
          ts.provider_name ILIKE $${paramCount} OR
          ts.description ILIKE $${paramCount}
        )`;
        params.push(`%${search}%`);
        countParams.push(`%${search}%`);
        paramCount++;
      }
      
      query += ` GROUP BY ts.id ORDER BY ts.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);
      
      const [result, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, countParams)
      ]);
      
      res.json({
        success: true,
        data: {
          services: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].total),
            total_pages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Get state admin services error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch state admin services'
      });
    }
  });

  /**
   * Get state admin transportation analytics
   */
  router.get('/state-admin/analytics', async (req, res) => {
    try {
      const adminId = req.user.id;
      
      // Get admin's assigned state
      const adminResult = await db.query(`
        SELECT assigned_state, assigned_city 
        FROM users 
        WHERE id = $1 
          AND user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
          AND deleted_at IS NULL
      `, [adminId]);
      
      if (adminResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. State admin access required.'
        });
      }
      
      const admin = adminResult.rows[0];
      
      const { period: rawPeriod = '30 days' } = req.query;
      const allowedPeriods = ['7 days', '14 days', '30 days', '60 days', '90 days', '1 year'];
      const period = allowedPeriods.includes(rawPeriod) ? rawPeriod : '30 days';
      
      const [overviewStats, revenueTrends, serviceBreakdown, topProperties] = await Promise.all([
        // Overview statistics
        db.query(`
          SELECT 
            COUNT(*) as total_bookings,
            COUNT(CASE WHEN tb.booking_status = 'pending' THEN 1 END) as pending_bookings,
            COUNT(CASE WHEN tb.booking_status = 'confirmed' THEN 1 END) as confirmed_bookings,
            COUNT(CASE WHEN tb.booking_status = 'completed' THEN 1 END) as completed_bookings,
            COUNT(CASE WHEN tb.booking_status = 'cancelled' THEN 1 END) as cancelled_bookings,
            COALESCE(SUM(tb.total_price), 0) as total_revenue,
            COUNT(DISTINCT tb.tenant_id) as unique_tenants,
            COUNT(DISTINCT tb.property_id) as unique_properties
          FROM transportation_bookings tb
          JOIN properties p ON tb.property_id = p.id
          LEFT JOIN states s ON s.id = p.state_id
          WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
            AND tb.created_at >= CURRENT_DATE - $2::interval
        `, [admin.assigned_state, period]),
        
        // Revenue trends
        db.query(`
          SELECT 
            DATE(tb.created_at) as date,
            COUNT(*) as booking_count,
            COALESCE(SUM(tb.total_price), 0) as daily_revenue
          FROM transportation_bookings tb
          JOIN properties p ON tb.property_id = p.id
          LEFT JOIN states s ON s.id = p.state_id
          WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
            AND tb.created_at >= CURRENT_DATE - INTERVAL '7 days'
            AND tb.payment_status = 'completed'
          GROUP BY DATE(tb.created_at)
          ORDER BY date DESC
        `, [admin.assigned_state]),
        
        // Service type breakdown
        db.query(`
          SELECT 
            ts.service_type,
            ts.service_name,
            COUNT(tb.id) as booking_count,
            COALESCE(SUM(tb.total_price), 0) as total_revenue,
            AVG(tb.total_price) as avg_price
          FROM transportation_bookings tb
          JOIN transportation_services ts ON tb.service_id = ts.id
          JOIN properties p ON tb.property_id = p.id
          LEFT JOIN states s ON s.id = p.state_id
          WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
            AND tb.created_at >= CURRENT_DATE - $2::interval
          GROUP BY ts.service_type, ts.service_name
          ORDER BY booking_count DESC
        `, [admin.assigned_state, period]),
        
        // Top properties
        db.query(`
          SELECT 
            p.id,
            p.title,
            p.city,
            p.area,
            COUNT(tb.id) as booking_count,
            COALESCE(SUM(tb.total_price), 0) as total_revenue
          FROM transportation_bookings tb
          JOIN properties p ON tb.property_id = p.id
          LEFT JOIN states s ON s.id = p.state_id
          WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
            AND tb.created_at >= CURRENT_DATE - $2::interval
          GROUP BY p.id, p.title, p.city, p.area
          ORDER BY booking_count DESC
          LIMIT 10
        `, [admin.assigned_state, period])
      ]);
      
      res.json({
        success: true,
        data: {
          overview: overviewStats.rows[0],
          revenue_trends: revenueTrends.rows,
          service_breakdown: serviceBreakdown.rows,
          top_properties: topProperties.rows
        }
      });
      
    } catch (error) {
      console.error('Get state admin analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch state admin analytics'
      });
    }
  });

  /**
   * Get state admin transportation alerts
   */
  router.get('/state-admin/alerts', async (req, res) => {
    try {
      const adminId = req.user.id;
      
      // Get admin's assigned state
      const adminResult = await db.query(`
        SELECT assigned_state, assigned_city 
        FROM users 
        WHERE id = $1 
          AND user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
          AND deleted_at IS NULL
      `, [adminId]);
      
      if (adminResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. State admin access required.'
        });
      }
      
      const admin = adminResult.rows[0];
      
      const { 
        page = 1, 
        limit = 20, 
        alert_level, 
        is_resolved, 
        start_date, 
        end_date 
      } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT 
          ta.*,
          tb.id as booking_id,
          ts.service_name,
          s.state_name AS state,
          p.city
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        LEFT JOIN transportation_services ts ON ta.related_service_id = ts.id
        WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
      `;
      
      const params = [admin.assigned_state];
      const countParams = [admin.assigned_state];
      let paramCount = 2;
      
      if (alert_level) {
        query += ` AND ta.alert_level = $${paramCount}`;
        countQuery += ` AND ta.alert_level = $${paramCount}`;
        params.push(alert_level);
        countParams.push(alert_level);
        paramCount++;
      }
      
      if (is_resolved !== undefined) {
        query += ` AND ta.is_resolved = $${paramCount}`;
        countQuery += ` AND ta.is_resolved = $${paramCount}`;
        params.push(is_resolved === 'true');
        countParams.push(is_resolved === 'true');
        paramCount++;
      }
      
      if (start_date) {
        query += ` AND ta.created_at >= $${paramCount}`;
        countQuery += ` AND ta.created_at >= $${paramCount}`;
        params.push(start_date);
        countParams.push(start_date);
        paramCount++;
      }
      
      if (end_date) {
        query += ` AND ta.created_at <= $${paramCount}`;
        countQuery += ` AND ta.created_at <= $${paramCount}`;
        params.push(end_date);
        countParams.push(end_date);
        paramCount++;
      }
      
      query += ` ORDER BY ta.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);
      
      const [result, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, countParams)
      ]);
      
      res.json({
        success: true,
        data: {
          alerts: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].total),
            total_pages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Get state admin alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch state admin alerts'
      });
    }
  });

  /**
   * Update state admin alert resolution status
   */
  router.patch('/state-admin/alerts/:alertId/resolve', async (req, res) => {
    try {
      const adminId = req.user.id;
      const { alertId } = req.params;
      const { resolution_notes } = req.body;
      
      // Check if user is a state admin
      const adminResult = await db.query(`
        SELECT assigned_state 
        FROM users 
        WHERE id = $1 
          AND user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
          AND deleted_at IS NULL
      `, [adminId]);
      
      if (adminResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. State admin access required.'
        });
      }
      
      const admin = adminResult.rows[0];
      
      // Check if alert belongs to admin's jurisdiction
      const alertCheck = await db.query(`
        SELECT ta.*
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        WHERE ta.id = $1 AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($2))
      `, [alertId, admin.assigned_state]);
      
      if (alertCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found or not in your jurisdiction'
        });
      }
      
      // Update alert
      const result = await db.query(`
        UPDATE transportation_alerts
        SET is_resolved = TRUE,
            resolved_at = NOW(),
            resolved_by = $1,
            resolution_notes = $2
        WHERE id = $3
        RETURNING *
      `, [adminId, resolution_notes, alertId]);
      
      // Log the action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'resolve_alert', $2, NULL, NULL, $3, $4)
      `, [
        adminId,
        JSON.stringify({ alert_id: alertId, resolution_notes }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: {
          alert: result.rows[0]
        },
        message: 'Alert resolved successfully'
      });
      
    } catch (error) {
      console.error('Resolve state admin alert error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resolve alert'
      });
    }
  });

// ====================== SUPER ADMIN TRANSPORTATION OVERSIGHT ======================

/**
 * Get super admin transportation oversight dashboard
 * FIX: Completed the truncated route — added missing stats, closing brackets, and response.
 */
router.get('/super-admin/dashboard', async (req, res) => {
  try {
    const adminId = req.user.id;
    
    // Check if user is a super admin
    const adminResult = await db.query(
      `SELECT user_type 
       FROM users 
       WHERE id = $1 
         AND user_type IN ('super_admin', 'super_financial_admin', 'super_support_admin')
         AND deleted_at IS NULL`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin access required.'
      });
    }
    
    // Get super admin oversight permissions
    const oversightResult = await db.query(
      `SELECT * FROM super_admin_transportation_oversight 
       WHERE super_admin_id = $1`,
      [adminId]
    );
    
    const oversight = oversightResult.rows[0] || {
      oversight_level: 'national',
      can_manage_all_services: true,
      can_view_all_analytics: true,
      can_override_any_status: true,
      can_assign_state_admins: true
    };
    
    // Get comprehensive oversight statistics
    const [nationalStats, regionalStats, stateStats, systemHealth, recentAlerts] = await Promise.all([
      // National statistics
      db.query(`
        SELECT 
          COUNT(*) as total_bookings,
          COUNT(CASE WHEN booking_status = 'pending' THEN 1 END) as pending_bookings,
          COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_bookings,
          COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as paid_bookings,
          COALESCE(SUM(total_price), 0) as total_revenue,
          COUNT(DISTINCT tenant_id) as unique_tenants,
          COUNT(DISTINCT property_id) as unique_properties,
          COUNT(DISTINCT service_id) as services_used,
          AVG(total_price) as avg_booking_value
        FROM transportation_bookings
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      `),
      
      // Regional statistics (if applicable)
      oversight.region ? db.query(`
        SELECT 
          s.state_name AS state,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as state_revenue,
          COUNT(DISTINCT tb.tenant_id) as unique_tenants,
          COUNT(DISTINCT tb.property_id) as unique_properties
        FROM transportation_bookings tb
        JOIN properties p ON tb.property_id = p.id
        JOIN states s ON s.id = p.state_id
        WHERE tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND s.region = $1
        GROUP BY s.state_name
        ORDER BY booking_count DESC
      `, [oversight.region]) : Promise.resolve({ rows: [] }),
      
      // State statistics (if applicable)
      oversight.state ? db.query(`
        SELECT 
          p.city,
          COUNT(tb.id) as booking_count,
          COALESCE(SUM(tb.total_price), 0) as city_revenue,
          COUNT(DISTINCT tb.tenant_id) as unique_tenants,
          COUNT(DISTINCT tb.property_id) as unique_properties
        FROM transportation_bookings tb
        JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        WHERE tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
        GROUP BY p.city
        ORDER BY booking_count DESC
      `, [oversight.state]) : Promise.resolve({ rows: [] }),
      
      // System health metrics
      db.query(`
        SELECT * FROM transportation_system_health_view
        ORDER BY health_date DESC
        LIMIT 7
      `),
      
      // Recent critical alerts
      db.query(`
        SELECT 
          ta.*,
          tb.id as booking_id,
          ts.service_name,
          s.state_name AS state,
          p.city
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        LEFT JOIN transportation_services ts ON ta.related_service_id = ts.id
        WHERE ta.alert_level IN ('warning', 'critical')
          AND ta.is_resolved = FALSE
        ORDER BY ta.created_at DESC
        LIMIT 20
      `)
    ]);
    
    res.json({
      success: true,
      data: {
        oversight_config: oversight,
        national_statistics: nationalStats.rows[0],
        regional_breakdown: regionalStats.rows,
        state_breakdown: stateStats.rows,
        system_health: systemHealth.rows,
        recent_alerts: recentAlerts.rows
      }
    });
    
  } catch (error) {
    console.error('Get super admin transportation dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch super admin transportation dashboard data'
    });
  }
});

  // ====================== SUPER ADMIN TRANSPORTATION MANAGEMENT ======================

  /**
   * Get all state admin transportation jurisdictions
   */
  
  router.get('/super-admin/state-admins', async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        state, 
        search,
        can_manage_services 
      } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT 
          saj.*,
          u.full_name as admin_name,
          u.email as admin_email,
          u.user_type as admin_role,
          u.phone as admin_phone,
          u2.full_name as assigned_by_name
        FROM state_admin_transportation_jurisdiction saj
        JOIN users u ON saj.state_admin_id = u.id
        LEFT JOIN users u2 ON saj.assigned_by = u2.id
        WHERE u.deleted_at IS NULL
          AND u.approval_status = 'approved'
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM state_admin_transportation_jurisdiction saj
        JOIN users u ON saj.state_admin_id = u.id
        WHERE u.deleted_at IS NULL
          AND u.approval_status = 'approved'
      `;
      
      const params = [];
      const countParams = [];
      let paramCount = 1;
      
      if (state) {
        query += ` AND saj.state = $${paramCount}`;
        countQuery += ` AND saj.state = $${paramCount}`;
        params.push(state);
        countParams.push(state);
        paramCount++;
      }
      
      if (can_manage_services !== undefined) {
        query += ` AND saj.can_manage_services = $${paramCount}`;
        countQuery += ` AND saj.can_manage_services = $${paramCount}`;
        params.push(can_manage_services === 'true');
        countParams.push(can_manage_services === 'true');
        paramCount++;
      }
      
      if (search) {
        query += ` AND (
          u.full_name ILIKE $${paramCount} OR
          u.email ILIKE $${paramCount} OR
          saj.state ILIKE $${paramCount} OR
          saj.city ILIKE $${paramCount}
        )`;
        countQuery += ` AND (
          u.full_name ILIKE $${paramCount} OR
          u.email ILIKE $${paramCount} OR
          saj.state ILIKE $${paramCount} OR
          saj.city ILIKE $${paramCount}
        )`;
        params.push(`%${search}%`);
        countParams.push(`%${search}%`);
        paramCount++;
      }
      
      query += ` ORDER BY saj.state, saj.city LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);
      
      const [result, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, countParams)
      ]);
      
      res.json({
        success: true,
        data: {
          state_admins: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].total),
            total_pages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Get super admin state admins error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch state admins'
      });
    }
  });

  /**
   * Assign or update state admin transportation jurisdiction
   */
  router.post('/super-admin/state-admins/assign', async (req, res) => {
    try {
      const superAdminId = req.user.id;
      const { 
        state_admin_id, 
        state, 
        city = null, 
        can_monitor_bookings = true,
        can_manage_services = false,
        can_view_analytics = true,
        can_override_status = false
      } = req.body;
      
      // Validate state admin exists and is a state admin
      const adminCheck = await db.query(`
        SELECT id, user_type 
        FROM users 
        WHERE id = $1 
          AND user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
          AND deleted_at IS NULL
          AND approval_status = 'approved'
      `, [state_admin_id]);
      
      if (adminCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid state admin ID or user is not a state admin'
        });
      }
      
      // Check if jurisdiction already exists
      const existingJurisdiction = await db.query(`
        SELECT id 
        FROM state_admin_transportation_jurisdiction 
        WHERE state_admin_id = $1 AND state = $2 AND city IS NOT DISTINCT FROM $3
      `, [state_admin_id, state, city]);
      
      let result;
      if (existingJurisdiction.rows.length > 0) {
        // Update existing jurisdiction
        result = await db.query(`
          UPDATE state_admin_transportation_jurisdiction
          SET can_monitor_bookings = $1,
              can_manage_services = $2,
              can_view_analytics = $3,
              can_override_status = $4,
              assigned_by = $5
          WHERE id = $6
          RETURNING *
        `, [
          can_monitor_bookings,
          can_manage_services,
          can_view_analytics,
          can_override_status,
          superAdminId,
          existingJurisdiction.rows[0].id
        ]);
      } else {
        // Create new jurisdiction
        result = await db.query(`
          INSERT INTO state_admin_transportation_jurisdiction (
            state_admin_id, state, city, can_monitor_bookings,
            can_manage_services, can_view_analytics, can_override_status, assigned_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          state_admin_id, state, city, can_monitor_bookings,
          can_manage_services, can_view_analytics, can_override_status, superAdminId
        ]);
      }
      
      // Log the action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'assign_state_admin_jurisdiction', $2, NULL, NULL, $3, $4)
      `, [
        superAdminId,
        JSON.stringify({
          state_admin_id,
          state,
          city,
          permissions: {
            can_monitor_bookings,
            can_manage_services,
            can_view_analytics,
            can_override_status
          }
        }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: {
          jurisdiction: result.rows[0]
        },
        message: existingJurisdiction.rows.length > 0 
          ? 'Jurisdiction updated successfully' 
          : 'Jurisdiction assigned successfully'
      });
      
    } catch (error) {
      console.error('Assign state admin jurisdiction error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign jurisdiction'
      });
    }
  });

  /**
   * Remove state admin transportation jurisdiction
   */
  router.delete('/super-admin/state-admins/:jurisdictionId', async (req, res) => {
    try {
      const superAdminId = req.user.id;
      const { jurisdictionId } = req.params;
      
      // Get jurisdiction details for logging
      const jurisdiction = await db.query(`
        SELECT * FROM state_admin_transportation_jurisdiction WHERE id = $1
      `, [jurisdictionId]);
      
      if (jurisdiction.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Jurisdiction not found'
        });
      }
      
      // Delete jurisdiction
      await db.query(`
        DELETE FROM state_admin_transportation_jurisdiction WHERE id = $1
      `, [jurisdictionId]);
      
      // Log the action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'remove_state_admin_jurisdiction', $2, NULL, NULL, $3, $4)
      `, [
        superAdminId,
        JSON.stringify(jurisdiction.rows[0]),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        message: 'Jurisdiction removed successfully'
      });
      
    } catch (error) {
      console.error('Remove state admin jurisdiction error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove jurisdiction'
      });
    }
  });

  /**
   * Get super admin transportation oversight configuration
   */
  router.get('/super-admin/oversight', async (req, res) => {
    try {
      const superAdminId = req.user.id;
      
      const result = await db.query(`
        SELECT * FROM super_admin_transportation_oversight
        WHERE super_admin_id = $1
        ORDER BY oversight_level, state
      `, [superAdminId]);
      
      res.json({
        success: true,
        data: {
          oversight: result.rows
        }
      });
      
    } catch (error) {
      console.error('Get super admin oversight error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch oversight configuration'
      });
    }
  });

  /**
   * Update super admin transportation oversight
   */
  router.patch('/super-admin/oversight/:oversightId', async (req, res) => {
    try {
      const superAdminId = req.user.id;
      const { oversightId } = req.params;
      const updates = req.body;
      
      // Build dynamic update query
      const setClauses = [];
      const params = [];
      let paramCount = 1;
      
      // Only allow certain fields to be updated
      const allowedFields = [
        'can_manage_all_services',
        'can_view_all_analytics',
        'can_override_any_status',
        'can_assign_state_admins',
        'notes'
      ];
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = $${paramCount}`);
          params.push(value);
          paramCount++;
        }
      }
      
      if (setClauses.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }
      
      params.push(oversightId);
      paramCount++;
      
      const query = `
        UPDATE super_admin_transportation_oversight
        SET ${setClauses.join(', ')}
        WHERE id = $${paramCount - 1} AND super_admin_id = $${paramCount}
        RETURNING *
      `;
      params.push(superAdminId);
      
      const result = await db.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Oversight configuration not found'
        });
      }
      
      // Log the action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'update_oversight_config', $2, NULL, NULL, $3, $4)
      `, [
        superAdminId,
        JSON.stringify({ oversight_id: oversightId, updates }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: {
          oversight: result.rows[0]
        },
        message: 'Oversight configuration updated successfully'
      });
      
    } catch (error) {
      console.error('Update super admin oversight error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update oversight configuration'
      });
    }
  });

  /**
   * Get system-wide transportation alerts
   */
  router.get('/super-admin/alerts', async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        alert_level, 
        alert_type,
        is_resolved, 
        start_date, 
        end_date,
        state
      } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT 
          ta.*,
          tb.id as booking_id,
          ts.service_name,
          s.state_name AS state,
          p.city,
          u.full_name as admin_name,
          u2.full_name as resolved_by_name
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        LEFT JOIN transportation_services ts ON ta.related_service_id = ts.id
        LEFT JOIN users u ON ta.admin_id = u.id
        LEFT JOIN users u2 ON ta.resolved_by = u2.id
        WHERE 1=1
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN states s ON s.id = p.state_id
        WHERE 1=1
      `;
      
      const params = [];
      const countParams = [];
      let paramCount = 1;
      
      if (alert_level) {
        query += ` AND ta.alert_level = $${paramCount}`;
        countQuery += ` AND ta.alert_level = $${paramCount}`;
        params.push(alert_level);
        countParams.push(alert_level);
        paramCount++;
      }
      
      if (alert_type) {
        query += ` AND ta.alert_type = $${paramCount}`;
        countQuery += ` AND ta.alert_type = $${paramCount}`;
        params.push(alert_type);
        countParams.push(alert_type);
        paramCount++;
      }
      
      if (is_resolved !== undefined) {
        query += ` AND ta.is_resolved = $${paramCount}`;
        countQuery += ` AND ta.is_resolved = $${paramCount}`;
        params.push(is_resolved === 'true');
        countParams.push(is_resolved === 'true');
        paramCount++;
      }
      
      if (start_date) {
        query += ` AND ta.created_at >= $${paramCount}`;
        countQuery += ` AND ta.created_at >= $${paramCount}`;
        params.push(start_date);
        countParams.push(start_date);
        paramCount++;
      }
      
      if (end_date) {
        query += ` AND ta.created_at <= $${paramCount}`;
        countQuery += ` AND ta.created_at <= $${paramCount}`;
        params.push(end_date);
        countParams.push(end_date);
        paramCount++;
      }
      
      if (state) {
        query += ` AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($${paramCount}))`;
        countQuery += ` AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($${paramCount}))`;
        params.push(state);
        countParams.push(state);
        paramCount++;
      }
      
      query += ` ORDER BY ta.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);
      
      const [result, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, countParams)
      ]);
      
      res.json({
        success: true,
        data: {
          alerts: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].total),
            total_pages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Get super admin alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system alerts'
      });
    }
  });

  /**
   * Get transportation system performance metrics
   */
  router.get('/super-admin/performance-metrics', async (req, res) => {
    try {
      const { 
        metric_type, 
        start_date, 
        end_date,
        limit = 30
      } = req.query;
      
      let query = `
        SELECT * FROM transportation_performance_metrics
        WHERE 1=1
      `;
      
      const params = [];
      let paramCount = 1;
      
      if (metric_type) {
        query += ` AND metric_type = $${paramCount}`;
        params.push(metric_type);
        paramCount++;
      }
      
      if (start_date) {
        query += ` AND metric_date >= $${paramCount}`;
        params.push(start_date);
        paramCount++;
      }
      
      if (end_date) {
        query += ` AND metric_date <= $${paramCount}`;
        params.push(end_date);
        paramCount++;
      }
      
      query += ` ORDER BY metric_date DESC LIMIT $${paramCount}`;
      params.push(limit);
      
      const result = await db.query(query, params);
      
      // Calculate summary statistics
      const summary = {
        total_metrics: result.rows.length,
        date_range: result.rows.length > 0 ? {
          start: result.rows[result.rows.length - 1].metric_date,
          end: result.rows[0].metric_date
        } : null,
        metric_types: [...new Set(result.rows.map(r => r.metric_type))]
      };
      
      res.json({
        success: true,
        data: {
          metrics: result.rows,
          summary
        }
      });
      
    } catch (error) {
      console.error('Get performance metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance metrics'
      });
    }
  });

  /**
   * Get transportation system health report
   */
  router.get('/super-admin/system-health', async (req, res) => {
    try {
      const rawDays = req.query.days;
      const days = rawDays && /^\d+$/.test(rawDays) ? parseInt(rawDays, 10) : 30;
      const intervalStr = `${days} days`;
      
      const [healthData, currentStats, alertSummary, performanceTrends] = await Promise.all([
        // System health data
        db.query(`
          SELECT * FROM transportation_system_health_view
          WHERE health_date >= CURRENT_DATE - $1::interval
          ORDER BY health_date DESC
        `, [intervalStr]),
        
        // Current system statistics
        db.query(`
          SELECT 
            COUNT(*) as total_active_bookings,
            COUNT(CASE WHEN booking_status = 'pending' THEN 1 END) as pending_bookings,
            COUNT(CASE WHEN booking_status = 'in_progress' THEN 1 END) as in_progress_bookings,
            COUNT(DISTINCT tenant_id) as active_tenants,
            COUNT(DISTINCT service_id) as active_services,
            COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN total_price ELSE 0 END), 0) as today_revenue
          FROM transportation_bookings
          WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        `),
        
        // Alert summary
        db.query(`
          SELECT 
            alert_level,
            COUNT(*) as count,
            COUNT(CASE WHEN is_resolved = FALSE THEN 1 END) as unresolved
          FROM transportation_alerts
          WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
          GROUP BY alert_level
          ORDER BY alert_level
        `),
        
        // Performance trends
        db.query(`
          SELECT 
            metric_type,
            AVG(metric_value) as avg_value,
            MIN(metric_value) as min_value,
            MAX(metric_value) as max_value,
            COUNT(*) as data_points
          FROM transportation_performance_metrics
          WHERE metric_date >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY metric_type
          ORDER BY metric_type
        `)
      ]);
      
      res.json({
        success: true,
        data: {
          health_data: healthData.rows,
          current_stats: currentStats.rows[0],
          alert_summary: alertSummary.rows,
          performance_trends: performanceTrends.rows
        }
      });
      
    } catch (error) {
      console.error('Get system health error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system health report'
      });
    }
  });

   /**
   * Generate transportation system report
   */
  router.post('/super-admin/generate-report', async (req, res) => {
    try {
      const superAdminId = req.user.id;
      const { 
        report_type = 'comprehensive',
        start_date, 
        end_date,
        include_states = [],
        include_metrics = ['revenue', 'bookings', 'alerts']
      } = req.body;
      
      // Validate date range
      let startDateParam = null;
      let endDateParam = null;
      
      if (start_date) {
        const d = new Date(start_date);
        if (!isNaN(d.getTime())) {
          startDateParam = d.toISOString();
        } else {
          return res.status(400).json({ success: false, message: 'Invalid start_date format' });
        }
      }
      
      if (end_date) {
        const d = new Date(end_date);
        if (!isNaN(d.getTime())) {
          endDateParam = d.toISOString();
        } else {
          return res.status(400).json({ success: false, message: 'Invalid end_date format' });
        }
      }
      
      // Parameterized: $1 = states (or NULL), $2 = start (or NULL), $3 = end (or NULL)
      const statesParam = include_states.length > 0 ? include_states : null;
      
      // Generate report based on type
      let reportData = {};
      
      if (report_type === 'comprehensive' || report_type === 'revenue') {
        const revenueReport = await db.query(`
          SELECT 
            DATE(tb.created_at) as report_date,
            COUNT(*) as booking_count,
            COALESCE(SUM(tb.total_price), 0) as daily_revenue,
            AVG(tb.total_price) as avg_booking_value,
            COUNT(DISTINCT tb.tenant_id) as unique_tenants,
            COUNT(DISTINCT tb.property_id) as unique_properties
          FROM transportation_bookings tb
          LEFT JOIN properties p ON tb.property_id = p.id
          LEFT JOIN states s ON s.id = p.state_id
          WHERE (s.state_name = ANY($1) OR $1 IS NULL)
            AND tb.created_at >= COALESCE($2::timestamptz, CURRENT_DATE - INTERVAL '30 days')
            AND tb.created_at <= COALESCE($3::timestamptz, CURRENT_DATE)
            AND tb.payment_status = 'completed'
          GROUP BY DATE(tb.created_at)
          ORDER BY report_date DESC
        `, [statesParam, startDateParam, endDateParam]);
        
        reportData.revenue = revenueReport.rows;
      }
      
      if (report_type === 'comprehensive' || report_type === 'bookings') {
        const bookingsReport = await db.query(`
          SELECT 
            ts.service_type,
            ts.service_name,
            COUNT(tb.id) as total_bookings,
            COUNT(CASE WHEN tb.booking_status = 'completed' THEN 1 END) as completed_bookings,
            COUNT(CASE WHEN tb.booking_status = 'cancelled' THEN 1 END) as cancelled_bookings,
            COALESCE(SUM(tb.total_price), 0) as total_revenue,
            AVG(tb.total_price) as avg_price,
            AVG(EXTRACT(EPOCH FROM (tb.completed_at - tb.started_at))) as avg_duration_seconds
          FROM transportation_bookings tb
          JOIN transportation_services ts ON tb.service_id = ts.id
          LEFT JOIN properties p ON tb.property_id = p.id
          LEFT JOIN states s ON s.id = p.state_id
          WHERE (s.state_name = ANY($1) OR $1 IS NULL)
            AND tb.created_at >= COALESCE($2::timestamptz, CURRENT_DATE - INTERVAL '30 days')
            AND tb.created_at <= COALESCE($3::timestamptz, CURRENT_DATE)
          GROUP BY ts.service_type, ts.service_name
          ORDER BY total_bookings DESC
        `, [statesParam, startDateParam, endDateParam]);
        
        reportData.bookings = bookingsReport.rows;
      }
      
      if (report_type === 'comprehensive' || report_type === 'alerts') {
        const alertsReport = await db.query(`
          SELECT 
            ta.alert_type,
            ta.alert_level,
            COUNT(*) as total_alerts,
            COUNT(CASE WHEN ta.is_resolved = TRUE THEN 1 END) as resolved_alerts,
            COUNT(CASE WHEN ta.is_resolved = FALSE THEN 1 END) as unresolved_alerts,
            MIN(ta.created_at) as first_alert_date,
            MAX(ta.created_at) as last_alert_date
          FROM transportation_alerts ta
          LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
          LEFT JOIN properties p ON tb.property_id = p.id
          LEFT JOIN states s ON s.id = p.state_id
          WHERE (s.state_name = ANY($1) OR $1 IS NULL)
            AND ta.created_at >= COALESCE($2::timestamptz, CURRENT_DATE - INTERVAL '30 days')
            AND ta.created_at <= COALESCE($3::timestamptz, CURRENT_DATE)
          GROUP BY ta.alert_type, ta.alert_level
          ORDER BY total_alerts DESC
        `, [statesParam, startDateParam, endDateParam]);
        
        reportData.alerts = alertsReport.rows;
      }
      
      if (report_type === 'comprehensive' || include_metrics.includes('performance')) {
        const performanceReport = await db.query(`
          SELECT 
            metric_type,
            AVG(metric_value) as avg_value,
            MIN(metric_value) as min_value,
            MAX(metric_value) as max_value,
            COUNT(*) as data_points
          FROM transportation_performance_metrics
          WHERE metric_date >= COALESCE($1::timestamptz, CURRENT_DATE - INTERVAL '30 days')
            AND metric_date <= COALESCE($2::timestamptz, CURRENT_DATE)
          GROUP BY metric_type
          ORDER BY metric_type
        `, [startDateParam, endDateParam]);
        
        reportData.performance = performanceReport.rows;
      }
      
      // Calculate summary
      const summary = {
        report_type,
        date_range: {
          start: start_date || 'Last 30 days',
          end: end_date || 'Today'
        },
        states_included: include_states.length > 0 ? include_states : ['All states'],
        generated_at: new Date().toISOString(),
        generated_by: superAdminId
      };
      
      // Log the report generation
      await db.query(`
        SELECT log_transportation_admin_action($1, 'generate_system_report', $2, NULL, NULL, $3, $4)
      `, [
        superAdminId,
        JSON.stringify({
          report_type,
          date_range: summary.date_range,
          states_included: summary.states_included
        }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: {
          report: reportData,
          summary,
          metadata: {
            format: 'json',
            version: '1.0'
          }
        }
      });
      
    } catch (error) {
      console.error('Generate system report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate system report'
      });
    }
  });

  // ====================== COMMON ADMIN ALERT MANAGEMENT ======================

  /**
   * Get all transportation alerts (for admins with appropriate permissions)
   */
  router.get('/alerts', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      const { 
        page = 1, 
        limit = 20, 
        alert_level, 
        alert_type,
        is_resolved, 
        start_date, 
        end_date 
      } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT 
          ta.*,
          tb.id as booking_id,
          ts.service_name,
          s.state_name AS state,
          p.city,
          u.full_name as admin_name,
          u2.full_name as resolved_by_name
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN transportation_services ts ON ta.related_service_id = ts.id
        LEFT JOIN users u ON ta.admin_id = u.id
        LEFT JOIN users u2 ON ta.resolved_by = u2.id
        WHERE 1=1
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM transportation_alerts ta
        WHERE 1=1
      `;
      
      const params = [];
      const countParams = [];
      let paramCount = 1;
      
      // State admins can only see alerts from their state
      if (adminType.includes('state')) {
        const adminResult = await db.query(`
          SELECT assigned_state FROM users WHERE id = $1
        `, [adminId]);
        
        if (adminResult.rows.length > 0 && adminResult.rows[0].assigned_state) {
          query += ` AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($${paramCount}))`;
          countQuery += ` AND EXISTS (
            SELECT 1 FROM transportation_bookings tb2
            JOIN properties p2 ON tb2.property_id = p2.id
            WHERE tb2.id = ta.related_booking_id
              AND p2.state = $${paramCount}
          )`;
          params.push(adminResult.rows[0].assigned_state);
          countParams.push(adminResult.rows[0].assigned_state);
          paramCount++;
        }
      }
      
      if (alert_level) {
        query += ` AND ta.alert_level = $${paramCount}`;
        countQuery += ` AND ta.alert_level = $${paramCount}`;
        params.push(alert_level);
        countParams.push(alert_level);
        paramCount++;
      }
      
      if (alert_type) {
        query += ` AND ta.alert_type = $${paramCount}`;
        countQuery += ` AND ta.alert_type = $${paramCount}`;
        params.push(alert_type);
        countParams.push(alert_type);
        paramCount++;
      }
      
      if (is_resolved !== undefined) {
        query += ` AND ta.is_resolved = $${paramCount}`;
        countQuery += ` AND ta.is_resolved = $${paramCount}`;
        params.push(is_resolved === 'true');
        countParams.push(is_resolved === 'true');
        paramCount++;
      }
      
      if (start_date) {
        query += ` AND ta.created_at >= $${paramCount}`;
        countQuery += ` AND ta.created_at >= $${paramCount}`;
        params.push(start_date);
        countParams.push(start_date);
        paramCount++;
      }
      
      if (end_date) {
        query += ` AND ta.created_at <= $${paramCount}`;
        countQuery += ` AND ta.created_at <= $${paramCount}`;
        params.push(end_date);
        countParams.push(end_date);
        paramCount++;
      }
      
      query += ` ORDER BY ta.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);
      
      const [result, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, countParams)
      ]);
      
      res.json({
        success: true,
        data: {
          alerts: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].total),
            total_pages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Get alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alerts'
      });
    }
  });

  /**
   * Create a new transportation alert
   */
  router.post('/alerts', async (req, res) => {
    try {
      const adminId = req.user.id;
      const {
        alert_type,
        alert_level,
        alert_title,
        alert_description,
        related_booking_id,
        related_service_id
      } = req.body;
      
      // Validate required fields
      if (!alert_type || !alert_level || !alert_title) {
        return res.status(400).json({
          success: false,
          message: 'Alert type, level, and title are required'
        });
      }
      
      // Validate alert level
      const validLevels = ['info', 'warning', 'critical'];
      if (!validLevels.includes(alert_level)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid alert level. Must be one of: info, warning, critical'
        });
      }
      
      // Check permissions for state admins
      const adminType = req.user.user_type;
      if (adminType.includes('state') && related_booking_id) {
        const jurisdictionCheck = await db.query(`
          SELECT can_monitor_bookings 
          FROM state_admin_transportation_jurisdiction 
          WHERE state_admin_id = $1
        `, [adminId]);
        
        if (jurisdictionCheck.rows.length === 0 || !jurisdictionCheck.rows[0].can_monitor_bookings) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to create alerts for bookings'
          });
        }
      }
      
      // Create alert
      const result = await db.query(`
        INSERT INTO transportation_alerts (
          alert_type, alert_level, alert_title, alert_description,
          related_booking_id, related_service_id, admin_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        alert_type, alert_level, alert_title, alert_description,
        related_booking_id, related_service_id, adminId
      ]);
      
      // Log the action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'create_alert', $2, $3, $4, $5, $6)
      `, [
        adminId,
        JSON.stringify({
          alert_type,
          alert_level,
          alert_title
        }),
        related_booking_id,
        related_service_id,
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.status(201).json({
        success: true,
        data: {
          alert: result.rows[0]
        },
        message: 'Alert created successfully'
      });
      
    } catch (error) {
      console.error('Create alert error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create alert'
      });
    }
  });

  /**
   * Update alert resolution status
   */
  router.patch('/alerts/:alertId/resolve', async (req, res) => {
    try {
      const adminId = req.user.id;
      const { alertId } = req.params;
      const { resolution_notes } = req.body;
      
      // Check if user has permission to resolve this alert
      const alertCheck = await db.query(`
        SELECT ta.*, s.state_name AS state
        FROM transportation_alerts ta
        LEFT JOIN transportation_bookings tb ON ta.related_booking_id = tb.id
        LEFT JOIN properties p ON tb.property_id = p.id
        WHERE ta.id = $1
      `, [alertId]);
      
      if (alertCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }
      
      const alert = alertCheck.rows[0];
      const adminType = req.user.user_type;
      
      // Check permissions
      if (adminType.includes('state')) {
        // State admin can only resolve alerts from their state
        const adminResult = await db.query(`
          SELECT assigned_state FROM users WHERE id = $1
        `, [adminId]);
        
        if (adminResult.rows.length === 0 || 
            adminResult.rows[0].assigned_state !== alert.state) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to resolve this alert'
          });
        }
      }
      
      // Update alert
      const result = await db.query(`
        UPDATE transportation_alerts
        SET is_resolved = TRUE,
            resolved_at = NOW(),
            resolved_by = $1,
            resolution_notes = $2
        WHERE id = $3
        RETURNING *
      `, [adminId, resolution_notes, alertId]);
      
      // Log the action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'resolve_alert', $2, $3, NULL, $4, $5)
      `, [
        adminId,
        JSON.stringify({ 
          alert_id: alertId, 
          resolution_notes,
          previous_state: alert
        }),
        alert.related_booking_id,
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: {
          alert: result.rows[0]
        },
        message: 'Alert resolved successfully'
      });
      
    } catch (error) {
      console.error('Resolve alert error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resolve alert'
      });
    }
  });

  /**
   * Delete an alert (super admin only)
   */
  router.delete('/alerts/:alertId', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      const { alertId } = req.params;
      
      // Only super admins can delete alerts
      if (!adminType.includes('super')) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins can delete alerts'
        });
      }
      
      // Get alert details for logging
      const alert = await db.query(`
        SELECT * FROM transportation_alerts WHERE id = $1
      `, [alertId]);
      
      if (alert.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }
      
      // Delete alert
      await db.query(`
        DELETE FROM transportation_alerts WHERE id = $1
      `, [alertId]);
      
      // Log the action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'delete_alert', $2, $3, $4, $5, $6)
      `, [
        adminId,
        JSON.stringify(alert.rows[0]),
        alert.rows[0].related_booking_id,
        alert.rows[0].related_service_id,
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        message: 'Alert deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete alert error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete alert'
      });
    }
  });

  // ====================== PERFORMANCE METRICS ROUTES ======================

  /**
   * Get transportation performance metrics
   */
  router.get('/performance-metrics', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      const { 
        metric_type, 
        start_date, 
        end_date,
                limit = 30
      } = req.query;
      
      let query = `
        SELECT * FROM transportation_performance_metrics
        WHERE 1=1
      `;
      
      const params = [];
      let paramCount = 1;
      
      if (metric_type) {
        query += ` AND metric_type = $${paramCount}`;
        params.push(metric_type);
        paramCount++;
      }
      
      if (start_date) {
        query += ` AND metric_date >= $${paramCount}`;
        params.push(start_date);
        paramCount++;
      }
      
      if (end_date) {
        query += ` AND metric_date <= $${paramCount}`;
        params.push(end_date);
        paramCount++;
      }
      
      // State admins can only see metrics from their state
      if (adminType.includes('state')) {
        const adminResult = await db.query(`
          SELECT assigned_state FROM users WHERE id = $1
        `, [adminId]);
        
        if (adminResult.rows.length > 0 && adminResult.rows[0].assigned_state) {
          // For state admins, we need to filter metrics by state
          // This assumes metrics have state breakdown in the JSONB field
          query += ` AND breakdown->>'state' = $${paramCount}`;
          params.push(adminResult.rows[0].assigned_state);
          paramCount++;
        }
      }
      
      query += ` ORDER BY metric_date DESC LIMIT $${paramCount}`;
      params.push(limit);
      
      const result = await db.query(query, params);
      
      res.json({
        success: true,
        data: {
          metrics: result.rows
        }
      });
      
    } catch (error) {
      console.error('Get performance metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance metrics'
      });
    }
  });

  /**
   * Calculate and store performance metrics (admin only)
   */
  router.post('/performance-metrics/calculate', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      // Only admins and super admins can trigger metric calculation
      if (!adminType.includes('admin') && !adminType.includes('super')) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can trigger metric calculation'
        });
      }
      
      const { metric_date = 'CURRENT_DATE', force_recalculate = false } = req.body;
      
      // Check if metrics already exist for this date
      if (!force_recalculate) {
        const existingMetrics = await db.query(`
          SELECT COUNT(*) as count 
          FROM transportation_performance_metrics 
          WHERE metric_date = $1
        `, [metric_date]);
        
        if (existingMetrics.rows[0].count > 0) {
          return res.status(400).json({
            success: false,
            message: 'Metrics already exist for this date. Use force_recalculate=true to overwrite.'
          });
        }
      }
      
      // Calculate various performance metrics
      const metricsToCalculate = [
        {
          type: 'daily_revenue',
          query: `
            SELECT 
              COALESCE(SUM(total_price), 0) as value,
              jsonb_build_object(
                'completed_bookings', COUNT(CASE WHEN booking_status = 'completed' THEN 1 END),
                'cancelled_bookings', COUNT(CASE WHEN booking_status = 'cancelled' THEN 1 END),
                'avg_booking_value', COALESCE(AVG(total_price), 0)
              ) as breakdown
            FROM transportation_bookings
            WHERE DATE(created_at) = $1
              AND payment_status = 'completed'
          `
        },
        {
          type: 'booking_success_rate',
          query: `
            SELECT 
              CASE 
                WHEN COUNT(*) = 0 THEN 0
                ELSE (COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) * 100.0 / COUNT(*))
              END as value,
              jsonb_build_object(
                'total_bookings', COUNT(*),
                'completed_bookings', COUNT(CASE WHEN booking_status = 'completed' THEN 1 END),
                'cancelled_bookings', COUNT(CASE WHEN booking_status = 'cancelled' THEN 1 END)
              ) as breakdown
            FROM transportation_bookings
            WHERE DATE(created_at) = $1
          `
        },
        {
          type: 'payment_success_rate',
          query: `
            SELECT 
              CASE 
                WHEN COUNT(*) = 0 THEN 0
                ELSE (COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) * 100.0 / COUNT(*))
              END as value,
              jsonb_build_object(
                'total_payments', COUNT(*),
                'completed_payments', COUNT(CASE WHEN payment_status = 'completed' THEN 1 END),
                'failed_payments', COUNT(CASE WHEN payment_status = 'failed' THEN 1 END)
              ) as breakdown
            FROM transportation_bookings
            WHERE DATE(created_at) = $1
          `
        },
        {
          type: 'avg_confirmation_time',
          query: `
            SELECT 
              COALESCE(AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))), 0) as value,
              jsonb_build_object(
                'bookings_measured', COUNT(*),
                'min_time', MIN(EXTRACT(EPOCH FROM (confirmed_at - created_at))),
                'max_time', MAX(EXTRACT(EPOCH FROM (confirmed_at - created_at)))
              ) as breakdown
            FROM transportation_bookings
            WHERE DATE(created_at) = $1
              AND confirmed_at IS NOT NULL
          `
        },
        {
          type: 'unique_tenants_daily',
          query: `
            SELECT 
              COUNT(DISTINCT tenant_id) as value,
              jsonb_build_object(
                'total_bookings', COUNT(*),
                'repeat_tenants', COUNT(*) - COUNT(DISTINCT tenant_id)
              ) as breakdown
            FROM transportation_bookings
            WHERE DATE(created_at) = $1
          `
        }
      ];
      
      // Calculate and store each metric
      const calculatedMetrics = [];
      
      for (const metric of metricsToCalculate) {
        const result = await db.query(metric.query, [metric_date]);
        
        if (result.rows.length > 0 && result.rows[0].value !== null) {
          // Delete existing metric if force recalculate
          if (force_recalculate) {
            await db.query(`
              DELETE FROM transportation_performance_metrics 
              WHERE metric_date = $1 AND metric_type = $2
            `, [metric_date, metric.type]);
          }
          
          // Insert new metric
          const insertResult = await db.query(`
            INSERT INTO transportation_performance_metrics (
              metric_date, metric_type, metric_value, breakdown
            ) VALUES ($1, $2, $3, $4)
            RETURNING *
          `, [
            metric_date,
            metric.type,
            result.rows[0].value,
            result.rows[0].breakdown
          ]);
          
          calculatedMetrics.push({
            type: metric.type,
            value: result.rows[0].value,
            metric: insertResult.rows[0]
          });
        }
      }
      
      // Log the action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'calculate_performance_metrics', $2, NULL, NULL, $3, $4)
      `, [
        adminId,
        JSON.stringify({
          metric_date,
          metrics_calculated: calculatedMetrics.length,
          metric_types: calculatedMetrics.map(m => m.type)
        }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: {
          metrics_calculated: calculatedMetrics.length,
          metrics: calculatedMetrics,
          summary: {
            date: metric_date,
            force_recalculate,
            calculated_at: new Date().toISOString()
          }
        },
        message: `Successfully calculated ${calculatedMetrics.length} performance metrics`
      });
      
    } catch (error) {
      console.error('Calculate performance metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate performance metrics'
      });
    }
  });

  // ====================== SYSTEM HEALTH MONITORING ======================

  /**
   * Get transportation system health status
   */
  router.get('/system-health', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      const rawDays = req.query.days;
      const days = rawDays && /^\d+$/.test(rawDays) ? parseInt(rawDays, 10) : 7;
      const intervalStr = `${days} days`;
      
      let query = `
        SELECT * FROM transportation_system_health_view
        WHERE health_date >= CURRENT_DATE - $1::interval
        ORDER BY health_date DESC
      `;
      
      // State admins can only see health data from their state
      if (adminType.includes('state')) {
        const adminResult = await db.query(`
          SELECT assigned_state FROM users WHERE id = $1
        `, [adminId]);
        
        if (adminResult.rows.length > 0 && adminResult.rows[0].assigned_state) {
          // For state-specific health data, we need to filter
          // This is a simplified version - in production you'd want a state-specific view
          query = `
            SELECT 
              DATE(tb.created_at) as health_date,
              COUNT(*) as total_bookings,
              COUNT(CASE WHEN tb.booking_status = 'completed' THEN 1 END) as completed_bookings,
              COUNT(CASE WHEN tb.booking_status = 'cancelled' THEN 1 END) as cancelled_bookings,
              COUNT(CASE WHEN tb.payment_status = 'completed' THEN 1 END) as paid_bookings,
              COUNT(CASE WHEN tb.payment_status = 'failed' THEN 1 END) as failed_payments,
              COALESCE(SUM(tb.total_price), 0) as daily_revenue,
              COUNT(DISTINCT tb.tenant_id) as unique_tenants,
              COUNT(DISTINCT tb.property_id) as unique_properties,
              COUNT(DISTINCT tb.service_id) as active_services_used,
              AVG(EXTRACT(EPOCH FROM (tb.confirmed_at - tb.created_at))) as avg_confirmation_time_seconds,
              AVG(EXTRACT(EPOCH FROM (tb.completed_at - tb.started_at))) as avg_completion_time_seconds
            FROM transportation_bookings tb
            JOIN properties p ON tb.property_id = p.id
            LEFT JOIN states s ON s.id = p.state_id
            WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
              AND tb.created_at >= CURRENT_DATE - $2::interval
            GROUP BY DATE(tb.created_at)
            ORDER BY health_date DESC
          `;
          
          const result = await db.query(query, [adminResult.rows[0].assigned_state, intervalStr]);
          
          return res.json({
            success: true,
            data: {
              health_data: result.rows,
              jurisdiction: adminResult.rows[0].assigned_state
            }
          });
        }
      }
      
      const result = await db.query(query);
      
      res.json({
        success: true,
        data: {
          health_data: result.rows
        }
      });
      
    } catch (error) {
      console.error('Get system health error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system health data'
      });
    }
  });

  /**
   * Get system status overview
   */
  router.get('/system-status', async (req, res) => {
    try {
      const [currentStats, recentAlerts, serviceStatus, performanceMetrics] = await Promise.all([
        // Current system statistics
        db.query(`
          SELECT 
            COUNT(*) as total_active_bookings,
            COUNT(CASE WHEN booking_status = 'pending' THEN 1 END) as pending_bookings,
            COUNT(CASE WHEN booking_status = 'in_progress' THEN 1 END) as in_progress_bookings,
            COUNT(DISTINCT tenant_id) as active_tenants_last_7_days,
            COUNT(DISTINCT service_id) as active_services_last_7_days,
            COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN total_price ELSE 0 END), 0) as today_revenue,
            COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN total_price ELSE 0 END), 0) as weekly_revenue
          FROM transportation_bookings
          WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        `),
        
        // Recent critical alerts
        db.query(`
          SELECT COUNT(*) as total_alerts,
            COUNT(CASE WHEN alert_level = 'critical' AND is_resolved = FALSE THEN 1 END) as critical_unresolved,
            COUNT(CASE WHEN alert_level = 'warning' AND is_resolved = FALSE THEN 1 END) as warning_unresolved,
            COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_alerts
          FROM transportation_alerts
          WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
        `),
        
        // Service status
        db.query(`
          SELECT 
            COUNT(*) as total_services,
            COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_services,
            COUNT(CASE WHEN is_active = FALSE THEN 1 END) as inactive_services,
            COUNT(DISTINCT service_type) as service_types
          FROM transportation_services
        `),
        
        // Latest performance metrics
        db.query(`
          SELECT 
            metric_type,
            metric_value,
            metric_date
          FROM transportation_performance_metrics
          WHERE metric_date = (SELECT MAX(metric_date) FROM transportation_performance_metrics)
          ORDER BY metric_type
        `)
      ]);
      
      // Calculate system health score
      const stats = currentStats.rows[0];
      const alerts = recentAlerts.rows[0];
      const services = serviceStatus.rows[0];
      
      let healthScore = 100;
      
      // Deduct for critical alerts
      if (alerts.critical_unresolved > 0) {
        healthScore -= (alerts.critical_unresolved * 10);
      }
      
      // Deduct for warning alerts
      if (alerts.warning_unresolved > 0) {
        healthScore -= (alerts.warning_unresolved * 5);
      }
      
      // Deduct for inactive services
      if (services.inactive_services > 0) {
        const inactivePercentage = (services.inactive_services / services.total_services) * 100;
        healthScore -= (inactivePercentage * 0.5);
      }
      
      // Ensure score is between 0 and 100
      healthScore = Math.max(0, Math.min(100, healthScore));
      
      // Determine health status
      let healthStatus = 'healthy';
      if (healthScore < 70) healthStatus = 'degraded';
      if (healthScore < 40) healthStatus = 'critical';
      
      res.json({
        success: true,
        data: {
          system_status: {
            health_score: Math.round(healthScore),
            health_status: healthStatus,
            last_updated: new Date().toISOString()
          },
          current_stats: stats,
          alert_summary: alerts,
          service_status: services,
          performance_metrics: performanceMetrics.rows
        }
      });
      
    } catch (error) {
      console.error('Get system status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system status'
      });
    }
  });

  /**
   * Run system diagnostics
   */
  router.post('/system-diagnostics', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      // Only admins and super admins can run diagnostics
      if (!adminType.includes('admin') && !adminType.includes('super')) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can run system diagnostics'
        });
      }
      
      const diagnostics = {
        timestamp: new Date().toISOString(),
        checks: [],
        issues_found: 0,
        warnings: 0
      };
      
      // Check 1: Database connectivity
      try {
        const dbCheck = await db.query('SELECT 1 as connectivity_check');
        diagnostics.checks.push({
          name: 'Database Connectivity',
          status: 'pass',
          details: 'Database connection successful',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        diagnostics.checks.push({
          name: 'Database Connectivity',
          status: 'fail',
          details: `Database connection failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        diagnostics.issues_found++;
      }
      
      // Check 2: Transportation tables exist
      try {
        const tableCheck = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'transportation_bookings'
          ) as bookings_table,
          EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'transportation_services'
          ) as services_table,
          EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'transportation_alerts'
          ) as alerts_table
        `);
        
        const tables = tableCheck.rows[0];
        const missingTables = [];
        
        if (!tables.bookings_table) missingTables.push('transportation_bookings');
        if (!tables.services_table) missingTables.push('transportation_services');
        if (!tables.alerts_table) missingTables.push('transportation_alerts');
        
        if (missingTables.length === 0) {
          diagnostics.checks.push({
            name: 'Required Tables',
            status: 'pass',
            details: 'All required transportation tables exist',
            timestamp: new Date().toISOString()
          });
        } else {
          diagnostics.checks.push({
            name: 'Required Tables',
            status: 'fail',
            details: `Missing tables: ${missingTables.join(', ')}`,
            timestamp: new Date().toISOString()
          });
          diagnostics.issues_found++;
        }
      } catch (error) {
        diagnostics.checks.push({
          name: 'Required Tables',
          status: 'error',
          details: `Table check failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        diagnostics.issues_found++;
      }
      
      // Check 3: Active services
      try {
                const activeServices = await db.query(`
          SELECT COUNT(*) as count 
          FROM transportation_services 
          WHERE is_active = TRUE
        `);
        
        if (activeServices.rows[0].count > 0) {
          diagnostics.checks.push({
            name: 'Active Services',
            status: 'pass',
            details: `${activeServices.rows[0].count} active transportation services`,
            timestamp: new Date().toISOString()
          });
        } else {
          diagnostics.checks.push({
            name: 'Active Services',
            status: 'warning',
            details: 'No active transportation services found',
            timestamp: new Date().toISOString()
          });
          diagnostics.warnings++;
        }
      } catch (error) {
        diagnostics.checks.push({
          name: 'Active Services',
          status: 'error',
          details: `Active services check failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        diagnostics.issues_found++;
      }
      
      // Check 4: Recent bookings activity
      try {
        const recentBookings = await db.query(`
          SELECT COUNT(*) as count 
          FROM transportation_bookings 
          WHERE created_at >= CURRENT_DATE - INTERVAL '24 hours'
        `);
        
        diagnostics.checks.push({
          name: 'Recent Activity',
          status: 'pass',
          details: `${recentBookings.rows[0].count} bookings in last 24 hours`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        diagnostics.checks.push({
          name: 'Recent Activity',
          status: 'error',
          details: `Recent activity check failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        diagnostics.issues_found++;
      }
      
      // Check 5: Unresolved critical alerts
      try {
        const criticalAlerts = await db.query(`
          SELECT COUNT(*) as count 
          FROM transportation_alerts 
          WHERE alert_level = 'critical' 
            AND is_resolved = FALSE
            AND created_at >= CURRENT_DATE - INTERVAL '7 days'
        `);
        
        if (criticalAlerts.rows[0].count === 0) {
          diagnostics.checks.push({
            name: 'Critical Alerts',
            status: 'pass',
            details: 'No unresolved critical alerts',
            timestamp: new Date().toISOString()
          });
        } else {
          diagnostics.checks.push({
            name: 'Critical Alerts',
            status: 'warning',
            details: `${criticalAlerts.rows[0].count} unresolved critical alerts`,
            timestamp: new Date().toISOString()
          });
          diagnostics.warnings++;
        }
      } catch (error) {
        diagnostics.checks.push({
          name: 'Critical Alerts',
          status: 'error',
          details: `Critical alerts check failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        diagnostics.issues_found++;
      }
      
      // Check 6: Performance metrics freshness
      try {
        const latestMetrics = await db.query(`
          SELECT MAX(metric_date) as latest_date 
          FROM transportation_performance_metrics
        `);
        
        const latestDate = latestMetrics.rows[0].latest_date;
        if (latestDate) {
          const daysSinceUpdate = Math.floor((new Date() - new Date(latestDate)) / (1000 * 60 * 60 * 24));
          
          if (daysSinceUpdate <= 1) {
            diagnostics.checks.push({
              name: 'Performance Metrics',
              status: 'pass',
              details: `Metrics updated ${daysSinceUpdate === 0 ? 'today' : 'yesterday'}`,
              timestamp: new Date().toISOString()
            });
          } else if (daysSinceUpdate <= 3) {
            diagnostics.checks.push({
              name: 'Performance Metrics',
              status: 'warning',
              details: `Metrics last updated ${daysSinceUpdate} days ago`,
              timestamp: new Date().toISOString()
            });
            diagnostics.warnings++;
          } else {
            diagnostics.checks.push({
              name: 'Performance Metrics',
              status: 'fail',
              details: `Metrics last updated ${daysSinceUpdate} days ago`,
              timestamp: new Date().toISOString()
            });
            diagnostics.issues_found++;
          }
        } else {
          diagnostics.checks.push({
            name: 'Performance Metrics',
            status: 'warning',
            details: 'No performance metrics found',
            timestamp: new Date().toISOString()
          });
          diagnostics.warnings++;
        }
      } catch (error) {
        diagnostics.checks.push({
          name: 'Performance Metrics',
          status: 'error',
          details: `Performance metrics check failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        diagnostics.issues_found++;
      }
      
      // Calculate overall status
      let overallStatus = 'healthy';
      if (diagnostics.issues_found > 0) overallStatus = 'degraded';
      if (diagnostics.issues_found > 3) overallStatus = 'critical';
      
      diagnostics.overall_status = overallStatus;
      diagnostics.summary = {
        total_checks: diagnostics.checks.length,
        passed: diagnostics.checks.filter(c => c.status === 'pass').length,
        warnings: diagnostics.warnings,
        failures: diagnostics.issues_found,
        errors: diagnostics.checks.filter(c => c.status === 'error').length
      };
      
      // Log the diagnostic run
      await db.query(`
        SELECT log_transportation_admin_action($1, 'run_system_diagnostics', $2, NULL, NULL, $3, $4)
      `, [
        adminId,
        JSON.stringify({
          overall_status: diagnostics.overall_status,
          summary: diagnostics.summary
        }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: diagnostics,
        message: `System diagnostics completed. Status: ${overallStatus.toUpperCase()}`
      });
      
    } catch (error) {
      console.error('Run system diagnostics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to run system diagnostics'
      });
    }
  });

  // ====================== ADMIN ACTION LOGS ======================

  /**
   * Get admin transportation action logs
   */
  router.get('/action-logs', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      const { 
        page = 1, 
        limit = 20, 
        action_type, 
        start_date, 
        end_date,
        admin_user_id,
        booking_id,
        service_id
      } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT 
          ata.*,
          u.full_name as admin_name,
          u.email as admin_email,
          u.user_type as admin_role,
          tb.id as related_booking_id,
          ts.service_name as related_service_name
        FROM admin_transportation_actions ata
        JOIN users u ON ata.admin_id = u.id
        LEFT JOIN transportation_bookings tb ON ata.booking_id = tb.id
        LEFT JOIN transportation_services ts ON ata.service_id = ts.id
        WHERE 1=1
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM admin_transportation_actions ata
        WHERE 1=1
      `;
      
      const params = [];
      const countParams = [];
      let paramCount = 1;
      
      // State admins can only see their own actions
      if (adminType.includes('state')) {
        query += ` AND ata.admin_id = $${paramCount}`;
        countQuery += ` AND ata.admin_id = $${paramCount}`;
        params.push(adminId);
        countParams.push(adminId);
        paramCount++;
      }
      
      if (action_type) {
        query += ` AND ata.action_type = $${paramCount}`;
        countQuery += ` AND ata.action_type = $${paramCount}`;
        params.push(action_type);
        countParams.push(action_type);
        paramCount++;
      }
      
      if (admin_user_id) {
        query += ` AND ata.admin_id = $${paramCount}`;
        countQuery += ` AND ata.admin_id = $${paramCount}`;
        params.push(admin_user_id);
        countParams.push(admin_user_id);
        paramCount++;
      }
      
      if (booking_id) {
        query += ` AND ata.booking_id = $${paramCount}`;
        countQuery += ` AND ata.booking_id = $${paramCount}`;
        params.push(booking_id);
        countParams.push(booking_id);
        paramCount++;
      }
      
      if (service_id) {
        query += ` AND ata.service_id = $${paramCount}`;
        countQuery += ` AND ata.service_id = $${paramCount}`;
        params.push(service_id);
        countParams.push(service_id);
        paramCount++;
      }
      
      if (start_date) {
        query += ` AND ata.created_at >= $${paramCount}`;
        countQuery += ` AND ata.created_at >= $${paramCount}`;
        params.push(start_date);
        countParams.push(start_date);
        paramCount++;
      }
      
      if (end_date) {
        query += ` AND ata.created_at <= $${paramCount}`;
        countQuery += ` AND ata.created_at <= $${paramCount}`;
        params.push(end_date);
        countParams.push(end_date);
        paramCount++;
      }
      
      query += ` ORDER BY ata.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);
      
      const [result, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, countParams)
      ]);
      
      res.json({
        success: true,
        data: {
          action_logs: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].total),
            total_pages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Get action logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch action logs'
      });
    }
  });

  /**
   * Export action logs (super admin only)
   */
  router.get('/action-logs/export', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      // Only super admins can export all action logs
      if (!adminType.includes('super')) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins can export action logs'
        });
      }
      
      const { 
        format = 'csv',
        start_date, 
        end_date,
        action_type
      } = req.query;
      
      let query = `
        SELECT 
          ata.id,
          ata.admin_id,
          u.full_name as admin_name,
          u.email as admin_email,
          ata.action_type,
          ata.action_details,
          ata.booking_id,
          ata.service_id,
          ata.ip_address,
          ata.user_agent,
          ata.created_at
        FROM admin_transportation_actions ata
        JOIN users u ON ata.admin_id = u.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramCount = 1;
      
      if (action_type) {
        query += ` AND ata.action_type = $${paramCount}`;
        params.push(action_type);
        paramCount++;
      }
      
      if (start_date) {
        query += ` AND ata.created_at >= $${paramCount}`;
        params.push(start_date);
        paramCount++;
      }
      
      if (end_date) {
        query += ` AND ata.created_at <= $${paramCount}`;
        params.push(end_date);
        paramCount++;
      }
      
      query += ` ORDER BY ata.created_at DESC`;
      
      const result = await db.query(query, params);
      
      // Log the export action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'export_action_logs', $2, NULL, NULL, $3, $4)
      `, [
        adminId,
        JSON.stringify({
          format,
          record_count: result.rows.length,
          date_range: { start_date, end_date }
        }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      if (format === 'csv') {
        // Convert to CSV
        const headers = [
          'ID', 'Admin ID', 'Admin Name', 'Admin Email', 'Action Type',
          'Action Details', 'Booking ID', 'Service ID', 'IP Address',
          'User Agent', 'Created At'
        ];
        
        const csvRows = result.rows.map(row => [
          row.id,
          row.admin_id,
          `"${row.admin_name || ''}"`,
          `"${row.admin_email || ''}"`,
          `"${row.action_type || ''}"`,
          `"${JSON.stringify(row.action_details || {})}"`,
          row.booking_id,
          row.service_id,
          row.ip_address,
          `"${row.user_agent || ''}"`,
          row.created_at
        ].join(','));
        
        const csvContent = [headers.join(','), ...csvRows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=transportation_action_logs_${Date.now()}.csv`);
        return res.send(csvContent);
      } else {
        // Default to JSON
        res.json({
          success: true,
          data: {
            logs: result.rows,
            metadata: {
              format: 'json',
              record_count: result.rows.length,
              exported_at: new Date().toISOString()
            }
          }
        });
      }
      
    } catch (error) {
      console.error('Export action logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export action logs'
      });
    }
  });

  // ====================== UTILITY ROUTES ======================

  /**
   * Get transportation statistics summary
   */
  router.get('/statistics/summary', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      let stateJoin = '';
      let stateScopeSql = '';
      const params = [];
      
      // State admins get state-specific statistics
      if (adminType.includes('state')) {
        const adminResult = await db.query(`
          SELECT assigned_state FROM users WHERE id = $1
        `, [adminId]);
        
        if (adminResult.rows.length > 0 && adminResult.rows[0].assigned_state) {
          stateJoin = 'JOIN properties p ON tb.property_id = p.id LEFT JOIN states s ON s.id = p.state_id';
          stateScopeSql = 'AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))';
          params.push(adminResult.rows[0].assigned_state);
        }
      }
      
      const [todayStats, weeklyStats, monthlyStats, yearlyStats] = await Promise.all([
        // Today's statistics
        db.query(`
          SELECT 
            COUNT(*) as bookings,
            COALESCE(SUM(total_price), 0) as revenue,
            COUNT(DISTINCT tenant_id) as unique_tenants
          FROM transportation_bookings tb
          ${stateJoin}
          WHERE DATE(tb.created_at) = CURRENT_DATE
          ${stateScopeSql}
        `, params),
        
        // Weekly statistics
        db.query(`
          SELECT 
            COUNT(*) as bookings,
            COALESCE(SUM(total_price), 0) as revenue,
            COUNT(DISTINCT tenant_id) as unique_tenants,
            COUNT(DISTINCT service_id) as services_used
          FROM transportation_bookings tb
          ${stateJoin}
          WHERE tb.created_at >= CURRENT_DATE - INTERVAL '7 days'
          ${stateScopeSql}
        `, params),
        
        // Monthly statistics
        db.query(`
          SELECT 
            COUNT(*) as bookings,
            COALESCE(SUM(total_price), 0) as revenue,
            COUNT(DISTINCT tenant_id) as unique_tenants,
            COUNT(DISTINCT property_id) as properties_used
          FROM transportation_bookings tb
          ${stateJoin}
          WHERE tb.created_at >= CURRENT_DATE - INTERVAL '30 days'
          ${stateScopeSql}
        `, params),
        
        // Yearly statistics
        db.query(`
          SELECT 
            COUNT(*) as bookings,
            COALESCE(SUM(total_price), 0) as revenue,
            COUNT(DISTINCT tenant_id) as unique_tenants,
            COUNT(DISTINCT service_id) as total_services_used
          FROM transportation_bookings tb
          ${stateJoin}
          WHERE tb.created_at >= CURRENT_DATE - INTERVAL '365 days'
          ${stateScopeSql}
        `, params)
      ]);
      
      res.json({
        success: true,
        data: {
          today: todayStats.rows[0],
          weekly: weeklyStats.rows[0],
          monthly: monthlyStats.rows[0],
          yearly: yearlyStats.rows[0],
          period: adminType.includes('state') ? 'state_specific' : 'national'
        }
      });
      
    } catch (error) {
      console.error('Get statistics summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics summary'
      });
    }
  });

  /**
   * Clear old transportation data (super admin only)
   */
  router.post('/data/cleanup', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      // Only super admins can perform data cleanup
      if (!adminType.includes('super')) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins can perform data cleanup'
        });
      }
      
      const { 
        older_than_days: rawDays = 365,
        max_records = 10000,
        dry_run = true 
      } = req.body;
      const older_than_days = rawDays && /^\d+$/.test(String(rawDays)) ? parseInt(String(rawDays), 10) : 365;
      const intervalStr = `${older_than_days} days`;
      
      // Get counts before cleanup
           const [oldBookingsCount, oldAlertsCount, oldActionsCount] = await Promise.all([
        // Count old bookings
        db.query(`
          SELECT COUNT(*) as count 
          FROM transportation_bookings 
          WHERE created_at < CURRENT_DATE - $1::interval
            AND booking_status = 'completed'
            AND payment_status = 'completed'
        `, [intervalStr]),
        
        // Count old alerts
        db.query(`
          SELECT COUNT(*) as count 
          FROM transportation_alerts 
          WHERE created_at < CURRENT_DATE - $1::interval
            AND is_resolved = TRUE
        `, [intervalStr]),
        
        // Count old actions
        db.query(`
          SELECT COUNT(*) as count 
          FROM admin_transportation_actions 
          WHERE created_at < CURRENT_DATE - $1::interval
        `, [intervalStr])
      ]);
      
      const cleanupSummary = {
        dry_run,
        older_than_days,
        max_records,
        records_to_delete: {
          bookings: parseInt(oldBookingsCount.rows[0].count),
          alerts: parseInt(oldAlertsCount.rows[0].count),
          actions: parseInt(oldActionsCount.rows[0].count)
        },
        total_to_delete: parseInt(oldBookingsCount.rows[0].count) + 
                         parseInt(oldAlertsCount.rows[0].count) + 
                         parseInt(oldActionsCount.rows[0].count)
      };
      
      let deletedRecords = {
        bookings: 0,
        alerts: 0,
        actions: 0
      };
      
      if (!dry_run && cleanupSummary.total_to_delete > 0) {
        // Perform actual deletion (with limits)
        const deletionPromises = [];
        
        // Delete old bookings (limit to max_records)
        if (cleanupSummary.records_to_delete.bookings > 0) {
          deletionPromises.push(
            db.query(`
              DELETE FROM transportation_bookings 
              WHERE id IN (
                SELECT id 
                FROM transportation_bookings 
                WHERE created_at < CURRENT_DATE - $2::interval
                  AND booking_status = 'completed'
                  AND payment_status = 'completed'
                ORDER BY created_at ASC
                LIMIT $1
              )
              RETURNING COUNT(*) as deleted_count
            `, [Math.min(max_records, cleanupSummary.records_to_delete.bookings), intervalStr])
            .then(result => {
              deletedRecords.bookings = parseInt(result.rows[0].deleted_count);
            })
          );
        }
        
        // Delete old alerts (limit to max_records)
        if (cleanupSummary.records_to_delete.alerts > 0) {
          deletionPromises.push(
            db.query(`
              DELETE FROM transportation_alerts 
              WHERE id IN (
                SELECT id 
                FROM transportation_alerts 
                WHERE created_at < CURRENT_DATE - $2::interval
                  AND is_resolved = TRUE
                ORDER BY created_at ASC
                LIMIT $1
              )
              RETURNING COUNT(*) as deleted_count
            `, [Math.min(max_records, cleanupSummary.records_to_delete.alerts), intervalStr])
            .then(result => {
              deletedRecords.alerts = parseInt(result.rows[0].deleted_count);
            })
          );
        }
        
        // Delete old actions (limit to max_records)
        if (cleanupSummary.records_to_delete.actions > 0) {
          deletionPromises.push(
            db.query(`
              DELETE FROM admin_transportation_actions 
              WHERE id IN (
                SELECT id 
                FROM admin_transportation_actions 
                WHERE created_at < CURRENT_DATE - $2::interval
                ORDER BY created_at ASC
                LIMIT $1
              )
              RETURNING COUNT(*) as deleted_count
            `, [Math.min(max_records, cleanupSummary.records_to_delete.actions), intervalStr])
            .then(result => {
              deletedRecords.actions = parseInt(result.rows[0].deleted_count);
            })
          );
        }
        
        await Promise.all(deletionPromises);
      }
      
      // Log the cleanup action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'data_cleanup', $2, NULL, NULL, $3, $4)
      `, [
        adminId,
        JSON.stringify({
          dry_run,
          older_than_days,
          cleanup_summary: cleanupSummary,
          deleted_records: dry_run ? null : deletedRecords
        }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      const response = {
        success: true,
        data: {
          cleanup_summary: cleanupSummary,
          operation: dry_run ? 'dry_run' : 'executed',
          timestamp: new Date().toISOString()
        },
        message: dry_run 
          ? `Dry run completed. ${cleanupSummary.total_to_delete} records would be deleted.` 
          : `Cleanup completed. Deleted ${deletedRecords.bookings + deletedRecords.alerts + deletedRecords.actions} records.`
      };
      
      if (!dry_run) {
        response.data.deleted_records = deletedRecords;
      }
      
      res.json(response);
      
    } catch (error) {
      console.error('Data cleanup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform data cleanup'
      });
    }
  });

  /**
   * Backup transportation data (super admin only)
   */
  router.post('/data/backup', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      // Only super admins can perform data backup
      if (!adminType.includes('super')) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins can perform data backup'
        });
      }
      
      const { 
        backup_type = 'full',
        include_tables = ['transportation_bookings', 'transportation_services', 'transportation_alerts'],
        max_age_days = 30
      } = req.body;
      
      // Generate backup filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = `transportation_backup_${timestamp}`;
      
      // Get table data
      const backupData = {
        backup_id: backupId,
        backup_type,
        created_at: new Date().toISOString(),
        created_by: adminId,
        tables: {}
      };
      
      const allowedTables = ['transportation_bookings', 'transportation_services', 'transportation_alerts', 'transportation_fares', 'transportation_routes'];

      for (const tableName of include_tables) {
        try {
          if (!allowedTables.includes(tableName)) {
            return res.status(400).json({ success: false, message: `Invalid table name: ${tableName}` });
          }

          let query = `SELECT * FROM ${tableName}`;
          
          // Apply age filter for certain tables
          if ((tableName === 'transportation_bookings' || tableName === 'transportation_alerts') && max_age_days) {
            query += ` WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day'`;
          }
          
          const params = (tableName === 'transportation_bookings' || tableName === 'transportation_alerts') && max_age_days ? [Number(max_age_days)] : [];
          const result = await db.query(query, params);
          backupData.tables[tableName] = {
            record_count: result.rows.length,
            data: result.rows
          };
        } catch (error) {
          backupData.tables[tableName] = {
            error: error.message,
            record_count: 0,
            data: []
          };
        }
      }
      
      // Calculate backup statistics
      const totalRecords = Object.values(backupData.tables).reduce(
        (sum, table) => sum + (table.record_count || 0), 0
      );
      
      backupData.statistics = {
        total_records: totalRecords,
        tables_backed_up: include_tables.length,
        backup_size_estimate: JSON.stringify(backupData).length
      };
      
      // Log the backup action
      await db.query(`
        SELECT log_transportation_admin_action($1, 'data_backup', $2, NULL, NULL, $3, $4)
      `, [
        adminId,
        JSON.stringify({
          backup_id: backupId,
          backup_type,
          statistics: backupData.statistics
        }),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: backupData,
        message: `Backup completed successfully. ${totalRecords} records backed up.`
      });
      
    } catch (error) {
      console.error('Data backup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform data backup'
      });
    }
  });

  /**
   * Get transportation system configuration
   */
  router.get('/configuration', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      // Get system configuration from various sources
      const [serviceConfig, alertConfig, performanceConfig, adminConfig] = await Promise.all([
        // Service configuration
        db.query(`
          SELECT 
            COUNT(*) as total_services,
            COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_services,
            COUNT(DISTINCT service_type) as service_types,
            MIN(base_price) as min_price,
            MAX(base_price) as max_price,
            AVG(base_price) as avg_price
          FROM transportation_services
        `),
        
        // Alert configuration
        db.query(`
          SELECT 
            COUNT(*) as total_alerts,
            COUNT(CASE WHEN is_resolved = FALSE THEN 1 END) as unresolved_alerts,
            COUNT(DISTINCT alert_type) as alert_types,
            MIN(created_at) as oldest_alert,
            MAX(created_at) as newest_alert
          FROM transportation_alerts
          WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        `),
        
        // Performance configuration
        db.query(`
          SELECT 
            COUNT(*) as total_metrics,
            COUNT(DISTINCT metric_type) as metric_types,
            MIN(metric_date) as oldest_metric,
            MAX(metric_date) as newest_metric,
            AVG(metric_value) as avg_metric_value
          FROM transportation_performance_metrics
          WHERE metric_date >= CURRENT_DATE - INTERVAL '30 days'
        `),
        
        // Admin configuration
        db.query(`
          SELECT 
            COUNT(DISTINCT admin_id) as total_admins,
            COUNT(DISTINCT CASE WHEN user_type LIKE '%state%' THEN admin_id END) as state_admins,
            COUNT(DISTINCT CASE WHEN user_type LIKE '%super%' THEN admin_id END) as super_admins,
            COUNT(*) as total_actions,
            MIN(created_at) as first_action,
            MAX(created_at) as last_action
          FROM admin_transportation_actions ata
          JOIN users u ON ata.admin_id = u.id
          WHERE ata.created_at >= CURRENT_DATE - INTERVAL '30 days'
        `)
      ]);
      
      // Get feature flags and settings
      const systemSettings = {
        alert_system_enabled: true,
        performance_monitoring_enabled: true,
        auto_cleanup_enabled: false,
        backup_schedule: 'weekly',
        max_booking_age_days: 365,
        alert_retention_days: 90,
        performance_metric_retention_days: 180
      };
      
      // Get jurisdiction information for state admins
      let jurisdictionInfo = null;
      if (adminType.includes('state')) {
        const jurisdictionResult = await db.query(`
          SELECT 
            state,
            city,
            can_monitor_bookings,
            can_manage_services,
            can_view_analytics,
            can_override_status
          FROM state_admin_transportation_jurisdiction
          WHERE state_admin_id = $1
        `, [adminId]);
        
        if (jurisdictionResult.rows.length > 0) {
          jurisdictionInfo = jurisdictionResult.rows;
        }
      }
      
      // Get oversight information for super admins
      let oversightInfo = null;
      if (adminType.includes('super')) {
        const oversightResult = await db.query(`
          SELECT 
            oversight_level,
            state,
            can_manage_all_services,
            can_view_all_analytics,
            can_override_any_status,
            can_assign_state_admins
          FROM super_admin_transportation_oversight
          WHERE super_admin_id = $1
        `, [adminId]);
        
        if (oversightResult.rows.length > 0) {
          oversightInfo = oversightResult.rows;
        }
      }
      
      res.json({
        success: true,
        data: {
          system_configuration: {
            services: serviceConfig.rows[0],
            alerts: alertConfig.rows[0],
            performance: performanceConfig.rows[0],
            admin: adminConfig.rows[0]
          },
          system_settings: systemSettings,
          user_permissions: {
            user_type: adminType,
            jurisdiction: jurisdictionInfo,
            oversight: oversightInfo,
            can_monitor: adminType.includes('admin') || adminType.includes('super') || 
                        (jurisdictionInfo && jurisdictionInfo.some(j => j.can_monitor_bookings)),
            can_manage_services: adminType.includes('admin') || adminType.includes('super') || 
                                (jurisdictionInfo && jurisdictionInfo.some(j => j.can_manage_services)),
            can_view_analytics: adminType.includes('admin') || adminType.includes('super') || 
                               (jurisdictionInfo && jurisdictionInfo.some(j => j.can_view_analytics))
          },
          system_status: {
            last_updated: new Date().toISOString(),
            version: '1.0.0'
          }
        }
      });
      
    } catch (error) {
      console.error('Get configuration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system configuration'
      });
    }
  });

  /**
   * Update transportation system configuration (super admin only)
   */
  router.patch('/configuration', async (req, res) => {
    try {
      const adminId = req.user.id;
      const adminType = req.user.user_type;
      
      // Only super admins can update system configuration
      if (!adminType.includes('super')) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins can update system configuration'
        });
      }
      
      const updates = req.body;
      
      // Validate updates
      const validSettings = [
        'alert_system_enabled',
        'performance_monitoring_enabled',
        'auto_cleanup_enabled',
        'backup_schedule',
        'max_booking_age_days',
        'alert_retention_days',
        'performance_metric_retention_days'
      ];
      
      const invalidSettings = Object.keys(updates).filter(
        key => !validSettings.includes(key)
      );
      
      if (invalidSettings.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid settings: ${invalidSettings.join(', ')}`
        });
      }
      
      // In a real system, you would save these to a configuration table
      // For now, we'll just return the updates
      const updatedSettings = updates;
      
      // Log the configuration update
      await db.query(`
        SELECT log_transportation_admin_action($1, 'update_system_configuration', $2, NULL, NULL, $3, $4)
      `, [
        adminId,
        JSON.stringify(updatedSettings),
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.json({
        success: true,
        data: {
          updated_settings: updatedSettings,
          timestamp: new Date().toISOString()
        },
        message: 'System configuration updated successfully'
      });
      
    } catch (error) {
      console.error('Update configuration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update system configuration'
      });
    }
  });

module.exports = router;
