const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { roleIn } = require('../config/utils/roleHierarchy');
const rentCalculatorController = require('../controllers/rentCalculatorController');
const validateRequest = require('../config/middleware/validateRequest');

// ============================================================
// RENT CALCULATOR ROUTES
// Base path (registered in server.js): /api/rent-calculator
// ============================================================

const FEE_ADMIN_ROLES = [
  'super_admin',
  'super_financial_admin',
  'financial_admin',
  'state_admin',
  'state_financial_admin',
  'lga_financial_admin',
];

const requireFeeAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (!roleIn(req.user.user_type, FEE_ADMIN_ROLES)) {
    return res.status(403).json({ success: false, message: 'Access denied. Finance admin roles only.' });
  }
  next();
};

// ════════════════════════════════════════════════════════════
// PUBLIC ROUTES (intentionally unauthenticated)
// ════════════════════════════════════════════════════════════

// Resolve the active fee configuration for a location (global fallback)
router.get(
  '/fees',
  [
    query('state_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
    query('lga_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
  ],
  validateRequest,
  rentCalculatorController.getFees
);

// Compute a full monthly / move-in estimate
router.post(
  '/estimate',
  [
    body('rent_amount').isFloat({ min: 1 }),
    body('payment_frequency').isIn(['yearly', 'monthly']),
    body('upfront_months').optional({ values: 'falsy' }).isInt({ min: 1, max: 120 }),
    body('state_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
    body('lga_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
    body('monthly_income').optional({ values: 'falsy' }).isFloat({ min: 0 }),
    body('ratio_pct').optional({ values: 'falsy' }).isFloat({ min: 1, max: 100 }),
    body('months_to_goal').optional({ values: 'falsy' }).isInt({ min: 1, max: 120 }),
  ],
  validateRequest,
  rentCalculatorController.estimate
);

// ════════════════════════════════════════════════════════════
// ADMIN ROUTES (scoped by finance hierarchy)
// ════════════════════════════════════════════════════════════

// List fee records the actor may see/manage within their scope
router.get(
  '/admin/fees',
  authenticate,
  requireFeeAdmin,
  rentCalculatorController.adminGetFees
);

// Create or update a fee record (upsert by scope; enforced in service)
router.post(
  '/admin/fees',
  authenticate,
  requireFeeAdmin,
  [
    body('state_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
    body('lga_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
    body('agent_fee_pct').isFloat({ min: 0, max: 100 }),
    body('legal_fee_pct').isFloat({ min: 0, max: 100 }),
    body('caution_months').isFloat({ min: 0 }),
    body('agreement_fee').isFloat({ min: 0 }),
    body('service_charge').isFloat({ min: 0 }),
    body('governance_note').optional().isString().trim(),
  ],
  validateRequest,
  rentCalculatorController.adminCreateFee
);

// Delete a fee record (only within the actor's scope)
router.delete(
  '/admin/fees/:id',
  authenticate,
  requireFeeAdmin,
  [
    param('id').isInt(),
    body('governance_note').optional().isString().trim(),
    body('reason').optional().isString().trim(),
  ],
  validateRequest,
  rentCalculatorController.adminDeleteFee
);

module.exports = router;
