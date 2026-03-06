const express = require("express");
const router = express.Router();
const { authenticate } = require("../config/middleware/auth");
const { requireAdmin } = require('../config/middleware/requireAdmin');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdminOrSuperAdmin');
const adminController = require('../controllers/adminController');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const superAdminOnly = require('../config/middleware/superAdminOnly');


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
router.delete('/users/:id', requireAdminOrSuperAdmin, adminController.deleteUser);

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

// ✅ Single property
router.get(
  '/properties/:id',
  requireAdminOrSuperAdmin,
  adminController.getPropertyById
);

// ✅ Pending properties (approval queue)
router.get(
  '/properties/pending',
  requireAdminOrSuperAdmin,
  adminController.getPendingProperties
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
  requireAdminOrSuperAdmin,
  adminController.unlistProperty
);

router.patch(
  '/properties/:id/relist',
  requireAdminOrSuperAdmin,
  adminController.relistProperty
);

router.patch(
  '/properties/:id/feature',
  requireAdminOrSuperAdmin,
  adminController.featureProperty
);

router.patch(
  '/properties/:id/unfeature',
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
  requireAdminOrSuperAdmin,
  adminController.approveApplication
);

router.post(
  '/applications/:id/reject',
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
  authenticate,
  superAdminOnly,
  adminController.createAdmin
);


module.exports = router;
