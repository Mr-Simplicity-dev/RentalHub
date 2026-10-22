const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const bankTransferController = require('../controllers/bankTransferController');
const { authenticate, requireSuperAdmin } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

const accountValidators = [
  body('bank_name').isString().trim().isLength({ min: 2, max: 100 }),
  body('account_name').isString().trim().isLength({ min: 2, max: 150 }),
  body('account_number').isString().trim().isLength({ min: 6, max: 30 }),
  body('sort_code').optional({ nullable: true }).isString().trim().isLength({ max: 10 }),
  body('instructions').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body('is_active').optional().isBoolean(),
  body('sort_order').optional().isInt(),
];

router.get('/accounts', authenticate, requireSuperAdmin, bankTransferController.listAccounts);
router.post(
  '/accounts',
  authenticate,
  requireSuperAdmin,
  accountValidators,
  validateRequest,
  bankTransferController.createAccount
);
router.patch(
  '/accounts/:id',
  authenticate,
  requireSuperAdmin,
  [
    param('id').isInt({ min: 1 }),
    body('bank_name').optional().isString().trim().isLength({ min: 2, max: 100 }),
    body('account_name').optional().isString().trim().isLength({ min: 2, max: 150 }),
    body('account_number').optional().isString().trim().isLength({ min: 6, max: 30 }),
    body('sort_code').optional({ nullable: true }).isString().trim().isLength({ max: 10 }),
    body('instructions').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
    body('is_active').optional().isBoolean(),
    body('sort_order').optional().isInt(),
  ],
  validateRequest,
  bankTransferController.updateAccount
);
router.delete(
  '/accounts/:id',
  authenticate,
  requireSuperAdmin,
  [param('id').isInt({ min: 1 })],
  validateRequest,
  bankTransferController.deleteAccount
);

router.get('/transfers', authenticate, requireSuperAdmin, bankTransferController.listTransfers);
router.get(
  '/transfers/:id/proof',
  authenticate,
  requireSuperAdmin,
  [param('id').isInt({ min: 1 })],
  validateRequest,
  bankTransferController.getTransferProof
);
router.post(
  '/transfers/:id/approve',
  authenticate,
  requireSuperAdmin,
  [
    param('id').isInt({ min: 1 }),
    body('amount_received').isFloat({ gt: 0 }),
    body('note').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
  ],
  validateRequest,
  bankTransferController.approveTransfer
);
router.post(
  '/transfers/:id/reject',
  authenticate,
  requireSuperAdmin,
  [
    param('id').isInt({ min: 1 }),
    body('note').isString().trim().isLength({ min: 3, max: 1000 }),
  ],
  validateRequest,
  bankTransferController.rejectTransfer
);

module.exports = router;
