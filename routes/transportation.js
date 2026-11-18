const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const transportationController = require('../controllers/transportationController');
const { authenticate, isTenant, isVerified } = require('../config/middleware/auth');

// ============ TRANSPORTATION SERVICES ============

// Get all available transportation services
router.get('/services',
  authenticate,
  transportationController.getAvailableServices
);

// Get service details by ID
router.get('/services/:serviceId',
  authenticate,
  transportationController.getServiceDetails
);

// Calculate price for transportation
router.post('/calculate-price',
  authenticate,
  isTenant,
  [
    body('serviceId').isInt().withMessage('Service ID is required'),
    body('distanceKm').isFloat({ min: 0 }).withMessage('Distance must be a positive number')
  ],
  transportationController.calculateBookingPrice
);

// ============ BOOKING ELIGIBILITY ============

// Check if tenant can book transportation for a property
router.get('/eligibility/:propertyId',
  authenticate,
  isTenant,
  transportationController.checkBookingEligibility
);

// ============ TRANSPORTATION BOOKINGS ============

// Create a new transportation booking
router.post('/bookings',
  authenticate,
  isTenant,
  isVerified,
  [
    body('property_id').isInt().withMessage('Property ID is required'),
    body('service_id').isInt().withMessage('Service ID is required'),
    body('pickup_address').notEmpty().withMessage('Pickup address is required'),
    body('destination_address').notEmpty().withMessage('Destination address is required'),
    body('estimated_distance_km').isFloat({ min: 0 }).withMessage('Distance must be a positive number'),
    body('booking_date').isISO8601().withMessage('Valid booking date is required'),
    body('booking_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid booking time is required (HH:MM format)'),
    body('items_description').optional().isString(),
    body('special_requirements').optional().isString()
  ],
  transportationController.createBooking
);

// Get tenant's transportation bookings
router.get('/bookings',
  authenticate,
  isTenant,
  transportationController.getMyBookings
);

// Get booking details by ID
router.get('/bookings/:bookingId',
  authenticate,
  isTenant,
  transportationController.getBookingDetails
);

// Get real-time live vehicle tracking for a booking
router.get('/bookings/:bookingId/tracking',
  authenticate,
  transportationController.getBookingTracking
);

// Customer confirms delivery completion signoff or reports a problem
router.post('/bookings/:bookingId/signoff',
  authenticate,
  isTenant,
  async (req, res) => {
    try {
      const TransportationTrackingService = require('../services/transportationTrackingService');
      const bookingId = Number(req.params.bookingId);
      const {
        satisfied,
        rating,
        feedback,
        note,
        problem_reported,
        problemReported,
        problem_description,
        problemDescription
      } = req.body || {};

      const isProblem = Boolean(problem_reported ?? problemReported) || satisfied === false;
      const result = await TransportationTrackingService.confirmTenantSignoff({
        bookingId,
        tenantUser: req.user,
        satisfied,
        rating,
        feedback: feedback ?? note,
        note,
        problemReported: isProblem,
        problemDescription: problem_description ?? problemDescription
      });

      return res.json({
        success: true,
        data: result,
        message: isProblem ? 'Issue recorded and escalated to support' : 'Delivery receipt confirmed'
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Cancel transportation booking
router.delete('/bookings/:bookingId/cancel',
  authenticate,
  isTenant,
  transportationController.cancelBooking
);

// ============ PAYMENT FOR BOOKINGS ============

// Initialize payment for transportation booking
router.post('/bookings/:bookingId/pay',
  authenticate,
  isTenant,
  [
    body('payment_method').optional().isIn(['paystack', 'bank_transfer']).withMessage('Invalid payment method')
  ],
  transportationController.initializeBookingPayment
);

// Mock payment verification for testing
router.get('/mock-payment/:bookingId',
  authenticate,
  isTenant,
  transportationController.mockPaymentVerification
);

// Verify transportation booking payment
router.get('/verify-payment/:reference',
  authenticate,
  isTenant,
  transportationController.verifyBookingPayment
);

// ============ DASHBOARD STATISTICS ============

// Get transportation statistics for dashboard
router.get('/stats',
  authenticate,
  isTenant,
  transportationController.getTransportStats
);

// Get upcoming transportation bookings
router.get('/upcoming',
  authenticate,
  isTenant,
  transportationController.getUpcomingBookings
);

module.exports = router;