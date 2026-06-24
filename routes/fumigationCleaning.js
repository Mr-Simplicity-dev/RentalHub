const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const fumigationCleaningController = require('../controllers/fumigationCleaningController');
const { authenticate, isTenant, isVerified } = require('../config/middleware/auth');

const FUMIGATION_ADMIN_ROLES = new Set([
  'admin',
  'lga_admin',
  'super_admin',
  'state_admin',
  'state_financial_admin',
  'fumigation_admin',
  'lga_fumigation_admin',
  'state_fumigation_admin',
  'super_fumigation_admin',
]);

const requireFumigationAdminAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!FUMIGATION_ADMIN_ROLES.has(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Fumigation admin access only',
    });
  }

  return next();
};

// ============ SERVICE CATALOG ENDPOINTS ============

// Get all service categories
router.get('/categories',
  authenticate,
  fumigationCleaningController.getServiceCategories
);

// Get all available services
router.get('/services',
  authenticate,
  fumigationCleaningController.getAllServices
);

// Get service details by ID
router.get('/services/:serviceId',
  authenticate,
  fumigationCleaningController.getServiceDetails
);

// Calculate price for fumigation/cleaning service
router.post('/calculate-price',
  authenticate,
  isTenant,
  [
    body('serviceId').isInt().withMessage('Service ID is required'),
    body('propertySizeSqm').optional().isFloat({ min: 0 }).withMessage('Property size must be a positive number'),
    body('selectedAddons').optional().isArray().withMessage('Selected addons must be an array')
  ],
  fumigationCleaningController.calculateServicePrice
);

// ============ BOOKING ELIGIBILITY ============

// Check if tenant can book fumigation/cleaning for a property
router.get('/eligibility/:propertyId',
  authenticate,
  isTenant,
  fumigationCleaningController.checkBookingEligibility
);

// Get available booking dates for a service
router.get('/available-dates/:serviceId/:month/:year',
  authenticate,
  isTenant,
  fumigationCleaningController.getAvailableBookingDates
);

// ============ FUMIGATION/CLEANING BOOKINGS ============

// Create a new fumigation/cleaning booking
router.post('/bookings',
  authenticate,
  isTenant,
  isVerified,
  [
    body('property_id').isInt().withMessage('Property ID is required'),
    body('service_id').isInt().withMessage('Service ID is required'),
    body('booking_date').isISO8601().withMessage('Valid booking date is required'),
    body('preferred_time_slot').isIn(['morning', 'afternoon', 'evening', 'specific']).withMessage('Valid time slot is required'),
    body('specific_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid specific time is required (HH:MM format)'),
    body('property_size_sqm').isFloat({ min: 0 }).withMessage('Property size must be a positive number'),
    body('number_of_rooms').isInt({ min: 1 }).withMessage('Number of rooms must be at least 1'),
    body('property_condition').optional().isIn(['normal', 'dirty', 'very_dirty', 'infested']),
    body('special_instructions').optional().isString(),
    body('selected_addons').optional().isArray(),
    body('base_service_price').isFloat({ min: 0 }).withMessage('Base service price is required'),
    body('addons_total_price').isFloat({ min: 0 }).withMessage('Addons total price is required'),
    body('discount_amount').optional().isFloat({ min: 0 }),
    body('total_price').isFloat({ min: 0 }).withMessage('Total price is required')
  ],
  fumigationCleaningController.createBooking
);

// Get tenant's fumigation/cleaning bookings
router.get('/bookings',
  authenticate,
  isTenant,
  fumigationCleaningController.getMyBookings
);

// Get booking details by ID
router.get('/bookings/:bookingId',
  authenticate,
  isTenant,
  fumigationCleaningController.getBookingDetails
);

// Cancel fumigation/cleaning booking
router.delete('/bookings/:bookingId/cancel',
  authenticate,
  isTenant,
  [
    body('cancellation_reason').optional().isString()
  ],
  fumigationCleaningController.cancelBooking
);

// ============ PAYMENT FOR BOOKINGS ============

// Initialize payment for fumigation/cleaning booking
router.post('/bookings/:bookingId/pay',
  authenticate,
  isTenant,
  [
    body('payment_method').optional().isIn(['paystack', 'bank_transfer']).withMessage('Invalid payment method')
  ],
  fumigationCleaningController.initializeBookingPayment
);

// Verify fumigation/cleaning booking payment
router.get('/verify-payment/:reference',
  authenticate,
  isTenant,
  fumigationCleaningController.verifyPayment
);

