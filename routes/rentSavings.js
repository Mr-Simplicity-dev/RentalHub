const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { authenticate, isTenant, requireAdminOrSuperAdmin } = require('../config/middleware/auth');
const rentSavingsController = require('../controllers/rentSavingsController');
const validateRequest = require('../config/middleware/validateRequest');

// ============================================================
// RENT SAVINGS ROUTES
// Base path (registered in app.js): /api/rent-savings
// ============================================================


// ════════════════════════════════════════════════════════════
// ADMIN ROUTES  (defined first to avoid :id wildcard conflicts)
// ════════════════════════════════════════════════════════════

// Dashboard stats — totals across all plans, revenue, contributions
router.get(
  '/admin/stats',
  authenticate, requireAdminOrSuperAdmin,
  rentSavingsController.adminGetStats
);

// All plans (filterable by status, tenant_id, property_id, page, limit)
router.get(
  '/admin/plans',
  authenticate, requireAdminOrSuperAdmin,
  rentSavingsController.adminGetAllPlans
);

// Force-cancel a specific plan
router.patch(
  '/admin/plans/:id/cancel',
  authenticate, requireAdminOrSuperAdmin,
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 2000 })],
  validateRequest,
  rentSavingsController.adminCancelPlan
);

// All contributions across all tenants (filterable by plan_id, tenant_id, month)
router.get(
  '/admin/contributions',
  authenticate, requireAdminOrSuperAdmin,
  rentSavingsController.adminGetAllContributions
);

// Revenue ledger — all platform fees (setup_fee, monthly_1pct, maturity_2pct, early_withdrawal_5pct)
router.get(
  '/admin/revenue',
  authenticate, requireAdminOrSuperAdmin,
  rentSavingsController.adminGetRevenueLedger
);

// All early withdrawal requests (filterable by status: pending | approved | rejected)
router.get(
  '/admin/early-withdrawal-requests',
  authenticate, requireAdminOrSuperAdmin,
  rentSavingsController.adminGetEarlyWithdrawalRequests
);

// Approve a pending early withdrawal
router.patch(
  '/admin/early-withdrawal-requests/:id/approve',
  authenticate, requireAdminOrSuperAdmin,
  [param('id').isInt(), body('note').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  rentSavingsController.adminApproveEarlyWithdrawal
);

// Reject a pending early withdrawal
router.patch(
  '/admin/early-withdrawal-requests/:id/reject',
  authenticate, requireAdminOrSuperAdmin,
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  rentSavingsController.adminRejectEarlyWithdrawal
);

// All location-based setup fees
router.get(
  '/admin/setup-fees',
  authenticate, requireAdminOrSuperAdmin,
  rentSavingsController.adminGetSetupFees
);

// Create or update a location-based setup fee (upserts by state_id + lga_id)
router.post(
  '/admin/setup-fees',
  authenticate, requireAdminOrSuperAdmin,
  [body('state_id').isInt(), body('lga_id').isInt(), body('amount').isFloat({ min: 0 })],
  validateRequest,
  rentSavingsController.adminCreateSetupFee
);

// Delete a setup fee record by ID
router.delete(
  '/admin/setup-fees/:id',
  authenticate, requireAdminOrSuperAdmin,
  [param('id').isInt()],
  validateRequest,
  rentSavingsController.adminDeleteSetupFee
);


// ════════════════════════════════════════════════════════════
// TENANT ROUTES
// ════════════════════════════════════════════════════════════

// Public — no auth required (returns location-based fee or default ₦2000)
// NOTE: keep this free of sensitive data; it is intentionally unauthenticated
router.get('/setup-fees', rentSavingsController.getSetupFees);

// Tenant savings summary — total plans, total saved, upcoming due dates, fees charged
router.get(
  '/summary',
  authenticate, isTenant,
  rentSavingsController.getMySavingsSummary
);

// Tenant's own early withdrawal requests (read their own status)
router.get(
  '/early-withdrawal-requests',
  authenticate, isTenant,
  rentSavingsController.getMyEarlyWithdrawalRequests
);

// ── PLAN CRUD ──────────────────────────────────────────────

// List all plans for the authenticated tenant
router.get(
  '/plans',
  authenticate, isTenant,
  rentSavingsController.getMyPlans
);

// Create a new savings plan (charges setup fee from wallet if applicable)
router.post(
  '/plans',
  authenticate, isTenant,
  [body('property_id').isInt(), body('target_amount').isFloat({ min: 0 }), body('duration_months').optional().isInt({ min: 1 })],
  validateRequest,
  rentSavingsController.createPlan
);

// Get full plan details — includes contributions, early withdrawals, and fees charged
router.get(
  '/plans/:id',
  authenticate, isTenant,
  rentSavingsController.getPlanDetails
);

// Pause or resume a plan (toggle is_active); cannot toggle completed/cancelled plans
router.patch(
  '/plans/:id/toggle',
  authenticate, isTenant,
  [param('id').isInt()],
  validateRequest,
  rentSavingsController.togglePlan
);

// ── CONTRIBUTIONS ──────────────────────────────────────────

// List all contributions for a specific plan (tenant-scoped)
router.get(
  '/plans/:id/contributions',
  authenticate, isTenant,
  rentSavingsController.getPlanContributions
);

// Make a monthly contribution (deducts from wallet, applies 1% fee)
router.post(
  '/plans/:id/contributions',
  authenticate, isTenant,
  [param('id').isInt(), body('amount').optional().isFloat({ min: 0 })],
  validateRequest,
  rentSavingsController.makeContribution
);

// Get months that have been missed since plan creation
router.get(
  '/plans/:id/missed-months',
  authenticate, isTenant,
  rentSavingsController.getMissedMonths
);

// ── WITHDRAWALS ────────────────────────────────────────────

// Withdraw at maturity — available from 7 days before rent_due_date (applies 2% fee)
router.post(
  '/plans/:id/withdraw-maturity',
  authenticate, isTenant,
  [param('id').isInt()],
  validateRequest,
  rentSavingsController.withdrawAtMaturity
);

// Request early withdrawal — creates pending request for admin review (5.8% penalty on approval)
router.post(
  '/plans/:id/withdraw-early',
  authenticate, isTenant,
  [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 2000 })],
  validateRequest,
  rentSavingsController.requestEarlyWithdrawal
);


module.exports = router;