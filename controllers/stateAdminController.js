// ====================== IMPORTS ======================
const db = require('../config/middleware/database');
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const {
  isStateFinancialAdmin,
  isSuperAdminOrSuperFinancialAdmin,
} = require('../config/utils/roleScopes');

// ====================== STATE ADMIN MANAGEMENT ======================

/**
 * Create state admin (super admin only)
 */
exports.createStateAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }
    
    const {
      full_name,
      email,
      phone,
      password,
      assigned_state,
      assigned_city,
      commission_rate = 0.05
    } = req.body;
    
    const superAdminId = req.user.id;
    
    // Check if user is super admin
    const adminCheck = await db.query(
      'SELECT user_type FROM users WHERE id = $1',
      [superAdminId]
    );
    
    if (!isSuperAdminOrSuperFinancialAdmin(adminCheck.rows[0].user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Only super admin or super financial admin can create state financial admins'
      });
    }
    
    // Check if email already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Create state admin
    const result = await db.query(
      `INSERT INTO users (
        full_name,
        email,
        phone,
        password_hash,
        user_type,
        assigned_state,
        assigned_city,
        admin_commission_rate,
        referred_by,
        is_active
      ) VALUES ($1, $2, $3, $4, 'state_financial_admin', $5, $6, $7, $8, true)
      RETURNING id, full_name, email, phone, assigned_state, assigned_city, admin_commission_rate`,
      [
        full_name,
        email,
        phone,
        passwordHash,
        assigned_state,
        assigned_city,
        commission_rate,
        superAdminId
      ]
    );
    
    // Log audit trail
    await db.query(
      `INSERT INTO transaction_audits 
       (admin_id, action_type, description, performed_by)
       VALUES ($1, 'payment_created', $2, $3)`,
      [
        result.rows[0].id,
        `State admin created for ${assigned_state}${assigned_city ? `, ${assigned_city}` : ''}`,
        superAdminId
      ]
    );
    
    res.status(201).json({
      success: true,
      message: `State admin created successfully for ${assigned_state}`,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Create state admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create state admin'
    });
  }
};

/**
 * Get all state admins
 */
