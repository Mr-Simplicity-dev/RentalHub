const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { sensitiveActionLimiter } = require('../config/middleware/securityRateLimiters');
const exportController = require('../controllers/exportController');
const ndprController = require('../controllers/ndprController');

router.get(
  '/dispute/:disputeId',
  authenticate,
  allowRoles('admin','super_admin'),
  exportController.exportDisputeBundle
);

router.get(
  '/personal-data',
  authenticate,
  ndprController.exportPersonalData
);

router.post(
  '/purge-account',
  authenticate,
  sensitiveActionLimiter,
  ndprController.purgeAccount
);

module.exports = router;