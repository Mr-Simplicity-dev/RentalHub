const express = require('express');
const router = express.Router();

const disputeController = require('../controllers/disputeController');
const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../middleware/roleMiddleware');
const { canAccessProperty } = require('../middleware/propertyAccessMiddleware');
const { canAccessDispute } = require('../middleware/disputeAccessMiddleware');
const upload = require('../middleware/uploadEvidence');

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

/**
 * Add message to dispute
 * Must be part of dispute or admin
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

router.post(
  '/:disputeId/evidence',
  authenticate,
  canAccessDispute,
  upload.single('file'),
  disputeController.uploadEvidence
);

router.get(
  '/evidence/:evidenceId/verify',
  authenticate,
  canAccessDispute,
  disputeController.verifyEvidenceIntegrity
);

module.exports = router;