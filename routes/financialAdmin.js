const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const financialAdminController = require('../controllers/financialAdminController');
const stateAdminController = require('../controllers/stateAdminController');
const { authenticate } = require('../config/middleware/auth');
const {
  requireFinancialAdmin,
  requireSuperAdminOrSuperFinancialAdmin,
} = require('../config/middleware/requireFinancialAdmin');
const { requireSuperAdmin } = require('../config/middleware/requireSuperAdmin');
const { isStateFinancialAdmin } = require('../config/utils/roleScopes');
const {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCodeFromName,
} = require('../services/paystackTransfer.service');

// ====================== AUTHENTICATION ======================
router.use(authenticate);

// ====================== SUPER FINANCIAL ADMIN ROUTES ======================

/**
 * Get all transactions (super financial admin only)
 * Can see every transaction happening in the project
 */
router.get('/transactions',
  requireFinancialAdmin,
  financialAdminController.getAllTransactions
);

/**
 * Get real-time transaction statistics
 */
router.get('/stats/realtime',
  requireFinancialAdmin,
  financialAdminController.getRealTimeStats
);

/**
 * Get state admin performance dashboard
 */
router.get('/performance/state-admins',
  requireFinancialAdmin,
  financialAdminController.getStateAdminPerformance
);

/**
 * Get transaction audit trail
 */
router.get('/audit-trail',
  requireFinancialAdmin,
  financialAdminController.getTransactionAuditTrail
);

/**
 * Freeze user funds (super financial admin only)
 */
router.post('/funds/freeze',
  requireFinancialAdmin,
  [
    body('user_id').isInt().withMessage('User ID is required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('reason').notEmpty().withMessage('Reason is required')
  ],
  financialAdminController.freezeUserFunds
);

/**
 * Get frozen funds
 */
router.get('/funds/frozen',
  requireFinancialAdmin,
  financialAdminController.getFrozenFunds
);

// ====================== STATE ADMIN MANAGEMENT (SUPER ADMIN ONLY) ======================

/**
 * Create state admin (super admin only)
 */
router.post('/state-admins/create',
  requireSuperAdminOrSuperFinancialAdmin,
  [
    body('full_name').notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('assigned_state').notEmpty().withMessage('Assigned state is required'),
    body('assigned_city').optional(),
    body('commission_rate').optional().isFloat({ min: 0.01, max: 0.20 }).withMessage('Commission rate must be between 1% and 20%')
  ],
  stateAdminController.createStateAdmin
);

/**
 * Create super financial admin (super admin only)
 */
router.post('/super-financial-admins/create',
  requireSuperAdmin,
  [
    body('full_name').notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  stateAdminController.createSuperFinancialAdmin
);

/**
 * Get all state admins
 */
router.get('/state-admins',
  requireSuperAdminOrSuperFinancialAdmin,
  stateAdminController.getAllStateAdmins
);

/**
 * Freeze/Unfreeze state admin funds (super admin only)
 */
router.post('/state-admins/funds/manage',
  requireSuperAdminOrSuperFinancialAdmin,
  [
    body('admin_id').isInt().withMessage('Admin ID is required'),
    body('action').isIn(['freeze', 'unfreeze']).withMessage('Action must be "freeze" or "unfreeze"'),
    body('reason').notEmpty().withMessage('Reason is required')
  ],
  stateAdminController.manageAdminFunds
);

/**
 * Update state admin commission rate (super admin only)
 */
router.put('/state-admins/commission-rate',
  requireSuperAdminOrSuperFinancialAdmin,
  [
    body('admin_id').isInt().withMessage('Admin ID is required'),
    body('commission_rate').isFloat({ min: 0.01, max: 0.20 }).withMessage('Commission rate must be between 1% and 20%')
  ],
  stateAdminController.updateCommissionRate
);

// ====================== STATE ADMIN DASHBOARD (STATE ADMIN ONLY) ======================

/**
 * Get state admin dashboard
 */
router.get('/dashboard/state-admin',
  (req, res, next) => {
    // Check if user is state financial admin
    if (!isStateFinancialAdmin(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State financial admin only.'
      });
    }
    next();
  },
  stateAdminController.getStateAdminDashboard
);

// ====================== COMMISSION WITHDRAWAL ROUTES ======================

/**
 * Request commission withdrawal (state admin only)
 */
router.post('/withdraw/request',
  (req, res, next) => {
    if (!isStateFinancialAdmin(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State financial admin only.'
      });
    }
    next();
  },
  [
    body('amount').isFloat({ min: 1000 }).withMessage('Minimum withdrawal amount is ₦1,000'),
    body('bank_name').notEmpty().withMessage('Bank name is required'),
    body('account_number').isLength({ min: 10, max: 10 }).withMessage('Account number must be 10 digits'),
    body('account_name').notEmpty().withMessage('Account name is required')
  ],
  async (req, res) => {
    try {
      const commissionService = require('../services/commissionService');
      const result = await commissionService.processAdminWithdrawal(
        req.user.id,
        req.body.amount,
        {
          bank_name: req.body.bank_name,
          account_number: req.body.account_number,
          account_name: req.body.account_name
        }
      );
      
      res.json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        data: result
      });
    } catch (error) {
      console.error('Withdrawal request error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * Get commission summary (state admin only)
 */
router.get('/commissions/summary',
  (req, res, next) => {
    if (!isStateFinancialAdmin(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State financial admin only.'
      });
    }
    next();
  },
  async (req, res) => {
    try {
      const commissionService = require('../services/commissionService');
      const result = await commissionService.getAdminCommissionSummary(req.user.id);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get commission summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch commission summary'
      });
    }
  }
);

