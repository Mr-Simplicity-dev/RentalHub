const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../middleware/roleMiddleware');
const { canLawyerAccessProperty } = require('../middleware/legalAccessMiddleware');
const disputeController = require('../controllers/disputeController');
const { audit } = require('../middleware/auditMiddleware');

router.get(
  '/property/:propertyId/disputes',
  authenticate,
  allowRoles('lawyer'),
  canLawyerAccessProperty,
  audit('Lawyer viewed disputes', 'property'),
  disputeController.getDisputes
);

module.exports = router;