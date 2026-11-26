const express = require('express');
const router = express.Router();
const path = require('path');
const { body, param } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const paymentController = require('../controllers/paymentController');
const refundController  = require('../controllers/refundController');
const landlordPropertyFeeController = require('../controllers/landlordPropertyFeeController');
const receiptController = require('../controllers/receiptController');
const { authenticate, isTenant, isLandlord, isVerified, requireNotImpersonating } = require('../config/middleware/auth');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdminOrSuperAdmin');
const { criticalFinanceOpsLimiter } = require('../config/middleware/securityRateLimiters');
const audit = require('../config/middleware/auditMiddleware');
const db = require('../config/middleware/database');
const { releaseEscrowForPayment } = require('../services/walletLedgerService');
const { savingsReceiptNumber, buildReference } = require('../config/utils/referenceGenerator');
const { RECEIPT_NOTICE, formatNigerianDateTime } = require('../config/utils/receiptFormat');
const { registerMoneyFont } = require('../config/utils/pdfMoneyFont');

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
    body('payment_method').isIn(['paystack', 'bank_transfer']),
    body('consent').custom((value) => value === true || value === 'true').withMessage('You must confirm the rent payment to continue')
  ],
  validateRequest,
  audit('payment.rent_initiate', 'payment'),
  paymentController.initializeRentPayment
);

// Verify rent payment
router.get('/verify-rent/:reference',
  authenticate,
  audit('payment.rent_verify', 'payment'),
  paymentController.verifyRentPayment
);

// Escrow: tenant confirms satisfaction → release the held rent credit early.
router.post('/rent/:paymentId/confirm-satisfaction',
  authenticate,
  isTenant,
  [param('paymentId').isInt({ min: 1 })],
  validateRequest,
  async (req, res) => {
    try {
      const paymentResult = await db.query(
        `SELECT id, user_id, payment_type FROM payments
         WHERE id = $1 AND payment_type = 'rent_payment' AND payment_status = 'completed'`,
        [req.params.paymentId]
      );
      const payment = paymentResult.rows[0];
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Completed rent payment not found' });
      }
      if (Number(payment.user_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Only the tenant can confirm this rent payment' });
      }

      const result = await releaseEscrowForPayment({ paymentId: payment.id });
      return res.json({
        success: true,
        message: 'Rental confirmed. Funds released to the landlord.',
        data: result,
      });
    } catch (error) {
      req.logger.error('Confirm rent satisfaction error:', error);
      res.status(500).json({ success: false, message: 'Failed to confirm rental' });
    }
  }
);

// ============ PAY RENT ON BEHALF (OPTION 2) ============
// Tenant A generates a one-time link; another tenant or a landlord (e.g. a
// parent) pays A's rent. Payment is credited to A; payer is recorded.

router.post('/request-rent-payment',
  authenticate,
  isTenant,
  [body('property_id').isInt()],
  validateRequest,
  audit('payment.rent_request', 'rent_payment_request'),
  paymentController.createRentPaymentRequest
);

router.get('/rent-request/:token',
  authenticate,
  paymentController.getRentPaymentRequest
);

// Properties a tenant may request rent help on (paid before OR landlord-approved).
router.get('/rent-help/eligible',
  authenticate,
  isTenant,
  paymentController.getRentHelpEligibleProperties
);

