const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../config/middleware/auth');
const { requireLgaAdmin } = require('../config/middleware/requireLgaAdmin');
const { canMonitorLgaAdmins } = require('../config/utils/roleScopes.js work on it');
const db = require('../config/middleware/database');

// ====================== AUTHENTICATION ======================
router.use(authenticate);

// ====================== LGA ADMIN DASHBOARD ======================

/**
 * Get LGA admin dashboard
 */
router.get('/dashboard', requireLgaAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;
    
    // Get admin's assigned LGA and state
    const adminResult = await db.query(
      `SELECT assigned_lga, assigned_state, assigned_city, 
              supervising_state_admin_id, supervising_super_admin_id
       FROM users 
       WHERE id = $1 AND user_type = 'lga_admin'`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'LGA Admin not found'
      });
    }
    
    const admin = adminResult.rows[0];
    
    // Get dashboard statistics
    const [
      userStats,
      propertyStats,
      transactionStats,
      recentActivities,
      performanceMetrics
    ] = await Promise.all([
      // User statistics
      db.query(`
        SELECT 
          COUNT(*) as total_users,
          user_type,
          COUNT(*) as type_count
        FROM users
        WHERE referred_by = $1
          AND deleted_at IS NULL
        GROUP BY user_type
      `, [adminId]),
      
      // Property statistics
      db.query(`
        SELECT 
          COUNT(*) as total_properties,
          SUM(CASE WHEN is_verified = TRUE THEN 1 ELSE 0 END) as approved_properties,
          SUM(CASE WHEN is_verified = FALSE AND is_available = TRUE THEN 1 ELSE 0 END) as pending_properties,
          property_type,
          COUNT(*) as type_count
        FROM properties
        WHERE state = $1 
          AND city = $2
          AND deleted_at IS NULL
        GROUP BY property_type
      `, [admin.assigned_state, admin.assigned_city]),
      
      // Transaction statistics
      db.query(`
        SELECT 
          COUNT(*) as total_transactions,
          SUM(amount) as total_revenue,
          payment_type,
          COUNT(*) as type_count,
          SUM(amount) as type_amount
        FROM payments p
        LEFT JOIN properties prop ON p.property_id = prop.id
        WHERE prop.state = $1 
          AND prop.city = $2
          AND p.payment_status = 'completed'
        GROUP BY payment_type
      `, [admin.assigned_state, admin.assigned_city]),
      
      // Recent activities
      db.query(`
        SELECT 
          activity_type,
          activity_details,
          created_at
        FROM lga_admin_activities
        WHERE lga_admin_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [adminId]),
      
      // Performance metrics
      db.query(`
        SELECT 
          performance_rating,
          approval_rate,
          total_users_managed,
          total_properties_approved,
          total_transactions_processed,
          total_revenue_generated,
          last_monitored_at
        FROM lga_admin_performance
        WHERE lga_admin_id = $1
        ORDER BY last_monitored_at DESC
        LIMIT 1
      `, [adminId])
    ]);
    
    // Get supervising admins info
    let supervisingStateAdmin = null;
    let supervisingSuperAdmin = null;
    
    if (admin.supervising_state_admin_id) {
      const stateAdminResult = await db.query(
        `SELECT id, full_name, email, phone FROM users WHERE id = $1`,
        [admin.supervising_state_admin_id]
      );
      supervisingStateAdmin = stateAdminResult.rows[0] || null;
    }
    
    if (admin.supervising_super_admin_id) {
      const superAdminResult = await db.query(
        `SELECT id, full_name, email, phone FROM users WHERE id = $1`,
        [admin.supervising_super_admin_id]
      );
      supervisingSuperAdmin = superAdminResult.rows[0] || null;
    }
    
    res.json({
      success: true,
      data: {
        admin_info: {
          assigned_lga: admin.assigned_lga,
          assigned_state: admin.assigned_state,
          assigned_city: admin.assigned_city,
          supervising_state_admin: supervisingStateAdmin,
          supervising_super_admin: supervisingSuperAdmin
        },
        statistics: {
          users: userStats.rows,
          properties: propertyStats.rows,
          transactions: transactionStats.rows
        },
        performance: performanceMetrics.rows[0] || null,
        recent_activities: recentActivities.rows
      }
    });
    
  } catch (error) {
    console.error('Get LGA admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
});

/**
 * Get managed users in LGA
 */
router.get('/managed-users', requireLgaAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;
    const { limit = 10, page = 1, user_type, search } = req.query;
    const offset = (page - 1) * limit;
    
    // Get admin's assigned LGA and state
    const adminResult = await db.query(
      `SELECT assigned_lga, assigned_state, assigned_city FROM users WHERE id = $1`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    
    const admin = adminResult.rows[0];
    
    let query = `
      SELECT 
        u.*,
        (SELECT COUNT(*) FROM payments WHERE user_id = u.id AND payment_status = 'completed') as total_transactions,
        (SELECT SUM(amount) FROM payments WHERE user_id = u.id AND payment_status = 'completed') as total_spent,
        (SELECT COUNT(*) FROM properties WHERE landlord_id = u.id) as properties_listed,
        (SELECT COUNT(*) FROM applications WHERE tenant_id = u.id) as applications_made
      FROM users u
      WHERE u.referred_by = $1
        AND u.deleted_at IS NULL
    `;
    
    let countQuery = `
      SELECT COUNT(*)
      FROM users u
      WHERE u.referred_by = $1
        AND u.deleted_at IS NULL
    `;
    
    const params = [adminId];
    const countParams = [adminId];
    let paramCount = 2;
    
    if (user_type) {
      query += ` AND u.user_type = $${paramCount}`;
      countQuery += ` AND u.user_type = $${paramCount}`;
      params.push(user_type);
      countParams.push(user_type);
      paramCount++;
    }
    
    if (search) {
      query += ` AND (u.full_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount} OR u.phone ILIKE $${paramCount})`;
      countQuery += ` AND (u.full_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount} OR u.phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
      paramCount++;
    }
    
    query += ` ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams.slice(0, -2))
    ]);
    
    res.json({
      success: true,
      data: {
        users: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          total_pages: Math.ceil(countResult.rows[0].count / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get managed users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch managed users'
    });
  }
});

/**
 * Get properties in LGA
 */
router.get('/properties', requireLgaAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;
    const { limit = 10, page = 1, status, property_type, search } = req.query;
    const offset = (page - 1) * limit;
    
    // Get admin's assigned LGA and state
    const adminResult = await db.query(
      `SELECT assigned_lga, assigned_state, assigned_city FROM users WHERE id = $1`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    
    const admin = adminResult.rows[0];
    
    let query = `
      SELECT 
        p.*,
        u.full_name as landlord_name,
        u.email as landlord_email,
        u.phone as landlord_phone,
        (SELECT COUNT(*) FROM applications WHERE property_id = p.id) as application_count,
        (SELECT COUNT(*) FROM property_views WHERE property_id = p.id) as view_count
      FROM properties p
      JOIN users u ON p.landlord_id = u.id
      WHERE p.state = $1 
        AND p.city = $2
        AND p.deleted_at IS NULL
    `;
    
    let countQuery = `
      SELECT COUNT(*)
      FROM properties p
      WHERE p.state = $1 
        AND p.city = $2
        AND p.deleted_at IS NULL
    `;
    
    const params = [admin.assigned_state, admin.assigned_city];
    const countParams = [admin.assigned_state, admin.assigned_city];
    let paramCount = 3;
    
    if (status === 'pending') {
      query += ` AND p.is_verified = FALSE AND p.is_available = TRUE`;
      countQuery += ` AND p.is_verified = FALSE AND p.is_available = TRUE`;
    } else if (status === 'approved') {
      query += ` AND p.is_verified = TRUE`;
      countQuery += ` AND p.is_verified = TRUE`;
    } else if (status === 'unavailable') {
      query += ` AND p.is_available = FALSE`;
      countQuery += ` AND p.is_available = FALSE`;
    }
    
    if (property_type) {
      query += ` AND p.property_type = $${paramCount}`;
      countQuery += ` AND p.property_type = $${paramCount}`;
      params.push(property_type);
      countParams.push(property_type);
      paramCount++;
    }
    
    if (search) {
      query += ` AND (p.title ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.full_address ILIKE $${paramCount})`;
      countQuery += ` AND (p.title ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.full_address ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
      paramCount++;
    }
    
    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        properties: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          total_pages: Math.ceil(countResult.rows[0].count / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get LGA properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
});

