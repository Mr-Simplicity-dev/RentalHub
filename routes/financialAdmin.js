const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const financialAdminController = require('../controllers/financialAdminController');
const stateAdminController = require('../controllers/stateAdminController');
const { authenticate } = require('../config/middleware/auth');
const {
  requireFinancialAdmin,
  requireSuperAdminOrSuperFinancialAdmin,
  requireSuperAdminOrDelegatedDirectWithdraw,
} = require('../config/middleware/requireFinancialAdmin');
const { requireSuperAdmin } = require('../config/middleware/requireSuperAdmin');
const { isStateFinancialAdmin, isSuperAdminOrSuperFinancialAdmin: isSuperOrFinancialRole } = require('../config/utils/roleScopes');
const { criticalFinanceOpsLimiter } = require('../config/middleware/securityRateLimiters');

/**
 * All admin roles that earn commissions and can request withdrawals.
 * This includes state, super, and service-level admin roles.
 */
const WITHDRAWAL_ELIGIBLE_ROLES = new Set([
  'admin',
  'lga_financial_admin',
  'super_admin',
  'state_admin',
  'state_financial_admin',
  'lga_support_admin',
  'state_support_admin',
  'state_lawyer',
  'financial_admin',
  'super_financial_admin',
  'super_support_admin',
  'super_lawyer',
  'fumigation_admin',
  'lga_fumigation_admin',
  'state_fumigation_admin',
  'super_fumigation_admin',
  'transportation_admin',
  'lga_transportation_admin',
  'state_transportation_admin',
  'super_transportation_admin',
]);
const {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCodeFromName,
} = require('../services/paystackTransfer.service');

let adminWithdrawalOperationSchemaReady = false;

