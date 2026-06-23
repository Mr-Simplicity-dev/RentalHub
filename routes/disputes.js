const express = require('express');
const router = express.Router();

const disputeController = require('../controllers/disputeController');

const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { canAccessProperty } = require('../config/middleware/propertyAccessMiddleware');
const { canAccessDispute } = require('../config/middleware/disputeAccessMiddleware');
const upload = require('../config/middleware/uploadEvidence');
const { param } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');

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
  [param('propertyId').isInt({ min: 1 }).withMessage('propertyId must be a positive integer'), validateRequest],
  disputeController.getDisputes
);

/**
 * View current user's disputes
 */
router.get(
  '/me',
  authenticate,
  allowRoles('tenant', 'landlord', 'admin', 'super_admin'),
  disputeController.getMyDisputes
);

router.get(
  '/:disputeId',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  disputeController.getDisputeDetails
);

/**
 * Add message to dispute
 */
router.post(
  '/:disputeId/messages',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  disputeController.addDisputeMessage
);

/**
 * Edit a dispute message
 */
router.patch(
  '/:disputeId/messages/:messageId',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  disputeController.editDisputeMessage
);

/**
 * Resolve dispute
 * Admin & Super Admin only
 */
router.patch(
  '/:disputeId/resolve',
  authenticate,
  allowRoles('admin', 'super_admin'),
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  disputeController.resolveDispute
);

/**
 * Upload evidence
 */
router.post(
  '/:disputeId/evidence',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  upload.single('file'),
  disputeController.uploadEvidence
);

router.get(
  '/:disputeId/evidence',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  disputeController.listDisputeEvidence
);

/**
 * Verify evidence integrity
 */
router.get(
  '/evidence/:evidenceId',
  authenticate,
  [param('evidenceId').isInt({ min: 1 }).withMessage('evidenceId must be a positive integer'), validateRequest],
  disputeController.getEvidence
);

router.get(
  '/evidence/:evidenceId/verify',
  authenticate,
  [param('evidenceId').isInt({ min: 1 }).withMessage('evidenceId must be a positive integer'), validateRequest],
  disputeController.verifyEvidenceIntegrity
);

module.exports = router;

