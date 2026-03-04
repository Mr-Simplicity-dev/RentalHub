const express = require('express');
const router = express.Router();

const disputeController = require('../controllers/disputeController');
const legalController = require('../controllers/legalController');

const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { canLawyerAccessProperty, canAccessLegal } = require('../config/middleware/legalAccessMiddleware');
const { audit } = require('../config/middleware/auditMiddleware');

router.get(
  '/properties',
  authenticate,
  allowRoles('lawyer'),
  legalController.getAuthorizedProperties
);

router.get(
  '/property/:propertyId/disputes',
  authenticate,
  allowRoles('lawyer'),
  canLawyerAccessProperty,
  audit('Lawyer viewed disputes', 'property'),
  disputeController.getDisputes
);

module.exports = router;