/**
 * Get withdrawal history (state admin only)
 */
router.get('/withdrawals/history',
  (req, res, next) => {
    if (!isStateFinancialAdmin(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. State financial admin only.'
      });
    }
    next();
  },
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      const result = await db.query(
        `SELECT * FROM admin_withdrawals 
         WHERE admin_id = $1 
         ORDER BY requested_at DESC`,
        [req.user.id]
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Get withdrawal history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch withdrawal history'
      });
    }
  }
);

// ====================== ADMIN WITHDRAWAL APPROVAL (SUPER ADMIN ONLY) ======================

/**
 * Get pending withdrawal requests
 */
router.get('/withdrawals/pending',
  requireSuperAdminOrSuperFinancialAdmin,
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      const result = await db.query(
        `SELECT 
          aw.*,
          u.full_name as admin_name,
          u.email as admin_email,
          u.assigned_state,
          u.assigned_city
         FROM admin_withdrawals aw
         JOIN users u ON aw.admin_id = u.id
         WHERE aw.status = 'pending'
         ORDER BY aw.requested_at DESC`
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Get pending withdrawals error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending withdrawals'
      });
    }
  }
);

/**
 * Approve withdrawal request
 */
router.post('/withdrawals/:withdrawalId/approve',
  requireSuperAdminOrSuperFinancialAdmin,
  [
    body('admin_note').optional()
  ],
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      const { withdrawalId } = req.params;
      const { admin_note } = req.body;

      const existing = await db.query(
        `SELECT * FROM admin_withdrawals WHERE id = $1 LIMIT 1`,
        [withdrawalId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Withdrawal request not found'
        });
      }

      const withdrawal = existing.rows[0];
      if (withdrawal.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Withdrawal request is already ${withdrawal.status}`
        });
      }

      const bankCode = withdrawal.bank_code || await resolveBankCodeFromName(withdrawal.bank_name);

      let recipientCode = withdrawal.paystack_recipient_code;
      if (!recipientCode) {
        const recipient = await createTransferRecipient({
          name: withdrawal.account_name,
          accountNumber: withdrawal.account_number,
          bankCode,
        });
        recipientCode = recipient.recipient_code;
      }

      const reference = `SAW_${withdrawal.id}_${Date.now()}`;
      const transfer = await initiateTransfer({
        amount: withdrawal.amount,
        recipientCode,
        reason: `State admin withdrawal #${withdrawal.id}`,
        reference,
      });
      
      // Update withdrawal status
      const result = await db.query(
        `UPDATE admin_withdrawals 
         SET status = 'approved',
             bank_code = $1,
             paystack_recipient_code = $2,
             paystack_transfer_code = $3,
             paystack_transfer_reference = $4,
             paystack_transfer_status = $5,
             paystack_last_response = $6,
             payout_attempted_at = CURRENT_TIMESTAMP,
           processed_by = $8,
             processed_at = CURRENT_TIMESTAMP,
             admin_note = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $9 AND status = 'pending'
         RETURNING *`,
        [
          bankCode,
          recipientCode,
          transfer?.transfer_code || null,
          transfer?.reference || reference,
          transfer?.status || 'pending',
          JSON.stringify(transfer || {}),
          admin_note || 'Auto payout initiated',
          req.user.id,
          withdrawalId,
        ]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Withdrawal request not found or already processed'
        });
      }
      
      // Log audit
      await db.query(
        `INSERT INTO transaction_audits 
         (admin_id, action_type, amount, description, performed_by)
         VALUES ($1, 'withdrawal_approved', $2, $3, $4)`,
        [
          result.rows[0].admin_id,
          result.rows[0].amount,
          `Withdrawal approved: ₦${result.rows[0].amount.toLocaleString()}`,
          req.user.id
        ]
      );
      
      res.json({
        success: true,
        message: 'Withdrawal approved and payout initiated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Approve withdrawal error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to approve withdrawal'
      });
    }
  }
);

/**
 * Reject withdrawal request
 */
router.post('/withdrawals/:withdrawalId/reject',
  requireSuperAdminOrSuperFinancialAdmin,
  [
    body('admin_note').notEmpty().withMessage('Rejection reason is required')
  ],
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      const { withdrawalId } = req.params;
      const { admin_note } = req.body;
      
      // Get withdrawal details first
      const withdrawalResult = await db.query(
        `SELECT * FROM admin_withdrawals WHERE id = $1`,
        [withdrawalId]
      );
      
      if (withdrawalResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Withdrawal request not found'
        });
      }
      
      const withdrawal = withdrawalResult.rows[0];
      
      // Return funds to admin wallet
      await db.query(
        `UPDATE users 
         SET admin_wallet_balance = admin_wallet_balance + $1
         WHERE id = $2`,
        [withdrawal.amount, withdrawal.admin_id]
      );
      
      // Update withdrawal status
      const result = await db.query(
        `UPDATE admin_withdrawals 
         SET status = 'rejected',
             processed_by = $1,
             processed_at = CURRENT_TIMESTAMP,
             admin_note = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [req.user.id, admin_note, withdrawalId]
      );
      
      // Log audit
      await db.query(
        `INSERT INTO transaction_audits 
         (admin_id, action_type, amount, description, performed_by)
         VALUES ($1, 'withdrawal_rejected', $2, $3, $4)`,
        [
          withdrawal.admin_id,
          withdrawal.amount,
          `Withdrawal rejected: ${admin_note}`,
          req.user.id
        ]
      );
      
      res.json({
        success: true,
        message: 'Withdrawal rejected successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Reject withdrawal error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reject withdrawal'
      });
    }
  }
);

module.exports = router;
