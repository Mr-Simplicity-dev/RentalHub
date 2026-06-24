const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const complianceController = require('../controllers/complianceController');

router.get(
  '/overview',
  authenticate,
  allowRoles('admin','super_admin'),
  complianceController.getComplianceOverview
);

router.get(
  '/risk-trend',
  authenticate,
  allowRoles('admin','super_admin'),
  complianceController.getRiskTrend
);

module.exports = router;