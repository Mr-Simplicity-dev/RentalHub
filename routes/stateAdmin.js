const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const stateAdminController = require('../controllers/stateAdminController');
const { authenticate } = require('../config/middleware/auth');
const { requireStateAdmin } = require('../config/middleware/requireStateAdmin');

// ====================== AUTHENTICATION ======================
router.use(authenticate);

// ====================== STATE ADMIN DASHBOARD ======================

/**
 * Get state admin dashboard
 */
router.get('/dashboard',
  requireStateAdmin,
  stateAdminController.getStateAdminDashboard
);

/**
 * Get state admin transactions
 */
router.get('/transactions',
  requireStateAdmin,
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      const adminId = req.user.id;
      const { limit = 10, page = 1, payment_type, start_date, end_date } = req.query;
      const offset = (page - 1) * limit;
      
      // Get admin's assigned state
      const adminResult = await db.query(
        'SELECT assigned_state, assigned_city FROM users WHERE id = $1',
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
          prop_state.state_name as property_state,
          prop.city as property_city,
          prop.area as property_area,
          ac.amount as commission_amount,
          ac.status as commission_status,
          ac.source as commission_source
        FROM payments p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN properties prop ON p.property_id = prop.id
        LEFT JOIN states prop_state ON prop_state.id = prop.state_id
        LEFT JOIN admin_commissions ac ON p.id = ac.payment_id AND ac.admin_id = $1
        WHERE LOWER(TRIM(prop_state.state_name)) = LOWER(TRIM($2))
          AND p.payment_status = 'completed'
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM payments p
        LEFT JOIN properties prop ON p.property_id = prop.id
        LEFT JOIN states prop_state ON prop_state.id = prop.state_id
        WHERE LOWER(TRIM(prop_state.state_name)) = LOWER(TRIM($1))
          AND p.payment_status = 'completed'
      `;
      
      const params = [adminId, admin.assigned_state];
      const countParams = [admin.assigned_state];
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
          recent_transactions: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].total),
            total_pages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });
      
    } catch (error) {
      req.logger.error('Get state admin transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions'
      });
    }
  }
);

/**
 * Get managed users
 */
router.get('/managed-users',
  requireStateAdmin,
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      const adminId = req.user.id;
      const { limit = 10, page = 1, user_type } = req.query;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT 
          u.*,
          COUNT(p.id) as total_transactions,
          SUM(CASE WHEN p.payment_status = 'completed' THEN p.amount ELSE 0 END) as total_spent
        FROM users u
        LEFT JOIN payments p ON u.id = p.user_id
        WHERE u.referred_by = $1
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM users u
        WHERE u.referred_by = $1
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
      
      query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);
      
      const [result, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, countParams)
      ]);
      
      res.json({
        success: true,
        data: {
          users: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].total),
            total_pages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });
      
    } catch (error) {
      req.logger.error('Get managed users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch managed users'
      });
    }
  }
);

/**
 * Get commission summary
 */
router.get('/commissions/summary',
  requireStateAdmin,
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      const adminId = req.user.id;
      
      const query = `
        SELECT 
          source,
          COUNT(*) as transaction_count,
          SUM(amount) as total_amount,
          status,
          DATE(created_at) as date
        FROM admin_commissions
        WHERE admin_id = $1
        GROUP BY source, status, DATE(created_at)
        ORDER BY date DESC, source
      `;
      
      const result = await db.query(query, [adminId]);
      
      res.json({
        success: true,
        data: result.rows
      });
      
    } catch (error) {
      req.logger.error('Get commission summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch commission summary'
      });
    }
  }
);

/**
 * Request withdrawal
 */
router.post('/withdraw',
  requireStateAdmin,
  [
    body('amount').isFloat({ min: 1000 }).withMessage('Minimum withdrawal amount is ₦1,000'),
    body('bank_name').notEmpty().withMessage('Bank name is required'),
    body('account_number').isLength({ min: 10, max: 10 }).withMessage('Account number must be 10 digits'),
    body('account_name').notEmpty().withMessage('Account name is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }
      
      const db = require('../config/middleware/database');
      const axios = require('axios');
      const adminId = req.user.id;
      const { amount, bank_name, account_number, account_name } = req.body;
      
      // ── Server-side account name verification via Paystack ──────────────
      const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
      const PAYSTACK_BASE_URL = 'https://api.paystack.co';
      if (PAYSTACK_SECRET_KEY) {
        try {
          const banksRes = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
          });
          const banks = banksRes.data?.data || [];
          const bank = banks.find(b =>
            b.name.toLowerCase().includes(bank_name.toLowerCase()) ||
            bank_name.toLowerCase().includes(b.name.toLowerCase())
          );
          if (!bank) {
            return res.status(400).json({ success: false, message: 'Bank not found. Please select a valid bank.' });
          }
          const verifyRes = await axios.get(
            `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${account_number}&bank_code=${bank.code}`,
            {
              headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
              },
            }
          );
          if (verifyRes.data?.status === true && verifyRes.data?.data?.account_name) {
            const verifiedName = verifyRes.data.data.account_name.trim().toLowerCase().replace(/\s+/g, ' ');
            const providedName = account_name.trim().toLowerCase().replace(/\s+/g, ' ');
            if (verifiedName !== providedName) {
              return res.status(400).json({
                success: false,
                message: `Account name mismatch. The bank record shows "${verifyRes.data.data.account_name}". Please use the exact name as registered with your bank.`,
              });
            }
          } else {
            return res.status(400).json({ success: false, message: 'Unable to verify account. Please check the account number and try again.' });
          }
        } catch (verifyErr) {
          req.logger.error('Account verification error:', verifyErr?.response?.data || verifyErr.message);
          return res.status(400).json({ success: false, message: 'Could not verify account details. Please try again.' });
        }
      }
      
      // Check if admin has sufficient balance
      const adminResult = await db.query(
        'SELECT admin_wallet_balance, admin_funds_frozen FROM users WHERE id = $1',
        [adminId]
      );
      
      if (adminResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      const admin = adminResult.rows[0];
      
      if (admin.admin_funds_frozen) {
        return res.status(400).json({
          success: false,
          message: 'Your funds are frozen. Contact super admin.'
        });
      }
      
      if (admin.admin_wallet_balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance'
        });
      }
      
      // Create withdrawal request
      const result = await db.query(
        `INSERT INTO admin_withdrawals 
         (admin_id, amount, bank_name, account_number, account_name, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [adminId, amount, bank_name, account_number, account_name]
      );
      
      // Deduct from wallet balance
      await db.query(
        `UPDATE users 
         SET admin_wallet_balance = admin_wallet_balance - $1
         WHERE id = $2`,
        [amount, adminId]
      );
      
      res.json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        data: result.rows[0]
      });
      
    } catch (error) {
      req.logger.error('Withdrawal request error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit withdrawal request'
      });
    }
  }
);

/**
 * Get withdrawal history
 */
router.get('/withdrawals',
  requireStateAdmin,
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      const adminId = req.user.id;
      
      const query = `
        SELECT 
          amount,
          status,
          bank_name,
          account_number,
          requested_at,
          processed_at,
          admin_note
        FROM admin_withdrawals
        WHERE admin_id = $1
        ORDER BY requested_at DESC
      `;
      
      const result = await db.query(query, [adminId]);
      
      res.json({
        success: true,
        data: {
          withdrawals: result.rows
        }
      });
      
    } catch (error) {
      req.logger.error('Get withdrawal history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch withdrawal history'
      });
    }
  }
);

module.exports = router;
