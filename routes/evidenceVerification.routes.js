const express = require('express');
const router = express.Router();
const controller =
  require('../controllers/evidenceVerification.controller');
const { param } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const { evidenceVerificationValidators } = require('../config/validators/securityValidators');
const { authenticate } = require('../config/middleware/auth');

router.post(
  '/verify/dispute/:disputeId/pay',
  authenticate,
  evidenceVerificationValidators,
  validateRequest,
  controller.initializeVerificationPayment
);

router.get(
  '/verify/dispute/:disputeId',
  authenticate,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer')],
  validateRequest,
  controller.verifyDispute
);

module.exports = router;
