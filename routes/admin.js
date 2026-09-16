const express = require("express");
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticate } = require("../config/middleware/auth");
const { requireAdmin } = require('../config/middleware/requireAdmin');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdminOrSuperAdmin');
const adminController = require('../controllers/adminController');
const evidenceVerificationController = require('../controllers/evidenceVerification.controller');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const superAdminOnly = require('../config/middleware/superAdminOnly');
const validateRequest = require('../config/middleware/validateRequest');
const { CREATABLE_ADMIN_ROLES, GENERAL_ADMIN_LABELS } = require('../config/utils/roleHierarchy');
const { ZONES } = require('../config/utils/territorialZones');


/**
 * AUTH
 * All admin routes require authentication
 */
router.use(authenticate);

/**
 * =========================
 * DASHBOARD
 * =========================
 */
router.get('/stats', requireAdminOrSuperAdmin, adminController.getStats);

/**
 * =========================
 * USERS
 * =========================
  */
router.get('/users', requireAdminOrSuperAdmin, adminController.getAllUsers);
router.get('/users/:id', requireAdminOrSuperAdmin, adminController.getUserById);
router.post('/users/:id/assign-agent',
  [param('id').isInt(), body('agent_email').isEmail(), body('agent_full_name').isString().trim().isLength({ min: 1, max: 200 }), body('agent_phone').isString().trim().isLength({ min: 5, max: 20 })],
  validateRequest,
  requireAdminOrSuperAdmin, adminController.assignAgentToLandlord);
router.patch('/users/:id/verify',
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  requireAdminOrSuperAdmin, adminController.verifyUser);
router.delete('/users/:id',
  [param('id').isInt()],
  validateRequest,
  requireAdminOrSuperAdmin, adminController.deleteUser);

/**
 * =========================
 * VERIFICATIONS
 * =========================
 */
router.get(
  '/verifications/pending',
  requireAdmin,
  adminController.getPendingVerifications
);

router.get('/role-contract', superAdminOnly, (req, res) => res.json({
  success: true,
  data: { creatable_roles: CREATABLE_ADMIN_ROLES, general_role_labels: GENERAL_ADMIN_LABELS, zones: ZONES },
}));

router.post(
  '/verifications/:id/approve',
  requireAdmin,
  adminController.approveVerification
);

router.post(
  '/verifications/:id/reject',
  requireAdmin,
  adminController.rejectVerification
);

/**
 * =========================
 * PROPERTIES (NEW + UPDATED)
 * =========================
 */

// ✅ All properties (admin view)
router.get(
  '/properties',
  requireAdminOrSuperAdmin,
  adminController.getAllProperties
);



// ✅ Pending properties (approval queue)
router.get(
  '/properties/pending',
  requireAdminOrSuperAdmin,
  adminController.getPendingProperties
);

// ✅ Single property
router.get(
  '/properties/:id',
  requireAdminOrSuperAdmin,
  adminController.getPropertyById
);

// ✅ Approve property
router.patch(
  '/properties/:id/approve',
  requireAdminOrSuperAdmin,
  adminController.approveProperty
);

// ❌ Reject property
router.patch(
  '/properties/:id/reject',
  requireAdminOrSuperAdmin,
  adminController.rejectProperty
);

router.patch(
  '/properties/:id/unlist',
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  requireAdminOrSuperAdmin,
  adminController.unlistProperty
);

router.patch(
  '/properties/:id/relist',
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  requireAdminOrSuperAdmin,
  adminController.relistProperty
);

router.patch(
  '/properties/:id/feature',
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  requireAdminOrSuperAdmin,
  adminController.featureProperty
);

router.patch(
  '/properties/:id/unfeature',
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  requireAdminOrSuperAdmin,
  adminController.unfeatureProperty
);

/**
 * =========================
 * APPLICATIONS
 * =========================
 */
router.get(
  '/applications',
  requireAdminOrSuperAdmin,
  adminController.getAllApplications
);

router.get(
  '/applications/:id',
  requireAdminOrSuperAdmin,
  adminController.getApplicationById
);

router.post(
  '/applications/:id/approve',
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  requireAdminOrSuperAdmin,
  adminController.approveApplication
);

router.post(
  '/applications/:id/reject',
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  requireAdminOrSuperAdmin,
  adminController.rejectApplication
);


router.get(
  '/ledger/verify',
  authenticate,
  allowRoles('admin','super_admin'),
  adminController.verifyLedgerIntegrity
);

router.post(
  '/create-admin',
  [
    body('email').isEmail().normalizeEmail(),
    body('phone').isString().trim().isLength({ min: 5, max: 20 }),
    body('full_name').isString().trim().isLength({ min: 1, max: 200 }),
    body('password').isString().isLength({ min: 8, max: 128 }),
    body('user_type').isString().trim().isIn(CREATABLE_ADMIN_ROLES),
    body('assigned_state').optional().isString().trim().isLength({ max: 200 }),
    body('assigned_city').optional().isString().trim().isLength({ max: 200 }),
    body('assigned_zone').optional().isString().trim().isLength({ max: 50 }),
  ],
  validateRequest,
  authenticate,
  superAdminOnly,
  adminController.createAdmin
);

router.get(
  '/evidence-verifications',
  requireAdminOrSuperAdmin,
  evidenceVerificationController.adminGetVerificationLogs
);

/**
 * =========================
 * REGISTRATION ABANDONMENT & RECOVERY
 * =========================
 */
const {
  getAbandonedRegistrationsSummary,
  expireAbandonedRegistrations,
  reconcileRegisteredUsers,
} = require('../jobs/registrationReminderJobs');

router.get('/registrations/abandoned', requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const summary = await getAbandonedRegistrationsSummary();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status || 'pending'; // 'pending' | 'abandoned' | 'all'

    const db = require('../config/middleware/database');
    const whereClause =
      statusFilter === 'all'
        ? `WHERE trp.registered_user_id IS NULL`
        : `WHERE trp.payment_status = $1 AND trp.registered_user_id IS NULL`;
    const queryParams = statusFilter === 'all' ? [limit, offset] : [statusFilter, limit, offset];

    const records = await db.query(
      `SELECT trp.id, trp.user_type, trp.email, trp.phone, trp.full_name, trp.amount, trp.currency,
              trp.transaction_reference, trp.payment_status, trp.reminder_sent_at,
              COALESCE(trp.reminder_count, 0) AS reminder_count, trp.abandoned_at, trp.created_at
       FROM tenant_registration_payments trp
       ${whereClause}
       ORDER BY trp.created_at DESC
       LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams
    );

    res.json({
      success: true,
      data: {
        summary,
        records: records.rows || [],
        pagination: { page, limit },
      },
    });
  } catch (error) {
    req.logger ? req.logger.error('Failed to get abandoned registrations:', error) : console.error(error);
    res.status(500).json({ success: false, message: 'Failed to get abandoned registrations' });
  }
});

router.post('/registrations/abandoned/expire', requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const reconciled = await reconcileRegisteredUsers();
    const expired = await expireAbandonedRegistrations();
    const summary = await getAbandonedRegistrationsSummary();

    res.json({
      success: true,
      message: `Reconciled ${reconciled} registrations and expired ${expired} abandoned registrations`,
      data: { reconciled, expired, summary },
    });
  } catch (error) {
    req.logger ? req.logger.error('Failed to expire abandoned registrations:', error) : console.error(error);
    res.status(500).json({ success: false, message: 'Failed to expire abandoned registrations' });
  }
});

module.exports = router;