/**
 * Approve property in LGA
 */
router.patch('/properties/:id/approve', requireLgaAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;
    const propertyId = req.params.id;
    
    // Get admin's assigned LGA and state
    const adminResult = await db.query(
      `SELECT assigned_lga, assigned_state, assigned_city FROM users WHERE id = $1`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    
    const admin = adminResult.rows[0];
    
    // Check if property exists and is in admin's jurisdiction
    const propertyResult = await db.query(
      `SELECT id, state, city, is_verified 
       FROM properties 
       WHERE id = $1 
         AND state = $2 
         AND city = $3
         AND deleted_at IS NULL`,
      [propertyId, admin.assigned_state, admin.assigned_city]
    );
    
    if (propertyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found in your jurisdiction'
      });
    }
    
    const property = propertyResult.rows[0];
    
    if (property.is_verified) {
      return res.status(400).json({
        success: false,
        message: 'Property is already approved'
      });
    }
    
    // Approve property
    await db.query(
      `UPDATE properties 
       SET is_verified = TRUE, 
           approved_by_admin_id = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [adminId, propertyId]
    );
    
    // Log activity
    await db.query(
      `INSERT INTO lga_admin_activities 
       (lga_admin_id, activity_type, activity_details)
       VALUES ($1, 'property_approved', $2)`,
      [adminId, JSON.stringify({ property_id: propertyId, admin_id: adminId })]
    );
    
    res.json({
      success: true,
      message: 'Property approved successfully'
    });
    
  } catch (error) {
    console.error('Approve property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve property'
    });
  }
});

/**
 * Reject property in LGA
 */
router.patch('/properties/:id/reject', requireLgaAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;
    const propertyId = req.params.id;
    const { reason } = req.body;
    
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required (minimum 10 characters)'
      });
    }
    
    // Get admin's assigned LGA and state
    const adminResult = await db.query(
      `SELECT assigned_lga, assigned_state, assigned_city FROM users WHERE id = $1`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    
    const admin = adminResult.rows[0];
    
    // Check if property exists and is in admin's jurisdiction
    const propertyResult = await db.query(
      `SELECT id, state, city, is_verified 
       FROM properties 
       WHERE id = $1 
         AND state = $2 
         AND city = $3
         AND deleted_at IS NULL`,
      [propertyId, admin.assigned_state, admin.assigned_city]
    );
    
    if (propertyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found in your jurisdiction'
      });
    }
    
    const property = propertyResult.rows[0];
    
    if (!property.is_verified) {
      // Reject property (mark as unavailable)
      await db.query(
        `UPDATE properties 
         SET is_available = FALSE, 
             rejection_reason = $1,
             rejected_by_admin_id = $2,
             rejected_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        [reason.trim(), adminId, propertyId]
      );
      
      // Log activity
      await db.query(
        `INSERT INTO lga_admin_activities 
         (lga_admin_id, activity_type, activity_details)
         VALUES ($1, 'property_rejected', $2)`,
        [adminId, JSON.stringify({ property_id: propertyId, admin_id: adminId, reason: reason.trim() })]
      );
      
      res.json({
        success: true,
        message: 'Property rejected successfully'
      });
    } else {
      // Unlist already approved property
      await db.query(
        `UPDATE properties 
         SET is_available = FALSE, 
             unlist_reason = $1,
             unlisted_by_admin_id = $2,
             unlisted_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        [reason.trim(), adminId, propertyId]
      );
      
      // Log activity
      await db.query(
        `INSERT INTO lga_admin_activities 
         (lga_admin_id, activity_type, activity_details)
         VALUES ($1, 'property_unlisted', $2)`,
        [adminId, JSON.stringify({ property_id: propertyId, admin_id: adminId, reason: reason.trim() })]
      );
      
            res.json({
        success: true,
        message: 'Property unlisted successfully'
      });
    }
    
  } catch (error) {
    console.error('Reject/unlist property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process property'
    });
  }
});

/**
 * Get transactions in LGA
 */
router.get('/transactions', requireLgaAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;
    const { limit = 10, page = 1, payment_type, start_date, end_date } = req.query;
    const offset = (page - 1) * limit;
    
    // Get admin's assigned LGA and state
    const adminResult = await db.query(
      `SELECT assigned_lga, assigned_state, assigned_city FROM users WHERE id = $1`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    
    const admin = adminResult.rows[0];
    
    let query = `
      SELECT 
        p.*,
        u.full_name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        prop.title as property_title,
        prop.state as property_state,
        prop.city as property_city,
        prop.area as property_area
      FROM payments p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE prop.state = $1 
        AND prop.city = $2
        AND p.payment_status = 'completed'
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE prop.state = $1 
        AND prop.city = $2
        AND p.payment_status = 'completed'
    `;
    
    const params = [admin.assigned_state, admin.assigned_city];
    const countParams = [admin.assigned_state, admin.assigned_city];
    let paramCount = 3;
    
    // Apply filters
    if (payment_type) {
      query += ` AND p.payment_type = $${paramCount}`;
      countQuery += ` AND p.payment_type = $${paramCount}`;
      params.push(payment_type);
      countParams.push(payment_type);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND p.created_at >= $${paramCount}`;
      countQuery += ` AND p.created_at >= $${paramCount}`;
      params.push(start_date);
      countParams.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND p.created_at <= $${paramCount}`;
      countQuery += ` AND p.created_at <= $${paramCount}`;
      params.push(end_date);
      countParams.push(end_date);
      paramCount++;
    }
    
    // Order and paginate
    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        transactions: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          total_pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get LGA transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
});

/**
 * Get LGA admin activities
 */
router.get('/activities', requireLgaAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;
    const { limit = 20, page = 1, activity_type, start_date, end_date } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        activity_type,
        activity_details,
        ip_address,
        user_agent,
        created_at
      FROM lga_admin_activities
      WHERE lga_admin_id = $1
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM lga_admin_activities
      WHERE lga_admin_id = $1
    `;
    
    const params = [adminId];
    const countParams = [adminId];
    let paramCount = 2;
    
    if (activity_type) {
      query += ` AND activity_type = $${paramCount}`;
      countQuery += ` AND activity_type = $${paramCount}`;
      params.push(activity_type);
      countParams.push(activity_type);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND created_at >= $${paramCount}`;
      countQuery += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
      countParams.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND created_at <= $${paramCount}`;
      countQuery += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
      countParams.push(end_date);
      paramCount++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        activities: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          total_pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get LGA admin activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activities'
    });
  }
});

