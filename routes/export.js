const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const validateRequest = require('../config/middleware/validateRequest');
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
  sensitiveActionLimiter,
  ndprController.exportPersonalData
);

router.post(
  '/purge-account',
  authenticate,
  sensitiveActionLimiter,
  [
    body('password')
      .isString()
      .withMessage('Password is required')
      .isLength({ min: 1, max: 200 })
      .withMessage('Password is required'),
  ],
  validateRequest,
  ndprController.purgeAccount
);

module.exports = router;
