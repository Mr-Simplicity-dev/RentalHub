const { body, param, query } = require('express-validator');

const grantLawyerAccessValidators = [
  body('property_id').isInt({ min: 1 }).withMessage('property_id must be a positive integer'),
  body('lawyer_id').isInt({ min: 1 }).withMessage('lawyer_id must be a positive integer'),
  body('client_user_id').isInt({ min: 1 }).withMessage('client_user_id must be a positive integer'),
];

const agentIdParamValidator = [
  param('agentId').isInt({ min: 1 }).withMessage('agentId must be a positive integer'),
];

const withdrawalCreateValidators = [
  ...agentIdParamValidator,
  body('landlordId').isInt({ min: 1 }).withMessage('landlordId must be a positive integer'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be greater than 0'),
  body('withdrawalMethod')
    .optional()
    .isIn(['bank_transfer', 'wallet'])
    .withMessage('withdrawalMethod must be bank_transfer or wallet'),
  body('bankAccountId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('bankAccountId must be a positive integer'),
  body('bankName').optional().isLength({ min: 2, max: 120 }).withMessage('bankName must be between 2 and 120 characters'),
  body('bankCode').optional().isLength({ min: 3, max: 10 }).withMessage('bankCode must be between 3 and 10 characters'),
  body('accountNumber').optional().matches(/^\d{10}$/).withMessage('accountNumber must be exactly 10 digits'),
  body('accountName').optional().isLength({ min: 2, max: 120 }).withMessage('accountName must be between 2 and 120 characters'),
  body('requestReason').optional().isLength({ max: 500 }).withMessage('requestReason cannot exceed 500 characters'),
];

const withdrawalQueryValidators = [
  ...agentIdParamValidator,
  query('landlordId').optional().isInt({ min: 1 }).withMessage('landlordId must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be 0 or greater'),
  query('status')
    .optional()
    .isIn(['pending', 'approved', 'rejected', 'processing', 'completed'])
    .withMessage('status must be pending, approved, rejected, processing, or completed'),
];

const withdrawalSummaryValidators = [
  ...agentIdParamValidator,
  query('landlordId').isInt({ min: 1 }).withMessage('landlordId must be a positive integer'),
];

const commissionRatesSetValidators = [
  ...agentIdParamValidator,
  body('landlordId').isInt({ min: 1 }).withMessage('landlordId must be a positive integer'),
  body('commissionType')
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('commissionType must be between 2 and 80 characters'),
  body('rate').isFloat({ min: 0, max: 100 }).withMessage('rate must be between 0 and 100'),
];

const commissionRatesGetValidators = [
  ...agentIdParamValidator,
  query('landlordId').optional().isInt({ min: 1 }).withMessage('landlordId must be a positive integer'),
];

const evidenceVerificationValidators = [
  param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'),
  body('payer_email').isEmail().withMessage('payer_email must be a valid email address').normalizeEmail(),
  body('payer_name').optional().isLength({ max: 255 }).withMessage('payer_name cannot exceed 255 characters'),
];

module.exports = {
  grantLawyerAccessValidators,
  withdrawalCreateValidators,
  withdrawalQueryValidators,
  withdrawalSummaryValidators,
  commissionRatesSetValidators,
  commissionRatesGetValidators,
  evidenceVerificationValidators,
};
