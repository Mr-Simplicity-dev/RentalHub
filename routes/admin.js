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
    body('user_type').isString().trim().isIn([
      'admin', 'lga_admin', 'state_admin', 'state_financial_admin',
      'lga_support_admin', 'state_support_admin', 'super_support_admin',
      'recruitment_admin',
    ]),
    body('assigned_state').optional().isString().trim().isLength({ max: 200 }),
    body('assigned_city').optional().isString().trim().isLength({ max: 200 }),
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

module.exports = router;
