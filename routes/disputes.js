const express = require('express');
const router = express.Router();

const disputeController = require('../controllers/disputeController');

const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { canAccessProperty } = require('../config/middleware/propertyAccessMiddleware');
const { canAccessDispute } = require('../config/middleware/disputeAccessMiddleware');
const upload = require('../config/middleware/uploadEvidence');

/**
 * Create dispute
 * Only tenant, landlord, admin, super_admin
 */
router.post(
  '/',
  authenticate,
  allowRoles('tenant', 'landlord', 'admin', 'super_admin'),
  disputeController.createDispute
);

/**
 * View disputes for a property
 * Must have property access
 */
router.get(
  '/property/:propertyId',
  authenticate,
  canAccessProperty,
  disputeController.getDisputes
);

router.get(
  '/:disputeId',
  authenticate,
  canAccessDispute,
  disputeController.getDisputeDetails
);

/**
 * Add message to dispute
 */
router.post(
  '/:disputeId/messages',
  authenticate,
  canAccessDispute,
  disputeController.addDisputeMessage
);

/**
 * Resolve dispute
 * Admin & Super Admin only
 */
router.patch(
  '/:disputeId/resolve',
  authenticate,
  allowRoles('admin', 'super_admin'),
  disputeController.resolveDispute
);

/**
 * Upload evidence
 */
router.post(
  '/:disputeId/evidence',
  authenticate,
  canAccessDispute,
  upload.single('file'),
  disputeController.uploadEvidence
);

router.get(
  '/:disputeId/evidence',
  authenticate,
  canAccessDispute,
  disputeController.listDisputeEvidence
);

/**
 * Verify evidence integrity
 */
router.get(
  '/evidence/:evidenceId',
  authenticate,
  disputeController.getEvidence
);

router.get(
  '/evidence/:evidenceId/verify',
  authenticate,
  disputeController.verifyEvidenceIntegrity
);

module.exports = router;
