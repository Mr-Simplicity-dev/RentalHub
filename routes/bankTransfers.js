const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const bankTransferController = require('../controllers/bankTransferController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const { registrationLimiter, criticalFinanceOpsLimiter } = require('../config/middleware/securityRateLimiters');

router.get('/accounts', bankTransferController.getAccounts);

router.get(
  '/registration/status/:reference',
  [param('reference').isString().trim().isLength({ min: 5, max: 120 })],
  validateRequest,
  bankTransferController.getRegistrationTransferStatus
);

// Public because the registration exists before the account does. The capture
// is sent as a data URL by the app itself; there is no file upload control.
router.post(
  '/registration/proof',
  registrationLimiter,
  [
    body('reference').isString().trim().isLength({ min: 5, max: 120 }),
    body('bank_account_id').isInt({ min: 1 }),
    body('payer_name').optional({ nullable: true }).isString().trim().isLength({ max: 150 }),
    body('payer_bank').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('proof_image').isString().isLength({ min: 40, max: 950000 }),
  ],
  validateRequest,
  bankTransferController.submitRegistrationProof
);

router.post(
  '/wallet/proof',
  authenticate,
  criticalFinanceOpsLimiter,
  [
    body('amount').isFloat({ min: 100 }),
    body('bank_account_id').isInt({ min: 1 }),
    body('payer_name').optional({ nullable: true }).isString().trim().isLength({ max: 150 }),
    body('payer_bank').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('proof_image').isString().isLength({ min: 40, max: 950000 }),
  ],
  validateRequest,
  bankTransferController.submitWalletProof
);

module.exports = router;
