const FumigationCleaningService = require('../models/FumigationCleaning');
const { validationResult } = require('express-validator');
const NotificationService = require('../services/notificationService');
const db = require('../config/middleware/database');

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

const isFumigationAdminUser = (user) =>
  Boolean(user?.is_admin) || FUMIGATION_ADMIN_ROLES.has(String(user?.user_type || '').toLowerCase());

const getActorName = (user) =>
  user?.full_name || user?.name || user?.email || user?.username || `User ${user?.id || ''}`.trim();

const lifecycleStatusToBookingStatus = {
  accepted: 'scheduled',
  declined: 'pending',
  in_progress: 'in_progress',
  completed: 'completed'
};

// ---------------------------------------------------------------------------
// Paystack payment adapter with explicit local-only mock fallback.
// ---------------------------------------------------------------------------
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const allowMockPayments = () =>
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_MOCK_PAYMENTS === 'true';

const PaymentService = {
  initializePayment: async (paymentData, paymentMethod) => {
    if (!PAYSTACK_SECRET_KEY && allowMockPayments()) {
      console.warn('PAYSTACK_SECRET_KEY not configured; using explicitly enabled local mock payment');
      return {
        authorization_url: `https://paystack.com/pay/${paymentData.reference}`,
        reference: paymentData.reference
      };
    }

    if (!PAYSTACK_SECRET_KEY) {
      throw new Error('Payment gateway is not configured. Please contact support.');
    }

    try {
      const axios = require('axios');
      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: paymentData.email,
          amount: Math.round(paymentData.amount * 100), // Paystack expects amount in kobo
          reference: paymentData.reference,
          metadata: paymentData.metadata || {},
          // FRONTEND_URL must be set in production
          callback_url: `${process.env.FRONTEND_URL}/fumigation-cleaning/payment/callback`
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        authorization_url: response.data.data.authorization_url,
        reference: response.data.data.reference,
        access_code: response.data.data.access_code
      };
    } catch (error) {
      console.error('Paystack initialization error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to initialize payment with Paystack');
    }
  },

  verifyPayment: async (reference) => {
    if (!PAYSTACK_SECRET_KEY && allowMockPayments()) {
      console.warn('PAYSTACK_SECRET_KEY not configured; using explicitly enabled local mock verification');
      return {
        success: true,
        data: {
          status: 'success',
          reference,
          amount: 10000,
          currency: 'NGN'
        }
      };
    }

    if (!PAYSTACK_SECRET_KEY) {
      return {
        success: false,
        message: 'Payment gateway is not configured. Please contact support.'
      };
    }

    try {
      const axios = require('axios');
      const response = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: response.data.data.status === 'success',
        data: {
          status: response.data.data.status,
          reference: response.data.data.reference,
          amount: response.data.data.amount / 100, // Convert from kobo to main unit
          currency: response.data.data.currency,
          paid_at: response.data.data.paid_at,
          channel: response.data.data.channel
        }
      };
    } catch (error) {
      console.error('Paystack verification error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to verify payment with Paystack'
      };
    }
  }
};