exports.getAllStateAdmins = async (req, res) => {
  try {
    const { state, city, status = 'active' } = req.query;
    
    let query = `
      SELECT 
        u.*,
        COUNT(DISTINCT ac.id) as total_commissions,
        SUM(CASE WHEN ac.status = 'pending' THEN ac.amount ELSE 0 END) as pending_commission,
        SUM(CASE WHEN ac.status = 'paid' THEN ac.amount ELSE 0 END) as paid_commission,
        COUNT(DISTINCT u2.id) as managed_users,
        COUNT(DISTINCT aw.id) as withdrawal_requests
      FROM users u
      LEFT JOIN admin_commissions ac ON u.id = ac.admin_id
      LEFT JOIN users u2 ON u2.referred_by = u.id
      LEFT JOIN admin_withdrawals aw ON u.id = aw.admin_id
      WHERE u.user_type IN ('state_admin', 'state_financial_admin')
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (state) {
      query += ` AND u.assigned_state = $${paramCount}`;
      params.push(state);
      paramCount++;
    }
    
    if (city) {
      query += ` AND u.assigned_city = $${paramCount}`;
      params.push(city);
      paramCount++;
    }
    
    if (status === 'active') {
      query += ` AND u.is_active = true`;
    } else if (status === 'inactive') {
      query += ` AND u.is_active = false`;
    }
    
    query += ` GROUP BY u.id ORDER BY u.assigned_state, u.assigned_city`;
    
    const result = await db.query(query, params);
    
    // Get state statistics
    const stateStatsQuery = `
      SELECT 
        assigned_state,
        COUNT(*) as admin_count,
        SUM(admin_wallet_balance) as total_wallet_balance,
        AVG(admin_commission_rate) as avg_commission_rate
      FROM users
      WHERE user_type IN ('state_admin', 'state_financial_admin')
        AND is_active = true
      GROUP BY assigned_state
      ORDER BY assigned_state
    `;
    
    const stateStatsResult = await db.query(stateStatsQuery);
    
    res.json({
      success: true,
      data: result.rows,
      state_statistics: stateStatsResult.rows
    });
    
  } catch (error) {
    console.error('Get state admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch state admins'
    });
  }
};

/**
 * Freeze/Unfreeze state admin funds (super admin only)
 */
exports.manageAdminFunds = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }
    
    const { admin_id, action, reason } = req.body; // action: 'freeze' or 'unfreeze'
    const superAdminId = req.user.id;
    
    // Check if user is super admin
    const adminCheck = await db.query(
      'SELECT user_type FROM users WHERE id = $1',
      [superAdminId]
    );
    
    if (!isSuperAdminOrSuperFinancialAdmin(adminCheck.rows[0].user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Only super admin or super financial admin can manage admin funds'
      });
    }
    
    // Check if state admin exists
    const stateAdminCheck = await db.query(
      `SELECT id, full_name, email, admin_funds_frozen 
       FROM users 
       WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin')`,
      [admin_id]
    );
    
    if (stateAdminCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'State admin not found'
      });
    }
    
    const stateAdmin = stateAdminCheck.rows[0];
    
    if (action === 'freeze') {
      // Freeze admin funds
      await db.query(
        `UPDATE users 
         SET admin_funds_frozen = true,
             admin_frozen_by = $1,
             admin_frozen_at = CURRENT_TIMESTAMP,
             admin_frozen_reason = $2
         WHERE id = $3`,
        [superAdminId, reason, admin_id]
      );
      
      // Log audit trail
      await db.query(
        `INSERT INTO transaction_audits 
         (admin_id, action_type, description, performed_by)
         VALUES ($1, 'funds_frozen', $2, $3)`,
        [admin_id, `Admin funds frozen: ${reason}`, superAdminId]
      );
      
      res.json({
        success: true,
        message: `Funds frozen for admin ${stateAdmin.full_name}`,
        data: {
          admin_id,
          frozen: true,
          frozen_at: new Date(),
          reason
        }
      });
      
    } else if (action === 'unfreeze') {
      // Unfreeze admin funds
      await db.query(
        `UPDATE users 
         SET admin_funds_frozen = false,
             admin_frozen_by = NULL,
             admin_frozen_at = NULL,
             admin_frozen_reason = NULL
         WHERE id = $1`,
        [admin_id]
      );
      
      // Log audit trail
      await db.query(
        `INSERT INTO transaction_audits 
         (admin_id, action_type, description, performed_by)
         VALUES ($1, 'funds_unfrozen', $2, $3)`,
        [admin_id, `Admin funds unfrozen: ${reason}`, superAdminId]
      );
      
      res.json({
        success: true,
        message: `Funds unfrozen for admin ${stateAdmin.full_name}`,
        data: {
          admin_id,
          frozen: false,
          unfrozen_at: new Date(),
          reason
        }
      });
      
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "freeze" or "unfreeze"'
      });
    }
    
  } catch (error) {
    console.error('Manage admin funds error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to manage admin funds'
    });
  }
};

/**
 * Update state admin commission rate
 */
exports.updateCommissionRate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }
    
    const { admin_id, commission_rate } = req.body;
    const superAdminId = req.user.id;
    
    // Check if user is super admin
    const adminCheck = await db.query(
      'SELECT user_type FROM users WHERE id = $1',
      [superAdminId]
    );
    
    if (!isSuperAdminOrSuperFinancialAdmin(adminCheck.rows[0].user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Only super admin or super financial admin can update commission rates'
      });
    }
    
    // Validate commission rate (1% to 20%)
    if (commission_rate < 0.01 || commission_rate > 0.20) {
      return res.status(400).json({
        success: false,
        message: 'Commission rate must be between 1% and 20%'
      });
    }
    
    // Update commission rate
    const result = await db.query(
      `UPDATE users 
       SET admin_commission_rate = $1,
           updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_type IN ('state_admin', 'state_financial_admin')
       RETURNING id, full_name, email, admin_commission_rate`,
      [commission_rate, admin_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'State admin not found'
      });
    }
    
    // Log audit trail
    await db.query(
      `INSERT INTO transaction_audits 
       (admin_id, action_type, description, performed_by)
       VALUES ($1, 'payment_created', $2, $3)`,
      [
        admin_id,
        `Commission rate updated to ${(commission_rate * 100).toFixed(2)}%`,
        superAdminId
      ]
    );
    
    res.json({
      success: true,
      message: `Commission rate updated to ${(commission_rate * 100).toFixed(2)}%`,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update commission rate error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update commission rate'
    });
  }
};

/**
 * Get state admin dashboard (for state admin themselves)
 */