router.post('/pay-rent-on-behalf/:token',
  authenticate,
  [
    body('payment_method').isIn(['paystack', 'bank_transfer']),
    body('beneficiary_confirm').custom((value) => value === true || value === 'true').withMessage('You must confirm the person you are paying for')
  ],
  validateRequest,
  audit('payment.rent_on_behalf', 'payment'),
  paymentController.initializeHelpRentPayment
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

// Sweep every bank for one account number. A NUBAN is unique per bank, so the same
// number can be real at several fintechs at once — this returns all the matches and
// lets the person choose, instead of guessing one bank and failing.
router.post('/resolve-account',
  authenticate,
  isVerified,
  criticalFinanceOpsLimiter,
  [
    body('account_number').isLength({ min: 10, max: 10 }).withMessage('Account number must be 10 digits')
  ],
  paymentController.resolveAccountAcrossBanks
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

// Canonical platform-wide financial documents (JSON + PDF) for all roles
router.get('/receipts/:kind/:id', authenticate, receiptController.getDocumentJson);
router.get('/receipts/:kind/:id/pdf', authenticate, receiptController.getDocumentPdf);

// Landlord rent-received confirmation records (scoped strictly to landlord's properties)
router.get('/landlord/rent-receipts', authenticate, isLandlord, receiptController.getLandlordRentReceipts);

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

// Shared payment receipt data (JSON) — delegates to canonical receiptController
router.get('/receipt/:paymentId',
  authenticate,
  receiptController.getPaymentReceiptJson
);

// Downloadable PDF payment receipt — delegates to canonical receiptController
router.get('/receipt-pdf/:paymentId',
  authenticate,
  receiptController.getPaymentReceiptPdf
);

// Downloadable PDF receipt for a rent savings contribution — delegates to canonical receiptController
router.get('/savings-receipt.pdf',
  authenticate,
  receiptController.getSavingsReceiptPdf
);

// Admin/agent commission earnings statement as PDF
router.get('/commission-statement.pdf',
  authenticate,
  async (req, res) => {
    try {
      const PDFDocument = require('pdfkit');
      const { humanizePaymentType } = require('../config/utils/paymentReceipt');

      const userId = req.user.id;
      const role = String(req.user.user_type || '').toLowerCase();
      const isAgent = ['agent', 'landlord_agent'].includes(role);
      const isMarketingAgent = role === 'marketing_agent';
      const isAdminEarner = [
        'super_admin', 'admin', 'lga_admin', 'state_admin',
        'financial_admin', 'lga_financial_admin', 'state_financial_admin',
        'super_financial_admin',
      ].includes(role);

      let items = [];
      let totals = { earned: 0, pending: 0, paid: 0 };

      if (isAdminEarner) {
        const result = await db.query(
          `SELECT source, amount, commission_rate, status, created_at
           FROM admin_commissions
           WHERE admin_id = $1
           ORDER BY created_at DESC
           LIMIT 500`,
          [userId]
        );
        items = result.rows.map((c) => ({
          label: humanizePaymentType(c.source || 'commission'),
          amount: Number(c.amount || 0),
          status: c.status,
          date: c.created_at,
          meta: c.commission_rate != null ? `${(Number(c.commission_rate) * 100).toFixed(1)}%` : '',
        }));
      } else if (isAgent) {
        const result = await db.query(
          `SELECT source, amount, status, payment_status, created_at
           FROM agent_commission_ledger
           WHERE agent_user_id = $1
           ORDER BY created_at DESC
           LIMIT 500`,
          [userId]
        );
        items = result.rows.map((c) => ({
          label: humanizePaymentType(c.source || 'commission'),
          amount: Number(c.amount || 0),
          status: c.payment_status === 'paid' ? 'paid' : c.status,
          date: c.created_at,
          meta: '',
        }));
      } else if (isMarketingAgent) {
        const result = await db.query(
          `SELECT stage AS source, amount, status, created_at
           FROM marketing_agent_commissions
           WHERE agent_user_id = $1
           ORDER BY created_at DESC
           LIMIT 500`,
          [userId]
        );
        items = result.rows.map((c) => ({
          label: humanizePaymentType(c.source || 'marketing_commission'),
          amount: Number(c.amount || 0),
          status: c.status || 'paid',
          date: c.created_at,
          meta: 'Marketing',
        }));
      }

      if (!isAdminEarner && !isAgent && !isMarketingAgent) {
        return res.status(403).json({ success: false, message: 'No commission statement available for this account' });
      }

      items.forEach((item) => {
        if (item.status === 'paid') totals.paid += item.amount;
        else if (item.status === 'pending' || item.status === 'earned' || item.status === 'verified' || item.status === 'unpaid') totals.pending += item.amount;
        else totals.earned += item.amount;
      });

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="commission-statement-${userId}.pdf"`);
      doc.pipe(res);

      const moneyFont = registerMoneyFont(doc);

      doc.fontSize(20).text('Amana RentalHub NG', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor('#64748b').text('Commission Earnings Statement', { align: 'center' });
      doc.fontSize(10).fillColor('#0f172a').text(req.user.full_name || req.user.email, { align: 'center' });
      doc.moveDown();

      doc.fontSize(10).fillColor('#334155');
      doc.text(`Generated: ${new Date().toLocaleString('en-NG')}`);
      doc.text(`Role: ${role}`);
      doc.moveDown();

      doc.font(moneyFont).fontSize(10).fillColor('#0f172a');
      doc.text(`Total Earned: ₦${totals.earned.toLocaleString()}`);
      doc.text(`Total Pending: ₦${totals.pending.toLocaleString()}`);
      doc.text(`Total Paid: ₦${totals.paid.toLocaleString()}`);
      doc.font('Helvetica').moveDown();

      const tableTop = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Source', 50, tableTop);
      doc.text('Rate', 220, tableTop);
      doc.text('Status', 320, tableTop);
      doc.text('Date', 400, tableTop, { width: 145, align: 'right' });
      doc.text('Amount', 430, tableTop, { width: 115, align: 'right' });
      doc.moveTo(50, tableTop + 16).lineTo(545, tableTop + 16).strokeColor('#e2e8f0').stroke();

      let y = tableTop + 26;
      doc.font('Helvetica').fontSize(9);
      items.forEach((item) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.font('Helvetica').fillColor('#334155').text(item.label, 50, y, { width: 165 });
        doc.text(item.meta || '', 220, y, { width: 90 });
        doc.text(String(item.status || ''), 320, y, { width: 70 });
        doc.text(new Date(item.date).toLocaleDateString('en-NG'), 400, y, { width: 25, align: 'right' });
        doc.font(moneyFont).text(`₦${item.amount.toLocaleString()}`, 430, y, { width: 115, align: 'right' });
        y += 18;
      });

      doc.moveTo(50, y).lineTo(545, y).strokeColor('#e2e8f0').stroke();
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
      doc.text('Statement Total', 50, doc.y);
      doc.font(moneyFont).text(`₦${(totals.earned + totals.pending + totals.paid).toLocaleString()}`, 430, doc.y - 14, { width: 115, align: 'right' });
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#94a3b8').text('Thank you for using Amana RentalHub NG.', { align: 'center' });

      doc.end();
    } catch (error) {
      req.logger.error('Commission statement PDF error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to generate commission statement' });
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
  requireNotImpersonating,
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
