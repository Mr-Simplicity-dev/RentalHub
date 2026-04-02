const express = require('express');
const router = express.Router();

const disputeController = require('../controllers/disputeController');
const legalController = require('../controllers/legalController');

const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { canLawyerAccessProperty } = require('../config/middleware/legalAccessMiddleware');
const audit = require('../config/middleware/auditMiddleware');


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
  allowRoles('lawyer'),
  legalController.getPlatformLawyerProgram
);

router.post(
  '/platform-lawyer-program/apply',
  authenticate,
  allowRoles('lawyer'),
  legalController.applyToPlatformLawyerProgram
);


/* ---------------------------------------------------
   Get Properties Accessible To Lawyer
--------------------------------------------------- */

router.get(
  '/properties',
  authenticate,
  allowRoles('lawyer'),
  audit('view_authorized_properties', 'property'),
  legalController.getAuthorizedProperties
);


/* ---------------------------------------------------
   Get Disputes For A Property
--------------------------------------------------- */

router.get(
  '/property/:propertyId/disputes',
  authenticate,
  allowRoles('lawyer'),
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
  allowRoles('lawyer'),
  audit('resolve_dispute', 'dispute'),
  legalController.resolveDispute
);

router.get(
  '/audit-logs',
  authenticate,
  allowRoles('admin', 'super_admin', 'lawyer'),
  legalController.getLegalAuditLogs
);

/* ---------------------------------------------------
   Lawyer Evidence Verification
--------------------------------------------------- */

router.patch(
  '/disputes/:disputeId/evidence/:evidenceId/verify',
  authenticate,
  allowRoles('lawyer'),
  audit('verify_evidence', 'evidence'),
  legalController.verifyEvidence
);

router.get(
  '/disputes/:disputeId/evidence/verification',
  authenticate,
  allowRoles('lawyer'),
  audit('view_evidence_verification', 'dispute'),
  legalController.getEvidenceVerification
);

/* ---------------------------------------------------
   Lawyer Case Notes
--------------------------------------------------- */

router.post(
  '/disputes/:disputeId/notes',
  authenticate,
  allowRoles('lawyer'),
  audit('create_case_note', 'dispute'),
  legalController.createCaseNote
);

router.get(
  '/disputes/:disputeId/notes',
  authenticate,
  allowRoles('lawyer'),
  audit('view_case_notes', 'dispute'),
  legalController.getCaseNotes
);

router.patch(
  '/disputes/:disputeId/notes/:noteId',
  authenticate,
  allowRoles('lawyer'),
  audit('update_case_note', 'dispute'),
  legalController.updateCaseNote
);

router.delete(
  '/disputes/:disputeId/notes/:noteId',
  authenticate,
  allowRoles('lawyer'),
  audit('delete_case_note', 'dispute'),
  legalController.deleteCaseNote
);

router.patch(
  '/disputes/:disputeId/summary',
  authenticate,
  allowRoles('lawyer'),
  audit('update_dispute_summary', 'dispute'),
  legalController.updateDisputeSummary
);
