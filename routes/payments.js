const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const paymentController = require('../controllers/paymentController');
const refundController  = require('../controllers/refundController');
const landlordPropertyFeeController = require('../controllers/landlordPropertyFeeController');
const { authenticate, isTenant, isLandlord, isVerified } = require('../config/middleware/auth');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdminOrSuperAdmin');
const { criticalFinanceOpsLimiter } = require('../config/middleware/securityRateLimiters');

// ============ TENANT SUBSCRIPTION PAYMENTS ============

// Get subscription plans
router.get('/subscription-plans', paymentController.getSubscriptionPlans);

// Get current tenant/landlord monthly subscription quote
router.get('/subscription-quote',
  authenticate,
  paymentController.getSubscriptionQuote
);

// Activate tenant/landlord monthly subscription from internal balances
router.post('/subscribe',
  authenticate,
  isVerified,
  [
    body('plan_id').optional({ checkFalsy: true }).trim(),
    body('subscription_type').optional({ checkFalsy: true }).isIn(['monthly', 'multiple_property']),
  ],
  paymentController.initializeSubscription
);

// Verify tenant subscription payment
router.get('/verify-subscription/:reference', 
  authenticate, 
  paymentController.verifySubscription
);

// Check subscription status
router.get('/subscription-status', 
  authenticate, 
  paymentController.getSubscriptionStatus
);

// Initialize one-time property detail unlock payment
router.post(
  '/unlock-property',
  authenticate,
  isTenant,
  isVerified,
  [
    body('property_id').isInt().withMessage('property_id is required'),
    body('payment_method')
      .isIn(['paystack', 'bank_transfer'])
      .withMessage('payment_method must be paystack or bank_transfer'),
  ],
  paymentController.initializePropertyUnlock
);

// Verify one-time property detail unlock payment
router.get(
  '/verify-unlock/:reference',
  authenticate,
  isTenant,
  paymentController.verifyPropertyUnlock
);

// Check if a tenant has unlocked a property
router.get(
  '/unlock-status/:propertyId',
  authenticate,
  isTenant,
  paymentController.getPropertyUnlockStatus
);

// List all unlocked/subscribed properties for the current tenant
router.get(
  '/my-unlocked-properties',
  authenticate,
  isTenant,
  paymentController.getMyUnlockedProperties
);

// Paid access for tenants who want to browse properties outside their registered state/LGA
router.get(
  '/location-access/quote',
  authenticate,
  isTenant,
  paymentController.getTenantLocationAccessQuote
);