// ============ DASHBOARD STATISTICS ============

// Get fumigation/cleaning statistics for dashboard
router.get('/stats',
  authenticate,
  isTenant,
  fumigationCleaningController.getTenantStats
);

// Get upcoming fumigation/cleaning bookings
router.get('/upcoming',
  authenticate,
  isTenant,
  fumigationCleaningController.getUpcomingBookings
);

// ============ REVIEW ENDPOINTS ============

// Submit service review
router.post('/reviews',
  authenticate,
  isTenant,
  [
    body('booking_id').isInt().withMessage('Booking ID is required'),
    body('overall_rating').isInt({ min: 1, max: 5 }).withMessage('Overall rating must be between 1 and 5'),
    body('professionalism_rating').isInt({ min: 1, max: 5 }).withMessage('Professionalism rating must be between 1 and 5'),
    body('quality_rating').isInt({ min: 1, max: 5 }).withMessage('Quality rating must be between 1 and 5'),
    body('timeliness_rating').isInt({ min: 1, max: 5 }).withMessage('Timeliness rating must be between 1 and 5'),
    body('review_title').isString().isLength({ min: 5, max: 100 }).withMessage('Review title must be between 5 and 100 characters'),
    body('review_text').isString().isLength({ min: 10, max: 1000 }).withMessage('Review text must be between 10 and 1000 characters'),
    body('photos_urls').optional().isArray()
  ],
  fumigationCleaningController.submitReview
);

// Get service reviews
router.get('/services/:serviceId/reviews',
  authenticate,
  fumigationCleaningController.getServiceReviews
);

// ============ ADMIN ENDPOINTS ============

// Get all bookings (admin)
router.get('/admin/bookings',
  authenticate,
  requireFumigationAdminAccess,
  fumigationCleaningController.getAllBookings
);

// Get admin statistics
router.get('/admin/stats',
  authenticate,
  requireFumigationAdminAccess,
  fumigationCleaningController.getAdminStats
);

// Get active service providers (admin)
router.get('/admin/providers',
  authenticate,
  requireFumigationAdminAccess,
  fumigationCleaningController.getProviders
);

// Get provider by ID
router.get('/providers/:providerId',
  authenticate,
  fumigationCleaningController.getProviderById
);

// Update booking status (admin)
router.put('/admin/bookings/:bookingId/status',
  authenticate,
  requireFumigationAdminAccess,
  [
    body('status').isIn(['pending', 'confirmed', 'scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled']).withMessage('Invalid status'),
    body('update_data').optional().isObject()
  ],
  fumigationCleaningController.updateBookingStatus
);

// Assign provider to booking (admin)
router.post('/admin/bookings/:bookingId/assign-provider',
  authenticate,
  requireFumigationAdminAccess,
  [
    body('provider_id').isInt().withMessage('Provider ID is required')
  ],
  fumigationCleaningController.assignProvider
);

// Get available providers for booking (admin)
router.get('/admin/bookings/:bookingId/available-providers',
  authenticate,
  requireFumigationAdminAccess,
  fumigationCleaningController.getAvailableProvidersForBooking
);

// ============ SAFETY COMPLIANCE ENDPOINTS ============

// Submit safety compliance record
router.post('/admin/compliance/:bookingId',
  authenticate,
  requireFumigationAdminAccess,
  [
    body('provider_id').isInt().withMessage('Provider ID is required'),
    body('safety_briefing_completed').optional().isBoolean(),
    body('ppe_used').optional().isBoolean(),
    body('area_secured').optional().isBoolean(),
    body('warning_signs_posted').optional().isBoolean(),
    body('ventilation_adequate').optional().isBoolean(),
    body('msds_available').optional().isBoolean(),
    body('proper_storage').optional().isBoolean(),
    body('spill_kit_available').optional().isBoolean(),
    body('waste_disposal_proper').optional().isBoolean(),
    body('recycling_compliant').optional().isBoolean(),
    body('compliance_officer_name').isString().withMessage('Compliance officer name is required'),
    body('inspection_date').isISO8601().withMessage('Valid inspection date is required'),
    body('notes').optional().isString()
  ],
  fumigationCleaningController.submitSafetyCompliance
);

// Get compliance record for booking
router.get('/compliance/:bookingId',
  authenticate,
  fumigationCleaningController.getComplianceRecord
);

module.exports = router;
