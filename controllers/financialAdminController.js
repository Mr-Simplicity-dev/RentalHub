// ====================== IMPORTS ======================
const db = require('../config/middleware/database');
const { validationResult } = require('express-validator');

// ====================== SUPER FINANCIAL ADMIN DASHBOARD ======================

/**
 * Get all transactions for super financial admin dashboard
 * Can see every transaction happening in the project
 */
exports.getAllTransactions = async (req, res) => {
  try {
    const {
      state,
      city,
      payment_type,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        p.*,
        u.full_name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        u.user_type,
        prop.title as property_title,
        prop.state as property_state,
        prop.city as property_city,
        prop.area as property_area,
        admin.full_name as admin_name,
        admin.email as admin_email,
        ac.amount as commission_amount,
        ac.source as commission_source,
        ac.status as commission_status,
        ff.amount as frozen_amount,
        ff.status as funds_status,
        ff.reason as freeze_reason
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN properties prop ON p.property_id = prop.id
      LEFT JOIN admin_commissions ac ON p.id = ac.payment_id
      LEFT JOIN users admin ON ac.admin_id = admin.id
      LEFT JOIN frozen_funds ff ON p.user_id = ff.user_id AND ff.status = 'frozen'
      WHERE 1=1
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE 1=1
    `;
    
    const params = [];
    const countParams = [];
    let paramCount = 1;
    
    // Apply filters
    if (state) {
      query += ` AND prop.state = $${paramCount}`;
      countQuery += ` AND prop.state = $${paramCount}`;
      params.push(state);
      countParams.push(state);
      paramCount++;
    }
    
    if (city) {
      query += ` AND prop.city = $${paramCount}`;
      countQuery += ` AND prop.city = $${paramCount}`;
      params.push(city);
      countParams.push(city);
      paramCount++;
    }
    
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
    
    // Execute queries
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        payment_type,
        payment_status,
        COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN payment_status = 'failed' THEN 1 END) as failed_count
      FROM payments
      GROUP BY payment_type, payment_status
      ORDER BY payment_type, payment_status
    `;
    
    const summaryResult = await db.query(summaryQuery);
    
    res.json({
      success: true,
      data: result.rows,
      summary: summaryResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        total_pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get all transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
};

/**
 * Freeze user funds (only super financial admin can do this)
 * Super admin can unfreeze later
 */
exports.freezeUserFunds = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }
    
    const { user_id, amount, reason } = req.body;
    const financialAdminId = req.user.id;
    
    // Check if user is financial admin
    const adminCheck = await db.query(
      'SELECT user_type FROM users WHERE id = $1',
      [financialAdminId]
    );
    
    if (adminCheck.rows[0].user_type !== 'financial_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only financial admins can freeze funds'
      });
    }
    
    // Check user exists
    const userCheck = await db.query(
      'SELECT id, full_name, email FROM users WHERE id = $1',
      [user_id]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Freeze funds
    const freezeResult = await db.query(
      `INSERT INTO frozen_funds 
       (user_id, amount, reason, frozen_by, status)
       VALUES ($1, $2, $3, $4, 'frozen')
       RETURNING id, frozen_at`,
      [user_id, amount, reason, financialAdminId]
    );
    
    // Log audit trail
    await db.query(
      `INSERT INTO transaction_audits 
       (user_id, admin_id, action_type, amount, description, performed_by)
       VALUES ($1, $2, 'funds_frozen', $3, $4, $5)`,
      [user_id, financialAdminId, amount, reason, financialAdminId]
    );
    
    res.json({
      success: true,
      message: `₦${amount.toLocaleString()} frozen for user ${userCheck.rows[0].full_name}`,
      data: {
        freeze_id: freezeResult.rows[0].id,
        frozen_at: freezeResult.rows[0].frozen_at,
        user: userCheck.rows[0]
      }
    });
    
  } catch (error) {
    console.error('Freeze funds error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to freeze funds'
    });
  }
};

