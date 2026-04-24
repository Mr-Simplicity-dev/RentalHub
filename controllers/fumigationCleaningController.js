const FumigationCleaningService = require('../models/FumigationCleaning');
const { validationResult } = require('express-validator');
const NotificationService = require('../services/notificationService');
const db = require('../config/middleware/database');

// ---------------------------------------------------------------------------
// PaymentService — inline mock (replace body with real implementation later)
// ---------------------------------------------------------------------------
const PaymentService = {
  initializePayment: async (paymentData, paymentMethod) => {
    console.log('Mock payment initialization:', { paymentData, paymentMethod });
    return {
      authorization_url: `https://paystack.com/pay/${paymentData.reference}`,
      reference: paymentData.reference
    };
  },

  verifyPayment: async (reference) => {
    console.log('Mock payment verification:', reference);
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
};

// ---------------------------------------------------------------------------
// NotificationService — inline mock (replace body with real implementation later)
// ---------------------------------------------------------------------------
class FumigationCleaningController {
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
      if (!req.user.is_admin) {
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
      if (!req.user.is_admin) {
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
      if (!req.user.is_admin) {
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
      if (!req.user.is_admin) {
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

  // Get available providers for booking (admin)
  async getAvailableProvidersForBooking(req, res) {
    try {
      if (!req.user.is_admin) {
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

  // ============ SAFETY COMPLIANCE ENDPOINTS ============

  // Submit safety compliance record
  async submitSafetyCompliance(req, res) {
    try {
      if (!req.user.is_admin) {
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
      
      const isAdmin = ['admin', 'super_admin', 'state_admin', 'state_financial_admin'].includes(
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
