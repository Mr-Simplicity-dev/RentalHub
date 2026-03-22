const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const paymentController = require('../controllers/paymentController');
const refundController  = require('../controllers/refundController');
const { authenticate, isTenant, isLandlord, isVerified } = require('../config/middleware/auth');

// ============ TENANT SUBSCRIPTION PAYMENTS ============

// Get subscription plans
router.get('/subscription-plans', paymentController.getSubscriptionPlans);

// Initialize tenant subscription payment
router.post('/subscribe',
  authenticate,
  isTenant,
  isVerified,
  [
    body('plan_id').notEmpty(),
    body('payment_method').isIn(['paystack', 'bank_transfer'])
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
  isTenant,
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

// ============ PAYMENT HISTORY ============

// Get user payment history
router.get('/history', authenticate, paymentController.getPaymentHistory);

// Get specific payment details
router.get('/:paymentId', authenticate, paymentController.getPaymentDetails);

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
  refundController.adminGetAllRefundRequests
);

module.exports = router;