exports.getStateAdminDashboard = async (req, res) => {
  try {
    const adminId = req.user.id;
    
    // Verify user is state admin
    const adminCheck = await db.query(
      `SELECT 
        id, full_name, email, phone,
        assigned_state, assigned_city,
        admin_commission_rate, admin_wallet_balance,
        admin_funds_frozen, is_active
       FROM users 
       WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin')`,
      [adminId]
    );
    
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State financial admin only.'
      });
    }

    if (!isStateFinancialAdmin(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State financial admin only.'
      });
    }
    
    const admin = adminCheck.rows[0];
    
    // Get commission summary
    const commissionQuery = `
      SELECT 
        source,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        status,
        DATE(created_at) as date
      FROM admin_commissions
      WHERE admin_id = $1
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY source, status, DATE(created_at)
      ORDER BY date DESC, source
    `;
    
    // Get managed users
    const usersQuery = `
      SELECT 
        user_type,
        COUNT(*) as count,
        DATE(created_at) as join_date
      FROM users
      WHERE referred_by = $1
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY user_type, DATE(created_at)
      ORDER BY join_date DESC
    `;
    
    // Get recent transactions in assigned state
    const transactionsQuery = `
      SELECT 
        p.*,
        u.full_name as user_name,
        u.email as user_email,
        prop.title as property_title,
        ac.amount as commission_amount,
        ac.status as commission_status
      FROM payments p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN properties prop ON p.property_id = prop.id
      LEFT JOIN admin_commissions ac ON p.id = ac.payment_id AND ac.admin_id = $1
      WHERE prop.state = $2
        AND p.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND p.payment_status = 'completed'
      ORDER BY p.created_at DESC
      LIMIT 20
    `;
    
    // Get withdrawal history
    const withdrawalsQuery = `
      SELECT 
        amount,
        status,
        bank_name,
        account_number,
        requested_at,
        processed_at
      FROM admin_withdrawals
      WHERE admin_id = $1
      ORDER BY requested_at DESC
      LIMIT 10
    `;
    
    const [
      commissionResult,
      usersResult,
      transactionsResult,
      withdrawalsResult
    ] = await Promise.all([
      db.query(commissionQuery, [adminId]),
      db.query(usersQuery, [adminId]),
      db.query(transactionsQuery, [adminId, admin.assigned_state]),
      db.query(withdrawalsQuery, [adminId])
    ]);
    
    // Calculate weekly earnings (last 7 days)
    const weeklyEarningsQuery = `
      SELECT 
        SUM(amount) as total_earnings,
        DATE(created_at) as date
      FROM admin_commissions
      WHERE admin_id = $1
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND status = 'pending'
      GROUP BY DATE(created_at)
      ORDER BY date
    `;
    
    const weeklyEarningsResult = await db.query(weeklyEarningsQuery, [adminId]);
    
    res.json({
      success: true,
      data: {
        admin_info: admin,
        commissions: commissionResult.rows,
        managed_users: usersResult.rows,
        recent_transactions: transactionsResult.rows,
        withdrawals: withdrawalsResult.rows,
        weekly_earnings: weeklyEarningsResult.rows,
        summary: {
          total_pending_commission: commissionResult.rows
            .filter(c => c.status === 'pending')
            .reduce((sum, c) => sum + parseFloat(c.total_amount), 0),
          total_managed_users: usersResult.rows.reduce((sum, u) => sum + parseInt(u.count), 0),
          weekly_withdrawable: weeklyEarningsResult.rows.reduce((sum, w) => sum + parseFloat(w.total_earnings), 0)
        }
      }
    });
    
  } catch (error) {
    console.error('Get state admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch state admin dashboard'
    });
  }
};

/**
 * Create super financial admin (super admin only)
 */
exports.createSuperFinancialAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    if (req.user?.user_type !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admins can create super financial admins',
      });
    }

    const { full_name, email, phone, password } = req.body;

    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (
         full_name,
         email,
         phone,
         password_hash,
         user_type,
         referred_by,
         is_active
       ) VALUES ($1, $2, $3, $4, 'super_financial_admin', $5, true)
       RETURNING id, full_name, email, phone, user_type`,
      [full_name, email, phone, passwordHash, req.user.id]
    );

    return res.status(201).json({
      success: true,
      message: 'Super financial admin created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create super financial admin error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create super financial admin',
    });
  }
};