/**
 * Get LGA admin performance metrics
 */
router.get('/performance', requireLgaAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        monitoring_level,
        performance_rating,
        approval_rate,
        total_users_managed,
        total_properties_approved,
        total_transactions_processed,
        total_revenue_generated,
        response_time_avg_seconds,
        notes,
        last_monitored_at,
        monitoring_admin_id,
        (SELECT full_name FROM users WHERE id = monitoring_admin_id) as monitoring_admin_name
      FROM lga_admin_performance
      WHERE lga_admin_id = $1
      ORDER BY last_monitored_at DESC
    `, [adminId]);
    
    res.json({
      success: true,
      data: {
        performance_metrics: result.rows
      }
    });
    
  } catch (error) {
    console.error('Get LGA admin performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance metrics'
    });
  }
});

// ====================== STATE ADMIN MONITORING ROUTES ======================

/**
 * Get all LGA admins under state admin supervision
 * Accessible by state admins and super admins
 */
router.get('/state-admin/lga-admins', authenticate, async (req, res) => {
  try {
    if (!canMonitorLgaAdmins(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State admin or super admin required.'
      });
    }
    
    const adminId = req.user.id;
    const { limit = 10, page = 1, search, performance_rating } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        lga.id,
        lga.full_name,
        lga.email,
        lga.phone,
        lga.assigned_lga,
        lga.assigned_state,
        lga.assigned_city,
        lga.created_at,
        perf.performance_rating,
        perf.approval_rate,
        perf.total_users_managed,
        perf.total_properties_approved,
        perf.total_transactions_processed,
        perf.total_revenue_generated,
        perf.last_monitored_at
      FROM users lga
      LEFT JOIN lga_admin_performance perf ON lga.id = perf.lga_admin_id 
        AND perf.monitoring_admin_id = $1
      WHERE lga.user_type = 'lga_admin'
        AND lga.deleted_at IS NULL
        AND lga.approval_status = 'approved'
        AND (
          lga.supervising_state_admin_id = $1 
          OR lga.supervising_super_admin_id = $1
          OR $2 = 'super_admin'
        )
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM users lga
      WHERE lga.user_type = 'lga_admin'
        AND lga.deleted_at IS NULL
        AND lga.approval_status = 'approved'
        AND (
          lga.supervising_state_admin_id = $1 
          OR lga.supervising_super_admin_id = $1
          OR $2 = 'super_admin'
        )
    `;
    
    const params = [adminId, req.user.user_type];
    const countParams = [adminId, req.user.user_type];
    let paramCount = 3;
    
    if (search) {
      query += ` AND (lga.full_name ILIKE $${paramCount} OR lga.email ILIKE $${paramCount} OR lga.assigned_lga ILIKE $${paramCount})`;
      countQuery += ` AND (lga.full_name ILIKE $${paramCount} OR lga.email ILIKE $${paramCount} OR lga.assigned_lga ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
      paramCount++;
    }
    
    if (performance_rating) {
      query += ` AND perf.performance_rating = $${paramCount}`;
      countQuery += ` AND perf.performance_rating = $${paramCount}`;
      params.push(performance_rating);
      countParams.push(performance_rating);
      paramCount++;
    }
    
    query += ` ORDER BY lga.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        lga_admins: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          total_pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get supervised LGA admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch LGA admins'
    });
  }
});