class FumigationCleaningController {
  constructor() {
    Object.getOwnPropertyNames(FumigationCleaningController.prototype)
      .filter((method) => method !== 'constructor' && typeof this[method] === 'function')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  // ============ HELPER METHODS ============

  // Get property state (helper method)
  async getPropertyState(propertyId) {
    const result = await db.query(
      `SELECT s.state_code 
       FROM properties p
       JOIN states s ON p.state_id = s.id
       WHERE p.id = $1`,
      [propertyId]
    );
    return result.rows[0]?.state_code || 'LA'; // Default to Lagos if not found
  }

  // Get review by booking ID (helper method)
  async getReviewByBookingId(bookingId) {
    const result = await db.query(
      'SELECT * FROM service_reviews WHERE booking_id = $1',
      [bookingId]
    );
    return result.rows[0];
  }

  // Update provider rating (helper method)
  async updateProviderRating(providerId) {
    const result = await db.query(
      `UPDATE service_providers sp
       SET 
         rating = (
           SELECT COALESCE(AVG(overall_rating), 0)
           FROM service_reviews
           WHERE provider_id = sp.id
         ),
         total_jobs_completed = (
           SELECT COUNT(*)
           FROM booking_provider_assignments
           WHERE provider_id = sp.id AND assignment_status = 'completed'
         )
       WHERE sp.id = $1
       RETURNING *`,
      [providerId]
    );
    return result.rows[0];
  }

  // ============ SERVICE CATALOG ENDPOINTS ============

  // Get all service categories
  async getServiceCategories(req, res) {
    try {
      const { category_type } = req.query;
      const filters = {};
      
      if (category_type) {
        filters.category_type = category_type;
      }
      
      const categories = await FumigationCleaningService.getAllCategories(filters);
      
      res.json({
        success: true,
        data: categories,
        message: 'Service categories retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting service categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve service categories',
        error: error.message
      });
    }
  }

  // Get all services
  async getAllServices(req, res) {
    try {
      const filters = req.query;
      const services = await FumigationCleaningService.getAllServices(filters);
      
      res.json({
        success: true,
        data: services,
        message: 'Services retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting services:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve services',
        error: error.message
      });
    }
  }

  // Get service details
  async getServiceDetails(req, res) {
    try {
      const { serviceId } = req.params;
      const service = await FumigationCleaningService.getServiceById(serviceId);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      res.json({
        success: true,
        data: service,
        message: 'Service details retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting service details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve service details',
        error: error.message
      });
    }
  }

  // Calculate service price
  async calculateServicePrice(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { serviceId, propertySizeSqm, selectedAddons } = req.body;
      
      const priceCalculation = await FumigationCleaningService.calculateServicePrice(
        serviceId,
        propertySizeSqm,
        selectedAddons
      );
      
      res.json({
        success: true,
        data: priceCalculation,
        message: 'Price calculated successfully'
      });
    } catch (error) {
      console.error('Error calculating service price:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate price',
        error: error.message
      });
    }
  }

  // ============ BOOKING ELIGIBILITY ============

  // Check booking eligibility
  async checkBookingEligibility(req, res) {
    try {
      const { propertyId } = req.params;
      const tenantId = req.user.id;
      
      const eligibility = await FumigationCleaningService.checkBookingEligibility(tenantId, propertyId);
      
      res.json({
        success: true,
        data: eligibility,
        message: 'Eligibility checked successfully'
      });
    } catch (error) {
      console.error('Error checking booking eligibility:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check eligibility',
        error: error.message
      });
    }
  }

  // Get available booking dates
  async getAvailableBookingDates(req, res) {
    try {
      const { serviceId, month, year } = req.params;
      
      const availableDates = await FumigationCleaningService.getAvailableBookingDates(
        serviceId,
        parseInt(month),
        parseInt(year)
      );
      
      res.json({
        success: true,
        data: availableDates,
        message: 'Available dates retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting available dates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve available dates',
        error: error.message
      });
    }
  }

  // ============ BOOKING MANAGEMENT ============

  // Create new booking
  async createBooking(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const tenantId = req.user.id;
      const {
        property_id,
        service_id,
        booking_date,
        preferred_time_slot,
        specific_time,
        property_size_sqm,
        number_of_rooms,
        property_condition,
        special_instructions,
        selected_addons,
        base_service_price,
        addons_total_price,
        discount_amount,
        total_price
      } = req.body;

      // Validate booking date and time
      const dateValidation = FumigationCleaningService.validateBookingDateTime(
        booking_date,
        preferred_time_slot,
        specific_time
      );
      
      if (!dateValidation.valid) {
        return res.status(400).json({
          success: false,
          message: dateValidation.error
        });
      }

      // Check eligibility
      const eligibility = await FumigationCleaningService.checkBookingEligibility(tenantId, property_id);
      if (!eligibility.can_book) {
        return res.status(400).json({
          success: false,
          message: eligibility.reason
        });
      }

      const bookingData = {
        tenant_id: tenantId,
        property_id,
        service_id,
        booking_date,
        preferred_time_slot,
        specific_time,
        property_size_sqm,
        number_of_rooms,
        property_condition: property_condition || 'normal',
        special_instructions,
        selected_addons,
        base_service_price,
        addons_total_price,
        discount_amount: discount_amount || 0,
        total_price
      };

      const booking = await FumigationCleaningService.createBooking(bookingData);
      
      // Send booking confirmation notification
      try {
        await NotificationService.sendBookingConfirmation({
          tenantId,
          bookingId: booking.id,
          bookingReference: booking.booking_reference,
          serviceType: 'fumigation_cleaning'
        });
      } catch (notificationError) {
        console.error('Failed to send notification:', notificationError);
        // Don't fail the booking if notification fails
      }

      res.status(201).json({
        success: true,
        data: booking,
        message: 'Booking created successfully'
      });
    } catch (error) {
      console.error('Error creating booking:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create booking',
        error: error.message
      });
    }
  }

  // Get tenant's bookings
  async getMyBookings(req, res) {
    try {
      const tenantId = req.user.id;
      const filters = req.query;
      
      const bookings = await FumigationCleaningService.getTenantBookings(tenantId, filters);
      
      res.json({
        success: true,
        data: bookings,
        message: 'Bookings retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve bookings',
        error: error.message
      });
    }
  }

  // Get booking details
  async getBookingDetails(req, res) {
    try {
      const { bookingId } = req.params;
      const tenantId = req.user.id;
      
      const booking = await FumigationCleaningService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Ensure tenant can only view their own bookings
      if (booking.tenant_id !== tenantId && !req.user.is_admin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      res.json({
        success: true,
        data: booking,
        message: 'Booking details retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting booking details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve booking details',
        error: error.message
      });
    }
  }

  // Cancel booking
  async cancelBooking(req, res) {
    try {
      const { bookingId } = req.params;
      const tenantId = req.user.id;
      const { cancellation_reason } = req.body;
      
      // Get booking first to verify ownership
      const booking = await FumigationCleaningService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      if (booking.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      // Check if booking can be cancelled
      if (booking.booking_status === 'cancelled') {
        return res.status(400).json({
          success: false,
          message: 'Booking is already cancelled'
        });
      }
      
      if (booking.booking_status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel completed booking'
        });
      }
      
      if (booking.booking_status === 'in_progress') {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel booking in progress'
        });
      }
      
      // Calculate cancellation fee based on how close to booking date
      const bookingDate = new Date(booking.booking_date);
      const today = new Date();
      const daysDifference = Math.ceil((bookingDate - today) / (1000 * 60 * 60 * 24));
      
      let cancellationFee = 0;
      if (daysDifference < 2) {
        cancellationFee = booking.total_price * 0.5; // 50% fee for less than 48 hours notice
      } else if (daysDifference < 7) {
        cancellationFee = booking.total_price * 0.25; // 25% fee for less than 7 days notice
      }
      
      const updateData = {
        cancellation_reason,
        cancelled_by: 'tenant',
        cancellation_fee: cancellationFee
      };
      
      const updatedBooking = await FumigationCleaningService.updateBookingStatus(
        bookingId,
        'cancelled',
        updateData
      );
      
      // Send cancellation notification
      try {
        await NotificationService.sendBookingCancellation({
          tenantId,
          bookingId: booking.id,
          bookingReference: booking.booking_reference,
          cancellationFee
        });
      } catch (notificationError) {
        console.error('Failed to send cancellation notification:', notificationError);
      }
      
      res.json({
        success: true,
        data: updatedBooking,
        message: 'Booking cancelled successfully'
      });
    } catch (error) {
      console.error('Error cancelling booking:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel booking',
        error: error.message
      });
    }
  }

  // ============ PAYMENT ENDPOINTS ============

  // Initialize payment for booking
  async initializeBookingPayment(req, res) {
    try {
      const { bookingId } = req.params;
      const tenantId = req.user.id;
      const { payment_method = 'paystack' } = req.body;
      
      // Get booking details
      const booking = await FumigationCleaningService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      if (booking.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      if (booking.payment_status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Payment already completed for this booking'
        });
      }
      
      // Initialize payment with payment service
      const paymentData = {
        amount: booking.total_price,
        email: booking.tenant_email,
        reference: `FC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        metadata: {
          booking_id: booking.id,
          booking_reference: booking.booking_reference,
          service_name: booking.service_name,
          tenant_id: tenantId
        }
      };
      
      const paymentResult = await PaymentService.initializePayment(paymentData, payment_method);
      
      // Create payment record
      const paymentRecord = await FumigationCleaningService.createPaymentRecord({
        booking_id: booking.id,
        payment_reference: paymentData.reference,
        payment_method,
        amount: booking.total_price,
        gateway_response: paymentResult
      });
      
      // Update booking payment reference
      await FumigationCleaningService.updatePaymentStatus(booking.id, 'processing', {
        payment_reference: paymentData.reference
      });
      
      res.json({
        success: true,
        data: {
          payment_reference: paymentData.reference,
          authorization_url: paymentResult.authorization_url,
          payment_record: paymentRecord
        },
        message: 'Payment initialized successfully'
      });
    } catch (error) {
      console.error('Error initializing payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize payment',
        error: error.message
      });
    }
  }

  // Verify payment
  async verifyPayment(req, res) {
    try {
      const { reference } = req.params;
      
      // Verify payment with payment service
      const verificationResult = await PaymentService.verifyPayment(reference);
      
      if (!verificationResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed',
          data: verificationResult
        });
      }
      
      // Get payment record
      const paymentRecord = await FumigationCleaningService.getPaymentByReference(reference);
      
      if (!paymentRecord) {
        return res.status(404).json({
          success: false,
          message: 'Payment record not found'
        });
      }
      
      // Update payment status
      const updatedPayment = await FumigationCleaningService.updatePaymentStatus(
        paymentRecord.id,
        'completed',
        verificationResult.data
      );
      
      // Update booking payment status
      await FumigationCleaningService.updatePaymentStatus(
        paymentRecord.booking_id,
        'completed'
      );
      
      // Send payment confirmation notification
      try {
        await NotificationService.sendPaymentConfirmation({
          tenantId: paymentRecord.tenant_id,
          bookingId: paymentRecord.booking_id,
          amount: paymentRecord.amount,
          paymentReference: reference
        });
      } catch (notificationError) {
        console.error('Failed to send payment notification:', notificationError);
      }
      
      res.json({
        success: true,
        data: {
          payment: updatedPayment,
          booking_id: paymentRecord.booking_id
        },
        message: 'Payment verified successfully'
      });
    } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify payment',
        error: error.message
      });
    }
  }

  // ============ DASHBOARD STATISTICS ============

  // Get tenant statistics
  async getTenantStats(req, res) {
    try {
      const tenantId = req.user.id;
      
      const stats = await FumigationCleaningService.getTenantStats(tenantId);
      
      res.json({
        success: true,
        data: stats,
        message: 'Statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting tenant stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve statistics',
        error: error.message
      });
    }
  }

  // Get upcoming bookings
  async getUpcomingBookings(req, res) {
    try {
      const tenantId = req.user.id;
      const { limit = 5 } = req.query;
      
      const bookings = await FumigationCleaningService.getUpcomingBookings(tenantId, parseInt(limit));
      
      res.json({
        success: true,
        data: bookings,
        message: 'Upcoming bookings retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting upcoming bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve upcoming bookings',
        error: error.message
      });
    }
  }

  // ============ REVIEW ENDPOINTS ============

  // Submit review
  async submitReview(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const tenantId = req.user.id;
      const {
        booking_id,
        overall_rating,
        professionalism_rating,
        quality_rating,
        timeliness_rating,
        review_title,
        review_text,
        photos_urls
      } = req.body;

      // Get booking to verify ownership and completion
      const booking = await FumigationCleaningService.getBookingById(booking_id);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      if (booking.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      if (booking.booking_status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Can only review completed bookings'
        });
      }

      // Check if review already exists for this booking
      const existingReview = await this.getReviewByBookingId(booking_id);
      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'Review already submitted for this booking'
        });
      }

      const reviewData = {
        booking_id,
        tenant_id: tenantId,
        service_id: booking.service_id,
        provider_id: booking.provider_id,
        overall_rating,
        professionalism_rating,
        quality_rating,
        timeliness_rating,
        review_title,
        review_text,
        photos_urls: photos_urls || []
      };

      const review = await FumigationCleaningService.submitReview(reviewData);
      
      // Update provider rating
      if (booking.provider_id) {
        await this.updateProviderRating(booking.provider_id);
      }

      res.status(201).json({
        success: true,
        data: review,
        message: 'Review submitted successfully'
      });
    } catch (error) {
      console.error('Error submitting review:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit review',
        error: error.message
      });
    }
  }

  // Get service reviews
  async getServiceReviews(req, res) {
    try {
      const { serviceId } = req.params;
      const filters = req.query;
      
      const reviews = await FumigationCleaningService.getServiceReviews(serviceId, filters);
      
      res.json({
        success: true,
        data: reviews,
        message: 'Reviews retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting service reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve reviews',
        error: error.message
      });
    }
  }

  // ============ ADMIN ENDPOINTS ============

  // Get all bookings (admin)
  async getAllBookings(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const filters = req.query;
      const bookings = await FumigationCleaningService.getAllBookings(filters);
      
      res.json({
        success: true,
        data: bookings,
        message: 'All bookings retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting all bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve bookings',
        error: error.message
      });
    }
  }

  // Get admin statistics
  async getAdminStats(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const filters = req.query;
      const stats = await FumigationCleaningService.getAdminStats(filters);
      
      res.json({
        success: true,
        data: stats,
        message: 'Admin statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting admin stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve admin statistics',
        error: error.message
      });
    }
  }

  // Update booking status (admin)
  async updateBookingStatus(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const { bookingId } = req.params;
      const { status, update_data = {} } = req.body;
      
      const validStatuses = ['pending', 'confirmed', 'scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const booking = await FumigationCleaningService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      const updatedBooking = await FumigationCleaningService.updateBookingStatus(
        bookingId,
        status,
        update_data
      );

      try {
        const assignment = await FumigationCleaningService.getLatestProviderAssignment(bookingId);
        await FumigationCleaningService.createBookingOperation({
          booking_id: bookingId,
          provider_id: assignment?.provider_id,
          actor_id: req.user?.id,
          actor_name: getActorName(req.user),
          event_type: `status_${status}`,
          note: update_data.admin_note || update_data.cancellation_reason || null,
          metadata: {
            status,
            update_data
          }
        });
      } catch (operationError) {
        console.error('Failed to write fumigation status operation:', operationError);
      }

      // Send status update notification to tenant
      try {
        await NotificationService.sendBookingStatusUpdate({
          tenantId: booking.tenant_id,
          bookingId: booking.id,
          bookingReference: booking.booking_reference,
          newStatus: status,
          updateDetails: update_data
        });
      } catch (notificationError) {
        console.error('Failed to send status update notification:', notificationError);
      }

      res.json({
        success: true,
        data: updatedBooking,
        message: 'Booking status updated successfully'
      });
    } catch (error) {
      console.error('Error updating booking status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update booking status',
        error: error.message
      });
    }
  }

  // Assign provider to booking (admin)
  async assignProvider(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const { bookingId } = req.params;
      const { provider_id } = req.body;
      
      if (!provider_id) {
        return res.status(400).json({
          success: false,
          message: 'Provider ID is required'
        });
      }

      const booking = await FumigationCleaningService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      // Check if provider is available for this service
      const propertyState = await this.getPropertyState(booking.property_id);
      const availableProviders = await FumigationCleaningService.getAvailableProviders(
        booking.service_id,
        propertyState
      );
      
      const providerAvailable = availableProviders.some(p => p.id === provider_id);
      
      if (!providerAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Provider is not available for this service in this area'
        });
      }

      const assignment = await FumigationCleaningService.assignProviderToBooking(bookingId, provider_id);
      
      // Update booking with provider details
      const provider = availableProviders.find(p => p.id === provider_id);
      await FumigationCleaningService.updateBookingStatus(bookingId, 'confirmed', {
        assigned_team_leader: provider.contact_person,
        team_contact_phone: provider.contact_phone,
        assigned_team_members: [provider.contact_person]
      });

      try {
        await FumigationCleaningService.createBookingOperation({
          booking_id: bookingId,
          provider_id,
          actor_id: req.user?.id,
          actor_name: getActorName(req.user),
          event_type: 'provider_assigned',
          note: `${provider.company_name} assigned to booking`,
          metadata: {
            provider_name: provider.company_name,
            contact_person: provider.contact_person,
            contact_phone: provider.contact_phone
          }
        });
      } catch (operationError) {
        console.error('Failed to write fumigation assignment operation:', operationError);
      }

      // Send provider assignment notification
      try {
        await NotificationService.sendProviderAssignment({
          tenantId: booking.tenant_id,
          bookingId: booking.id,
          bookingReference: booking.booking_reference,
          providerName: provider.company_name,
          contactPerson: provider.contact_person,
          contactPhone: provider.contact_phone
        });
      } catch (notificationError) {
        console.error('Failed to send provider assignment notification:', notificationError);
      }

      res.json({
        success: true,
        data: assignment,
        message: 'Provider assigned successfully'
      });
    } catch (error) {
      console.error('Error assigning provider:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign provider',
        error: error.message
      });
    }
  }

  async getBookingOperations(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const { bookingId } = req.params;
      const booking = await FumigationCleaningService.getBookingById(bookingId);

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      const [assignment, operations] = await Promise.all([
        FumigationCleaningService.getLatestProviderAssignment(bookingId),
        FumigationCleaningService.getBookingOperations(bookingId)
      ]);

      res.json({
        success: true,
        data: {
          assignment,
          operations
        },
        message: 'Booking operations retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting booking operations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve booking operations',
        error: error.message
      });
    }
  }

  async updateProviderLifecycle(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const { bookingId } = req.params;
      const { action, note = '', proof_url = '' } = req.body;
      const allowedActions = ['accepted', 'declined', 'in_progress', 'completed'];

      if (!allowedActions.includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid provider lifecycle action'
        });
      }

      if (['declined', 'completed'].includes(action) && !String(note).trim()) {
        return res.status(400).json({
          success: false,
          message: 'A note is required for this operation'
        });
      }

      const booking = await FumigationCleaningService.getBookingById(bookingId);

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      const currentAssignment = await FumigationCleaningService.getLatestProviderAssignment(bookingId);

      if (!currentAssignment) {
        return res.status(400).json({
          success: false,
          message: 'Assign a provider before updating provider operations'
        });
      }

      const assignment = await FumigationCleaningService.updateProviderAssignmentLifecycle(bookingId, {
        status: action,
        note: String(note).trim(),
        proof_url: String(proof_url).trim()
      });

      const bookingStatus = lifecycleStatusToBookingStatus[action];
      const updatedBooking = await FumigationCleaningService.updateBookingStatus(bookingId, bookingStatus, {
        admin_note: String(note).trim() || undefined
      });

      await FumigationCleaningService.createBookingOperation({
        booking_id: bookingId,
        provider_id: currentAssignment.provider_id,
        actor_id: req.user?.id,
        actor_name: getActorName(req.user),
        event_type: `provider_${action}`,
        note: String(note).trim() || null,
        proof_url: String(proof_url).trim() || null,
        metadata: {
          booking_status: bookingStatus,
          provider_name: currentAssignment.company_name
        }
      });

      try {
        await NotificationService.sendBookingStatusUpdate({
          tenantId: booking.tenant_id,
          bookingId: booking.id,
          bookingReference: booking.booking_reference,
          newStatus: bookingStatus,
          updateDetails: {
            admin_note: String(note).trim() || undefined,
            provider_name: currentAssignment.company_name,
            proof_url: String(proof_url).trim() || undefined
          }
        });
      } catch (notificationError) {
        console.error('Failed to send provider lifecycle notification:', notificationError);
      }

      res.json({
        success: true,
        data: {
          assignment,
          booking: updatedBooking
        },
        message: 'Provider operation updated successfully'
      });
    } catch (error) {
      console.error('Error updating provider operation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update provider operation',
        error: error.message
      });
    }
  }

  // Get available providers for booking (admin)
  async getAvailableProvidersForBooking(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const { bookingId } = req.params;
      
      const booking = await FumigationCleaningService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      const propertyState = await this.getPropertyState(booking.property_id);
      const providers = await FumigationCleaningService.getAvailableProviders(
        booking.service_id,
        propertyState
      );

      res.json({
        success: true,
        data: providers,
        message: 'Available providers retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting available providers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve available providers',
        error: error.message
      });
    }
  }

  // Get all active providers (admin)
  async getProviders(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const result = await db.query(
        `SELECT
           sp.*,
           COALESCE(AVG(sr.overall_rating), 0) AS avg_rating,
           COUNT(sr.id)::INT AS total_reviews
         FROM service_providers sp
         LEFT JOIN service_reviews sr ON sp.id = sr.provider_id
         WHERE sp.is_active = TRUE
         GROUP BY sp.id
         ORDER BY avg_rating DESC, sp.total_jobs_completed DESC, sp.company_name ASC`
      );

      res.json({
        success: true,
        data: result.rows,
        message: 'Providers retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting providers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve providers',
        error: error.message
      });
    }
  }

  // Get provider by ID (authenticated users)
  async getProviderById(req, res) {
    try {
      const { providerId } = req.params;

      const result = await db.query(
        `SELECT
           sp.*,
           COALESCE(AVG(sr.overall_rating), 0) AS avg_rating,
           COUNT(sr.id)::INT AS total_reviews
         FROM service_providers sp
         LEFT JOIN service_reviews sr ON sp.id = sr.provider_id
         WHERE sp.id = $1 AND sp.is_active = TRUE
         GROUP BY sp.id`,
        [providerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Provider not found'
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
        message: 'Provider retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting provider by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve provider',
        error: error.message
      });
    }
  }

    // ============ SAFETY COMPLIANCE ENDPOINTS ============

  // Submit safety compliance record
  async submitSafetyCompliance(req, res) {
    try {
      if (!isFumigationAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { bookingId } = req.params;
      const complianceData = req.body;
      
      complianceData.booking_id = bookingId;
      
      // Get booking to verify provider
      const booking = await FumigationCleaningService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      if (!complianceData.provider_id) {
        complianceData.provider_id = booking.provider_id;
      }

      if (!complianceData.provider_id) {
        return res.status(400).json({
          success: false,
          message: 'Provider ID is required'
        });
      }

      const complianceRecord = await FumigationCleaningService.createSafetyComplianceRecord(complianceData);
      
      // Update booking safety checks status
      await FumigationCleaningService.updateBookingStatus(bookingId, 'in_progress', {
        safety_checks_completed: true,
        customer_safety_briefing: complianceData.safety_briefing_completed || false
      });

      res.status(201).json({
        success: true,
        data: complianceRecord,
        message: 'Safety compliance record submitted successfully'
      });
    } catch (error) {
      console.error('Error submitting safety compliance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit safety compliance record',
        error: error.message
      });
    }
  }

  // Get compliance record for booking
  async getComplianceRecord(req, res) {
    try {
      const { bookingId } = req.params;
      
      // Check if user has access
      const booking = await FumigationCleaningService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      const isAdmin = ['admin', 'lga_admin', 'super_admin', 'state_admin', 'state_financial_admin', 'fumigation_admin', 'lga_fumigation_admin', 'state_fumigation_admin', 'super_fumigation_admin'].includes(
        req.user?.user_type
      );
      const isTenant = booking.tenant_id === req.user.id;
      
      if (!isAdmin && !isTenant) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const complianceRecord = await FumigationCleaningService.getComplianceRecord(bookingId);
      
      res.json({
        success: true,
        data: complianceRecord,
        message: 'Compliance record retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting compliance record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve compliance record',
        error: error.message
      });
    }
  }
}

module.exports = new FumigationCleaningController();