/**
 * Get frozen funds (super financial admin can view, super admin can unfreeze)
 */
exports.getFrozenFunds = async (req, res) => {
  try {
    const { status = 'frozen', user_id } = req.query;
    
    let query = `
      SELECT 
        ff.*,
        u.full_name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        frozen_by_user.full_name as frozen_by_name,
        unfrozen_by_user.full_name as unfrozen_by_name
      FROM frozen_funds ff
      JOIN users u ON ff.user_id = u.id
      LEFT JOIN users frozen_by_user ON ff.frozen_by = frozen_by_user.id
      LEFT JOIN users unfrozen_by_user ON ff.unfrozen_by = unfrozen_by_user.id
      WHERE ff.status = $1
    `;
    
    const params = [status];
    
    if (user_id) {
      query += ` AND ff.user_id = $2`;
      params.push(user_id);
    }
    
    query += ` ORDER BY ff.frozen_at DESC`;
    
    const result = await db.query(query, params);
    
    // Get summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_frozen,
        SUM(amount) as total_amount,
        status
      FROM frozen_funds
      GROUP BY status
    `;
    
    const summaryResult = await db.query(summaryQuery);
    
    res.json({
      success: true,
      data: result.rows,
      summary: summaryResult.rows
    });
    
  } catch (error) {
    console.error('Get frozen funds error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch frozen funds'
    });
  }
};

/**
 * Get state admin performance dashboard
 */
exports.getStateAdminPerformance = async (req, res) => {
  try {
    const { state, city, start_date, end_date } = req.query;
    
    let query = `
      SELECT * FROM state_admin_earnings
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (state) {
      query += ` AND assigned_state = $${paramCount}`;
      params.push(state);
      paramCount++;
    }
    
    if (city) {
      query += ` AND assigned_city = $${paramCount}`;
      params.push(city);
      paramCount++;
    }
    
    query += ` ORDER BY total_pending DESC`;
    
    const result = await db.query(query, params);
    
    // Get overall statistics
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT admin_id) as total_admins,
        SUM(total_pending) as total_pending_commissions,
        SUM(total_paid) as total_paid_commissions,
        SUM(total_withdrawn) as total_withdrawn_amount,
        COUNT(DISTINCT total_users_managed) as total_managed_users
      FROM state_admin_earnings
    `;
    
    const statsResult = await db.query(statsQuery);
    
    // Get commission breakdown by source
    const sourceQuery = `
      SELECT 
        source,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        AVG(commission_rate) as avg_rate
      FROM admin_commissions
      WHERE status = 'pending'
      GROUP BY source
      ORDER BY total_amount DESC
    `;
    
    const sourceResult = await db.query(sourceQuery);
    
    res.json({
      success: true,
      data: result.rows,
      statistics: statsResult.rows[0],
      commission_breakdown: sourceResult.rows
    });
    
  } catch (error) {
    console.error('Get state admin performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch state admin performance'
    });
  }
};

/**
 * Get transaction audit trail
 */
exports.getTransactionAuditTrail = async (req, res) => {
  try {
    const {
      action_type,
      user_id,
      start_date,
      end_date,
      page = 1,
      limit = 100
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        ta.*,
        u.full_name as user_name,
        u.email as user_email,
        admin.full_name as admin_name,
        admin.email as admin_email,
        performer.full_name as performed_by_name
      FROM transaction_audits ta
      LEFT JOIN users u ON ta.user_id = u.id
      LEFT JOIN users admin ON ta.admin_id = admin.id
      LEFT JOIN users performer ON ta.performed_by = performer.id
      WHERE 1=1
    `;
    
    let countQuery = `SELECT COUNT(*) as total FROM transaction_audits WHERE 1=1`;
    
    const params = [];
    const countParams = [];
    let paramCount = 1;
    
    if (action_type) {
      query += ` AND ta.action_type = $${paramCount}`;
      countQuery += ` AND action_type = $${paramCount}`;
      params.push(action_type);
      countParams.push(action_type);
      paramCount++;
    }
    
    if (user_id) {
      query += ` AND ta.user_id = $${paramCount}`;
      countQuery += ` AND user_id = $${paramCount}`;
      params.push(user_id);
      countParams.push(user_id);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND ta.performed_at >= $${paramCount}`;
      countQuery += ` AND performed_at >= $${paramCount}`;
      params.push(start_date);
      countParams.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND ta.performed_at <= $${paramCount}`;
      countQuery += ` AND performed_at <= $${paramCount}`;
      params.push(end_date);
      countParams.push(end_date);
      paramCount++;
    }
    
    query += ` ORDER BY ta.performed_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);
    
    // Get action type breakdown
    const breakdownQuery = `
      SELECT 
        action_type,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM transaction_audits
      GROUP BY action_type
      ORDER BY count DESC
    `;
    
    const breakdownResult = await db.query(breakdownQuery);
    
    res.json({
      success: true,
      data: result.rows,
      breakdown: breakdownResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        total_pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get transaction audit trail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit trail'
    });
  }
};

/**
 * Get real-time transaction statistics
 */
exports.getRealTimeStats = async (req, res) => {
  try {
    // Today's transactions
    const todayQuery = `
      SELECT 
        COUNT(*) as today_count,
        SUM(amount) as today_amount,
        payment_type,
        payment_status
      FROM payments
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY payment_type, payment_status
    `;
    
    // This week's transactions
    const weekQuery = `
      SELECT 
        COUNT(*) as week_count,
        SUM(amount) as week_amount
      FROM payments
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      AND payment_status = 'completed'
    `;
    
    // This month's transactions
    const monthQuery = `
      SELECT 
        COUNT(*) as month_count,
        SUM(amount) as month_amount,
        EXTRACT(DOW FROM created_at) as day_of_week,
        DATE(created_at) as date
      FROM payments
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      AND payment_status = 'completed'
      GROUP BY DATE(created_at), EXTRACT(DOW FROM created_at)
      ORDER BY date
    `;
    
    // Top performing states
    const topStatesQuery = `
      SELECT 
        prop.state,
        COUNT(p.id) as transaction_count,
        SUM(p.amount) as total_amount,
        COUNT(DISTINCT p.user_id) as unique_users
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE p.payment_status = 'completed'
        AND p.created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND prop.state IS NOT NULL
      GROUP BY prop.state
      ORDER BY total_amount DESC
      LIMIT 10
    `;
    
    // Top admins by commission
    const topAdminsQuery = `
      SELECT 
        admin.full_name as admin_name,
        admin.assigned_state,
        admin.assigned_city,
        COUNT(ac.id) as commission_count,
        SUM(ac.amount) as total_commission,
        AVG(ac.commission_rate) as avg_rate
      FROM admin_commissions ac
      JOIN users admin ON ac.admin_id = admin.id
      WHERE ac.status = 'pending'
        AND ac.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY admin.id, admin.full_name, admin.assigned_state, admin.assigned_city
      ORDER BY total_commission DESC
      LIMIT 10
    `;
    
    const [
      todayResult,
      weekResult,
      monthResult,
      topStatesResult,
      topAdminsResult
    ] = await Promise.all([
      db.query(todayQuery),
      db.query(weekQuery),
      db.query(monthQuery),
      db.query(topStatesQuery),
      db.query(topAdminsQuery)
    ]);
    
    res.json({
      success: true,
      data: {
        today: todayResult.rows,
        week: weekResult.rows[0],
        month: monthResult.rows,
        top_states: topStatesResult.rows,
        top_admins: topAdminsResult.rows
      }
    });
    
  } catch (error) {
    console.error('Get real-time stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch real-time statistics'
    });
  }
};