const ensureAdminWithdrawalOperationSchema = async () => {
  if (adminWithdrawalOperationSchemaReady) return;

  const db = require('../config/middleware/database');
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_withdrawal_operations (
      id SERIAL PRIMARY KEY,
      withdrawal_id INTEGER REFERENCES admin_withdrawals(id) ON DELETE SET NULL,
      admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      withdrawal_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_withdrawal_operations_withdrawal
      ON admin_withdrawal_operations(withdrawal_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_admin_withdrawal_operations_created
      ON admin_withdrawal_operations(created_at DESC);
  `);

  adminWithdrawalOperationSchemaReady = true;
};

const getFinanceActorName = (user = {}) =>
  user.full_name || user.name || user.email || `Admin #${user.id || 'unknown'}`;

const createAdminWithdrawalOperation = async ({
  withdrawalId,
  adminId,
  actorId,
  actorName,
  eventType,
  note = null,
  withdrawalSnapshot = {},
  metadata = {},
}) => {
  const db = require('../config/middleware/database');
  await db.query(
    `INSERT INTO admin_withdrawal_operations (
       withdrawal_id,
       admin_id,
       actor_id,
       actor_name,
       event_type,
       note,
       withdrawal_snapshot,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
    [
      withdrawalId || null,
      adminId || null,
      actorId || null,
      actorName || null,
      eventType,
      note || null,
      JSON.stringify(withdrawalSnapshot || {}),
      JSON.stringify(metadata || {}),
    ]
  );
};

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
  criticalFinanceOpsLimiter,
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
  criticalFinanceOpsLimiter,
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
  criticalFinanceOpsLimiter,
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
  criticalFinanceOpsLimiter,
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
  criticalFinanceOpsLimiter,
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

const canRequestAdminWithdrawal = (userType) =>
  WITHDRAWAL_ELIGIBLE_ROLES.has(userType);

/**
 * Request personal commission withdrawal (eligible admin roles)
 */
router.post('/withdraw/request',
  criticalFinanceOpsLimiter,
  (req, res, next) => {
    if (!canRequestAdminWithdrawal(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Eligible admin role required.'
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
      req.logger.error('Withdrawal request error:', error);
      res.status(400).json({
        success: false,
        message: 'Withdrawal request could not be completed. Please verify the details and try again.'
      });
    }
  }
);

/**
 * Get commission summary (eligible admin roles)
 */
router.get('/commissions/summary',
  (req, res, next) => {
    if (!canRequestAdminWithdrawal(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Eligible admin role required.'
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
      req.logger.error('Get commission summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch commission summary'
      });
    }
  }
);

/**
 * Get withdrawable balance snapshot (eligible admin roles)
 */
router.get('/commissions/withdrawable',
  (req, res, next) => {
    if (!canRequestAdminWithdrawal(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Eligible admin role required.'
      });
    }
    next();
  },
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');

      const [walletResult, earningsResult] = await Promise.all([
        db.query(
          `SELECT COALESCE(admin_wallet_balance, 0) AS withdrawable_amount
           FROM users
           WHERE id = $1
           LIMIT 1`,
          [req.user.id]
        ),
        db.query(
          `SELECT COALESCE(SUM(amount), 0) AS total_earned
           FROM admin_commissions
           WHERE admin_id = $1`,
          [req.user.id]
        )
      ]);

      res.json({
        success: true,
        data: {
          withdrawable_amount: Number(walletResult.rows?.[0]?.withdrawable_amount || 0),
          total_earned: Number(earningsResult.rows?.[0]?.total_earned || 0),
        }
      });
    } catch (error) {
      req.logger.error('Get withdrawable balance snapshot error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch withdrawable balance'
      });
    }
  }
);

/**
 * Get withdrawal history (eligible admin roles)
 */
router.get('/withdrawals/history',
  (req, res, next) => {
    if (!canRequestAdminWithdrawal(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Eligible admin role required.'
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
      req.logger.error('Get withdrawal history error:', error);
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
  requireSuperAdminOrDelegatedDirectWithdraw,
  async (req, res) => {
    try {
      const db = require('../config/middleware/database');
      await ensureAdminWithdrawalOperationSchema();

      const [pendingResult, decisionsResult] = await Promise.all([
        db.query(
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
        ),
        db.query(
          `SELECT
             awo.*,
             reviewer.full_name AS reviewer_name,
             requester.full_name AS requester_name,
             requester.email AS requester_email
           FROM admin_withdrawal_operations awo
           LEFT JOIN users reviewer ON reviewer.id = awo.actor_id
           LEFT JOIN users requester ON requester.id = awo.admin_id
           ORDER BY awo.created_at DESC
           LIMIT 25`
        ),
      ]);
      
      res.json({
        success: true,
        data: {
          pending: pendingResult.rows,
          recent_decisions: decisionsResult.rows,
        }
      });
    } catch (error) {
      req.logger.error('Get pending withdrawals error:', error);
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
  requireSuperAdminOrDelegatedDirectWithdraw,
  criticalFinanceOpsLimiter,
  [
    body('admin_note').optional()
  ],
  async (req, res) => {
    const db = require('../config/middleware/database');
    try {
      await ensureAdminWithdrawalOperationSchema();

      const { withdrawalId } = req.params;
      const adminNote = String(req.body?.admin_note || '').trim() || 'Approved by finance review';

      await db.query('BEGIN');

      const existing = await db.query(
        `SELECT * FROM admin_withdrawals WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [withdrawalId]
      );

      if (existing.rows.length === 0) {
        await db.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Withdrawal request not found'
        });
      }

      const withdrawal = existing.rows[0];
      if (withdrawal.status !== 'pending') {
        await db.query('ROLLBACK');
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
          adminNote,
          req.user.id,
          withdrawalId,
        ]
      );
      
      if (result.rows.length === 0) {
        await db.query('ROLLBACK');
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

      await createAdminWithdrawalOperation({
        withdrawalId: Number(withdrawalId),
        adminId: result.rows[0].admin_id,
        actorId: req.user.id,
        actorName: getFinanceActorName(req.user),
        eventType: 'withdrawal_approved',
        note: adminNote,
        withdrawalSnapshot: withdrawal,
        metadata: {
          amount: Number(result.rows[0].amount || 0),
          transfer_reference: transfer?.reference || reference,
          transfer_status: transfer?.status || 'pending',
        },
      });

      await db.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Withdrawal approved and payout initiated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      await db.query('ROLLBACK');
      req.logger.error('Approve withdrawal error:', error);
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
  requireSuperAdminOrDelegatedDirectWithdraw,
  criticalFinanceOpsLimiter,
  [
    body('admin_note').notEmpty().withMessage('Rejection reason is required')
  ],
  async (req, res) => {
    const db = require('../config/middleware/database');
    try {
      await ensureAdminWithdrawalOperationSchema();

      const { withdrawalId } = req.params;
      const adminNote = String(req.body?.admin_note || '').trim();

      if (!adminNote) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      await db.query('BEGIN');
      
      // Get withdrawal details first
      const withdrawalResult = await db.query(
        `SELECT * FROM admin_withdrawals WHERE id = $1 FOR UPDATE`,
        [withdrawalId]
      );
      
      if (withdrawalResult.rows.length === 0) {
        await db.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Withdrawal request not found'
        });
      }
      
      const withdrawal = withdrawalResult.rows[0];

      if (withdrawal.status !== 'pending') {
        await db.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Withdrawal request is already ${withdrawal.status}`
        });
      }
      
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
        [req.user.id, adminNote, withdrawalId]
      );
      
      // Log audit
      await db.query(
        `INSERT INTO transaction_audits 
         (admin_id, action_type, amount, description, performed_by)
         VALUES ($1, 'withdrawal_rejected', $2, $3, $4)`,
        [
          withdrawal.admin_id,
          withdrawal.amount,
          `Withdrawal rejected: ${adminNote}`,
          req.user.id
        ]
      );

      await createAdminWithdrawalOperation({
        withdrawalId: Number(withdrawalId),
        adminId: withdrawal.admin_id,
        actorId: req.user.id,
        actorName: getFinanceActorName(req.user),
        eventType: 'withdrawal_rejected',
        note: adminNote,
        withdrawalSnapshot: withdrawal,
        metadata: {
          amount: Number(withdrawal.amount || 0),
          refunded_to_wallet: true,
        },
      });

      await db.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Withdrawal rejected successfully',
        data: result.rows[0]
      });
    } catch (error) {
      await db.query('ROLLBACK');
      req.logger.error('Reject withdrawal error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reject withdrawal'
      });
    }
  }
);

// ── Commission Configuration (super/financial admin) ──
router.get('/commission-config',
  authenticate,
  requireSuperAdminOrSuperFinancialAdmin,
  async (req, res) => {
    try {
      const result = await db.query(
        'SELECT key, value, description, updated_at, updated_by FROM commission_config ORDER BY key'
      );
      const config = {};
      for (const row of result.rows) {
        config[row.key] = { value: parseFloat(row.value), description: row.description, updated_at: row.updated_at, updated_by: row.updated_by };
      }
      res.json({ success: true, data: config });
    } catch (error) {
      req.logger.error('Get commission config error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch commission config' });
    }
  }
);

router.put('/commission-config',
  authenticate,
  requireSuperAdminOrSuperFinancialAdmin,
  async (req, res) => {
    try {
      const { updates } = req.body;
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ success: false, message: 'updates object required' });
      }

      // Log old values before updating
      const oldResult = await db.query('SELECT key, value FROM commission_config WHERE key = ANY($1)', [Object.keys(updates)]);
      const oldMap = {};
      for (const r of oldResult.rows) oldMap[r.key] = parseFloat(r.value);

      for (const [key, value] of Object.entries(updates)) {
        const oldVal = oldMap[key];
        await db.query(
          'INSERT INTO commission_config (key, value, updated_by, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP',
          [key, String(value), req.user.id]
        );

        if (oldVal !== undefined && parseFloat(value) !== oldVal) {
          await db.query(
            `INSERT INTO transaction_audits (admin_id, action_type, amount, description, performed_by)
             VALUES ($1, 'commission_rate_changed', $2, $3, $4)`,
            [req.user.id, 0, `Commission config "${key}" changed from ${oldVal} to ${value}`]
          );
        }
      }

      const { invalidateCache } = require('../config/utils/commissionConfig');
      invalidateCache();

      res.json({ success: true, message: 'Commission config updated' });
    } catch (error) {
      req.logger.error('Update commission config error:', error);
      res.status(500).json({ success: false, message: 'Failed to update commission config' });
    }
  }
);

module.exports = router;