router.post(
  '/location-access',
  authenticate,
  isTenant,
  isVerified,
  [
    body('state_id').isInt({ min: 1 }).withMessage('state_id is required'),
    body('lga_name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 120 }),
    body('payment_method').optional({ checkFalsy: true }).isIn(['paystack']),
  ],
  paymentController.initializeTenantLocationAccess
);

router.get(
  '/location-access/verify/:reference',
  authenticate,
  isTenant,
  paymentController.verifyTenantLocationAccess
);

// ============ LANDLORD LISTING PAYMENTS ============

// Get listing plans
router.get('/listing-plans', paymentController.getListingPlans);

// Initialize property listing payment
router.post('/pay-listing',
  authenticate,
  isLandlord,
  isVerified,
  [
    body('plan_id').notEmpty(),
    body('property_id').optional().isInt(),
    body('payment_method').isIn(['paystack', 'bank_transfer'])
  ],
  paymentController.initializeListingPayment
);

// Verify listing payment
router.get('/verify-listing/:reference',
  authenticate,
  paymentController.verifyListingPayment
);

// ============ RENT PAYMENTS (OPTIONAL) ============

// Initialize rent payment
router.post('/pay-rent',
  authenticate,
  isTenant,
  [
    body('property_id').isInt(),
    body('amount').isFloat({ min: 0 }),
    body('payment_method').isIn(['paystack', 'bank_transfer'])
  ],
  paymentController.initializeRentPayment
);

// Verify rent payment
router.get('/verify-rent/:reference',
  authenticate,
  paymentController.verifyRentPayment
);

// ============ LANDLORD PROPERTY BILLING ============

router.get('/landlord-property-fee/status',
  authenticate,
  isLandlord,
  landlordPropertyFeeController.getStatus
);

router.post('/landlord-property-fee/skip',
  authenticate,
  isLandlord,
  landlordPropertyFeeController.skipNotice
);

router.post('/landlord-property-fee/agree',
  authenticate,
  isLandlord,
  landlordPropertyFeeController.agreeAndSettle
);

// ============ PAYMENT HISTORY ============

// Get user payment history
router.get('/history', authenticate, paymentController.getPaymentHistory);

// ============ PROPERTY INSPECTION FEE ============

router.get(
  '/inspection/eligible',
  authenticate,
  isTenant,
  paymentController.getPropertyInspectionOptions
);

router.post(
  '/inspection/initialize',
  authenticate,
  isTenant,
  isVerified,
  [
    body('application_id').isInt({ min: 1 }).withMessage('application_id is required'),
    body('tenant_note').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
  ],
  paymentController.initializePropertyInspectionPayment
);

router.get(
  '/inspection/verify/:reference',
  authenticate,
  isTenant,
  paymentController.verifyPropertyInspectionPayment
);

// ============ BANK ACCOUNT VERIFICATION ============

// Get list of Nigerian banks (cached)
router.get('/banks',
  authenticate,
  paymentController.getBanks
);

// Force refresh bank cache (admin only)
router.post('/banks/refresh',
  authenticate,
  requireAdminOrSuperAdmin,
  criticalFinanceOpsLimiter,
  paymentController.refreshBankCache
);

// Verify bank account for withdrawals
router.post('/verify-account',
  authenticate,
  isVerified,
  criticalFinanceOpsLimiter,
  [
    body('bank_code').optional({ checkFalsy: true }).trim().isLength({ min: 2 }).withMessage('Bank code is invalid'),
    body('bank_name').optional({ checkFalsy: true }).trim().isLength({ min: 2 }).withMessage('Bank name is invalid'),
    body('account_number').isLength({ min: 10, max: 10 }).withMessage('Account number must be 10 digits')
  ],
  paymentController.verifyBankAccount
);

// Get specific payment details
router.get('/:paymentId', authenticate, paymentController.getPaymentDetails);

// Retry a pending payment (create a fresh Paystack transaction for it)
router.post('/retry/:paymentId',
  authenticate,
  paymentController.retryPayment
);

// ============ WEBHOOKS ============

// Paystack webhook
router.post('/webhook/paystack', paymentController.paystackWebhook);


// ============ REFUND REQUESTS ============

// Tenant: submit a refund request on a completed rent payment
router.post('/refund/request',
  authenticate,
  isTenant,
  refundController.submitRefundRequest
);

// Tenant: list completed rent payments eligible for a refund
router.get('/refund/eligible',
  authenticate,
  isTenant,
  refundController.getEligibleRentPayments
);

// Tenant: view all their own refund requests
router.get('/refund/my-requests',
  authenticate,
  isTenant,
  refundController.getTenantRefundRequests
);

// Landlord: view refund requests on their properties
router.get('/refund/landlord',
  authenticate,
  isLandlord,
  refundController.getLandlordRefundRequests
);

// Landlord: approve a refund request
router.put('/refund/:refundId/approve',
  authenticate,
  isLandlord,
  criticalFinanceOpsLimiter,
  refundController.approveRefundRequest
);

// Landlord: reject a refund request
router.put('/refund/:refundId/reject',
  authenticate,
  isLandlord,
  refundController.rejectRefundRequest
);

// Admin: view all refund requests across the platform
router.get('/refund/admin/all',
  authenticate,
  requireAdminOrSuperAdmin,
  refundController.adminGetAllRefundRequests
);

router.put('/refund/admin/:refundId/review',
  authenticate,
  requireAdminOrSuperAdmin,
  criticalFinanceOpsLimiter,
  refundController.adminReviewRelocationRefund
);

// Tenant: expired rent grace period requests
router.get('/tenancy-adjustments/grace/eligible',
  authenticate,
  isTenant,
  refundController.getEligibleGracePeriodPayments
);

router.post('/tenancy-adjustments/grace/request',
  authenticate,
  isTenant,
  refundController.submitGracePeriodRequest
);

router.get('/tenancy-adjustments/grace/my-requests',
  authenticate,
  isTenant,
  refundController.getTenantGracePeriodRequests
);

// Landlord: review hierarchy-admin-enabled tenant grace period requests
router.get('/tenancy-adjustments/grace/landlord',
  authenticate,
  isLandlord,
  refundController.getLandlordGracePeriodRequests
);

router.put('/tenancy-adjustments/grace/:requestId/respond',
  authenticate,
  isLandlord,
  refundController.respondGracePeriodRequest
);

// LGA/state/super admin/support hierarchy: enable or reject tenant-requested grace periods
router.get('/tenancy-adjustments/admin',
  authenticate,
  requireAdminOrSuperAdmin,
  refundController.adminGetTenancyAdjustmentRequests
);

router.put('/tenancy-adjustments/admin/:requestId/review',
  authenticate,
  requireAdminOrSuperAdmin,
  refundController.adminReviewTenancyAdjustmentRequest
);

// ============ WALLET FUNDING (PAYSTACK) ============

// Both tenant and landlord: initialize wallet top-up via Paystack
router.post('/wallet/fund',
  authenticate,
  criticalFinanceOpsLimiter,
  [
    body('amount').isFloat({ min: 100 }).withMessage('Amount must be at least ₦100'),
  ],
  validateRequest,
  paymentController.initializeWalletFunding
);

// Both tenant and landlord: verify wallet top-up after Paystack redirect
router.get('/wallet/fund/verify/:reference',
  authenticate,
  paymentController.verifyWalletFunding
);

// ============ WALLET & WITHDRAWALS ============

// Tenant + Landlord: downloadable PDF receipt (handles combined line items)
router.get('/receipt-pdf/:paymentId',
  authenticate,
  async (req, res) => {
    try {
      const PDFDocument = require('pdfkit');
      const {
        loadReceiptContext,
        buildReceiptData,
      } = require('../config/utils/paymentReceipt');

      const paymentId = Number.parseInt(req.params.paymentId, 10);
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid payment id' });
      }

      const ctx = await loadReceiptContext(paymentId);
      if (!ctx) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }
      if (Number(ctx.payment.user_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const receipt = buildReceiptData(ctx);

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="receipt-${String(paymentId).padStart(6, '0')}.pdf"`
      );
      doc.pipe(res);

      doc.fontSize(20).text('RentalHub NG', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor('#64748b').text('Official Payment Receipt', { align: 'center' });
      doc.fontSize(11).fillColor('#0f172a').text(receipt.receiptNumber, { align: 'center' });
      doc.moveDown();

      doc.fontSize(10).fillColor('#334155');
      doc.text(`Payer: ${receipt.fullName || receipt.email}`);
      doc.text(`Date: ${receipt.date}`);
      doc.text(`Reference: ${receipt.reference}`);
      doc.text(`Status: ${receipt.status}`);
      doc.text(`Method: ${receipt.method}`);
      doc.moveDown();

      const tableTop = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Item', 50, tableTop);
      doc.text('Amount', 400, tableTop, { width: 150, align: 'right' });
      doc.moveTo(50, tableTop + 16).lineTo(545, tableTop + 16).strokeColor('#e2e8f0').stroke();

      let y = tableTop + 26;
      doc.font('Helvetica');
      receipt.items.forEach((item) => {
        doc.fillColor('#334155').text(item.label, 50, y, { width: 330 });
        doc.text(item.amount, 400, y, { width: 150, align: 'right' });
        y += 22;
      });

      doc.moveTo(50, y).lineTo(545, y).strokeColor('#e2e8f0').stroke();
      doc.moveDown();
      doc.font('Helvetica-Bold');
      doc.fillColor('#0f172a').text('Total Paid', 50, doc.y);
      doc.text(receipt.total, 400, doc.y - 14, { width: 150, align: 'right' });
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#94a3b8').text('Thank you for using RentalHub NG.', { align: 'center' });

      doc.end();
    } catch (error) {
      req.logger.error('Receipt PDF error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to generate receipt PDF' });
      }
    }
  }
);

// Tenant: get wallet balance (approved refunds waiting to be withdrawn)
router.get('/wallet/balance',
  authenticate,
  isTenant,
  refundController.getWalletBalance
);

// Landlord: get cleared funds balance (rent after 14 working days)
router.get('/wallet/landlord-balance',
  authenticate,
  isLandlord,
  refundController.getLandlordWalletBalance
);

// Tenant + Landlord: full wallet transaction history (funding, rent credits,
// refunds, withdrawals) with optional payment_id filter for receipt detail.
router.get('/wallet/transactions',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const paymentId = req.query.payment_id
        ? Number.parseInt(req.query.payment_id, 10)
        : null;
      const params = [userId, limit];
      let paymentFilter = '';
      if (Number.isInteger(paymentId) && paymentId > 0) {
        params.push(paymentId);
        paymentFilter = ' AND wt.payment_id = $3';
      }
      const result = await db.query(
        `SELECT wt.id, wt.payment_id, wt.amount, wt.type, wt.status, wt.source,
                wt.description, wt.reference, wt.available_at, wt.cleared_at,
                wt.metadata, wt.created_at,
                p.transaction_reference
         FROM wallet_transactions wt
         LEFT JOIN payments p ON p.id = wt.payment_id
         WHERE wt.user_id = $1${paymentFilter}
         ORDER BY wt.created_at DESC, wt.id DESC
         LIMIT $2`,
        params
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      req.logger.error('Get wallet transactions error:', error);
      res.status(500).json({ success: false, message: 'Failed to load wallet transactions' });
    }
  }
);

// Tenant + Landlord: request a withdrawal to bank account
router.post('/wallet/withdraw',
  authenticate,
  criticalFinanceOpsLimiter,
  [
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than zero'),
    body('bank_name').isString().trim().notEmpty().withMessage('Bank name is required'),
    body('account_number').isString().trim().isLength({ min: 10, max: 10 }).withMessage('Account number must be 10 digits'),
    body('account_name').isString().trim().notEmpty().withMessage('Account name is required'),
    body('bank_code').optional().isString().trim(),
  ],
  validateRequest,
  refundController.requestWithdrawal
);

// Tenant + Landlord: view their withdrawal history
router.get('/wallet/withdrawals',
  authenticate,
  refundController.getMyWithdrawals
);

// Admin approvals for wallet withdrawals
router.get('/wallet/withdrawals/pending',
  authenticate,
  requireAdminOrSuperAdmin,
  refundController.getPendingWalletWithdrawals
);

router.post('/wallet/withdrawals/:withdrawalId/approve',
  authenticate,
  requireAdminOrSuperAdmin,
  criticalFinanceOpsLimiter,
  refundController.approveWalletWithdrawal
);

router.post('/wallet/withdrawals/:withdrawalId/reject',
  authenticate,
  requireAdminOrSuperAdmin,
  criticalFinanceOpsLimiter,
  refundController.rejectWalletWithdrawal
);

module.exports = router;
