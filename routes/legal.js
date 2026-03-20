const express = require('express');
const router = express.Router();

const disputeController = require('../controllers/disputeController');
const legalController = require('../controllers/legalController');

const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { canLawyerAccessProperty } = require('../config/middleware/legalAccessMiddleware');
const audit = require('../config/middleware/auditMiddleware');


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


module.exports = router;
