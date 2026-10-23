const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const virtualAccountController = require('../controllers/virtualAccountController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const { registrationLimiter, generalOpsLimiter } = require('../config/middleware/securityRateLimiters');

router.get('/config', virtualAccountController.getConfig);

router.get('/wallet', authenticate, virtualAccountController.getWalletAccount);
router.get('/wallet/credits', authenticate, virtualAccountController.getWalletCredits);

router.post(
  '/registration',
  registrationLimiter,
  [body('reference').isString().trim().isLength({ min: 5, max: 120 })],
  validateRequest,
  virtualAccountController.createRegistrationAccount
);

// Public because the payer has no account yet: the registration reference is
// the only identifier they hold at this stage.
router.get(
  '/registration/:reference',
  generalOpsLimiter,
  [param('reference').isString().trim().isLength({ min: 5, max: 120 })],
  validateRequest,
  virtualAccountController.getRegistrationStatus
);

module.exports = router;