/**
 * Monitor specific LGA admin performance
 * Accessible by state admins and super admins
 */
router.get('/state-admin/lga-admins/:lgaAdminId/monitor', authenticate, async (req, res) => {
  try {
    if (!canMonitorLgaAdmins(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State admin or super admin required.'
      });
    }
    
    const monitoringAdminId = req.user.id;
    const lgaAdminId = req.params.lgaAdminId;
    
    // Verify LGA admin exists and is under supervision
    const lgaAdminResult = await db.query(`
      SELECT id, full_name, email, assigned_lga, assigned_state, assigned_city,
             supervising_state_admin_id, supervising_super_admin_id
      FROM users 
      WHERE id = $1 
        AND user_type = 'lga_admin'
        AND deleted_at IS NULL
        AND approval_status = 'approved'
    `, [lgaAdminId]);
    
    if (lgaAdminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'LGA admin not found'
      });
    }
    
    const lgaAdmin = lgaAdminResult.rows[0];
    
    // Check if monitoring admin has permission to monitor this LGA admin
    const canMonitor = 
      lgaAdmin.supervising_state_admin_id === monitoringAdminId ||
      lgaAdmin.supervising_super_admin_id === monitoringAdminId ||
      req.user.user_type === 'super_admin' ||
      req.user.user_type === 'super_financial_admin' ||
      req.user.user_type === 'super_support_admin';
    
    if (!canMonitor) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to monitor this LGA admin'
      });
    }
    
    // Update performance metrics
    await db.query(
      `SELECT update_lga_admin_performance($1, $2, $3)`,
      [lgaAdminId, monitoringAdminId, 
       req.user.user_type.includes('state') ? 'state_admin' : 'super_admin']
    );
    
    // Get updated performance data
    const performanceResult = await db.query(`
      SELECT *
      FROM lga_admin_performance
      WHERE lga_admin_id = $1 
        AND monitoring_admin_id = $2
      ORDER BY last_monitored_at DESC
      LIMIT 1
    `, [lgaAdminId, monitoringAdminId]);
    
    // Get recent activities
    const activitiesResult = await db.query(`
      SELECT activity_type, activity_details, created_at
      FROM lga_admin_activities
      WHERE lga_admin_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [lgaAdminId]);
    
    // Get LGA statistics
    const [userStats, propertyStats, transactionStats] = await Promise.all([
      db.query(`
        SELECT 
          COUNT(*) as total_users,
          user_type,
          COUNT(*) as type_count
        FROM users
        WHERE referred_by = $1
          AND deleted_at IS NULL
        GROUP BY user_type
      `, [lgaAdminId]),
      
      db.query(`
        SELECT 
          COUNT(*) as total_properties,
          SUM(CASE WHEN is_verified = TRUE THEN 1 ELSE 0 END) as approved_properties,
          SUM(CASE WHEN is_verified = FALSE AND is_available = TRUE THEN 1 ELSE 0 END) as pending_properties,
          property_type,
          COUNT(*) as type_count
        FROM properties
        WHERE state = $1 
          AND city = $2
          AND deleted_at IS NULL
        GROUP BY property_type
      `, [lgaAdmin.assigned_state, lgaAdmin.assigned_city]),
      
      db.query(`
        SELECT 
          COUNT(*) as total_transactions,
          SUM(amount) as total_revenue,
          payment_type,
          COUNT(*) as type_count,
          SUM(amount) as type_amount
        FROM payments p
        LEFT JOIN properties prop ON p.property_id = prop.id
        WHERE prop.state = $1 
          AND prop.city = $2
          AND p.payment_status = 'completed'
        GROUP BY payment_type
      `, [lgaAdmin.assigned_state, lgaAdmin.assigned_city])
    ]);
    
    res.json({
      success: true,
      data: {
        lga_admin_info: lgaAdmin,
        performance: performanceResult.rows[0] || null,
        recent_activities: activitiesResult.rows,
        statistics: {
          users: userStats.rows,
          properties: propertyStats.rows,
          transactions: transactionStats.rows
        }
      }
    });
    
  } catch (error) {
    console.error('Monitor LGA admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to monitor LGA admin'
    });
  }
});

/**
 * Update LGA admin performance rating and notes
 * Accessible by state admins and super admins
 */
router.patch('/state-admin/lga-admins/:lgaAdminId/performance', 
  authenticate,
  [
    body('performance_rating').optional().isIn(['excellent', 'good', 'average', 'poor', 'critical']),
    body('notes').optional().isLength({ min: 10, max: 1000 })
  ],
  async (req, res) => {
    try {
      if (!canMonitorLgaAdmins(req.user.user_type)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. State admin or super admin required.'
        });
      }
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }
      
      const monitoringAdminId = req.user.id;
      const lgaAdminId = req.params.lgaAdminId;
      const { performance_rating, notes } = req.body;
      
      // Verify LGA admin exists and is under supervision
      const lgaAdminResult = await db.query(`
        SELECT id, supervising_state_admin_id, supervising_super_admin_id
        FROM users 
        WHERE id = $1 
          AND user_type = 'lga_admin'
          AND deleted_at IS NULL
      `, [lgaAdminId]);
      
      if (lgaAdminResult.rows.length === 0) {
        return res.status(404).json