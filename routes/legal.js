const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const disputeController = require('../controllers/disputeController');
const legalController = require('../controllers/legalController');

const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { canLawyerAccessProperty } = require('../config/middleware/legalAccessMiddleware');
const audit = require('../config/middleware/auditMiddleware');
const validateRequest = require('../config/middleware/validateRequest');
const { grantLawyerAccessValidators } = require('../config/validators/securityValidators');

const LAWYER_ROLES = ['lawyer', 'state_lawyer', 'super_lawyer'];


/* ---------------------------------------------------
   Public Lawyer Directory
--------------------------------------------------- */

router.get(
  '/directory',
  legalController.getPublicLawyerDirectory
);

router.get(
  '/directory/full',
  authenticate,
  legalController.getUnlockedLawyerDirectory
);

router.get(
  '/platform-lawyer-program',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  legalController.getPlatformLawyerProgram
);

router.post(
  '/platform-lawyer-program/apply',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  [body('experience').optional().isString().trim().isLength({ max: 5000 }), body('reason').optional().isString().trim().isLength({ max: 5000 })],
  validateRequest,
  legalController.applyToPlatformLawyerProgram
);


/* ---------------------------------------------------
   Get Properties Accessible To Lawyer
--------------------------------------------------- */

router.get(
  '/properties',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('view_authorized_properties', 'property'),
  legalController.getAuthorizedProperties
);


/* ---------------------------------------------------
   Get Disputes For A Property
--------------------------------------------------- */

router.get(
  '/property/:propertyId/disputes',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  canLawyerAccessProperty,
  audit('view_property_disputes', 'property'),
  disputeController.getDisputes
);


/* ---------------------------------------------------
   Resolve Dispute
--------------------------------------------------- */

router.patch(
  '/disputes/:disputeId/resolve',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('resolve_dispute', 'dispute'),
  [param('disputeId').isInt(), body('resolution').optional().isString().trim().isLength({ max: 5000 })],
  validateRequest,
  legalController.resolveDispute
);

/* ---------------------------------------------------
   Grant Lawyer Access (Tenant / Landlord)
--------------------------------------------------- */

router.post(
  '/grant-access',
  authenticate,
  allowRoles('tenant', 'landlord'),
  grantLawyerAccessValidators,
  validateRequest,
  audit('grant_lawyer_access', 'property'),
  legalController.grantLawyerAccess
);

router.get(
  '/audit-logs',
  authenticate,
  allowRoles('admin', 'super_admin', ...LAWYER_ROLES),
  legalController.getLegalAuditLogs
);

/* ---------------------------------------------------
   Lawyer Evidence Verification
--------------------------------------------------- */

router.patch(
  '/disputes/:disputeId/evidence/:evidenceId/verify',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('verify_evidence', 'evidence'),
  [param('disputeId').isInt(), param('evidenceId').isInt(), body('status').optional().isString().trim().isLength({ max: 50 })],
  validateRequest,
  legalController.verifyEvidence
);

router.get(
  '/disputes/:disputeId/evidence/verification',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('view_evidence_verification', 'dispute'),
  legalController.getEvidenceVerification
);

/* ---------------------------------------------------
   Lawyer Case Notes
--------------------------------------------------- */

router.post(
  '/disputes/:disputeId/notes',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('create_case_note', 'dispute'),
  [param('disputeId').isInt(), body('content').isString().trim().isLength({ min: 1, max: 10000 })],
  validateRequest,
  legalController.createCaseNote
);

router.get(
  '/disputes/:disputeId/notes',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('view_case_notes', 'dispute'),
  legalController.getCaseNotes
);

router.patch(
  '/disputes/:disputeId/notes/:noteId',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('update_case_note', 'dispute'),
  [param('disputeId').isInt(), param('noteId').isInt(), body('content').optional().isString().trim().isLength({ max: 10000 })],
  validateRequest,
  legalController.updateCaseNote
);

router.delete(
  '/disputes/:disputeId/notes/:noteId',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('delete_case_note', 'dispute'),
  [param('disputeId').isInt(), param('noteId').isInt()],
  validateRequest,
  legalController.deleteCaseNote
);

router.patch(
  '/disputes/:disputeId/summary',
  authenticate,
  allowRoles(...LAWYER_ROLES),
  audit('update_dispute_summary', 'dispute'),
  [param('disputeId').isInt(), body('summary').optional().isString().trim().isLength({ max: 10000 })],
  validateRequest,
  legalController.updateDisputeSummary
);

/* ---------------------------------------------------
   Legal Protection Coverage & Support Requests
--------------------------------------------------- */

router.get(
  '/coverage-status',
  authenticate,
  legalController.getCoverageStatus
);

router.get(
  '/my-requests',
  authenticate,
  legalController.getMySupportRequests
);

router.post(
  '/request-help',
  authenticate,
  [body('message').isString().trim().isLength({ min: 1, max: 5000 }), body('subject').optional().isString().trim().isLength({ max: 500 })],
  validateRequest,
  legalController.submitSupportRequest
);

module.exports = router;
