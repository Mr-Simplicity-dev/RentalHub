const TransportationService = require('../models/Transportation');
const { validationResult } = require('express-validator');

const allowMockPayments = () =>
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_MOCK_PAYMENTS === 'true';

class TransportationController {
  // Get all available transportation services
  async getAvailableServices(req, res) {
    try {
      const { service_type, min_capacity } = req.query;
      const filters = {};
      
      if (service_type) filters.service_type = service_type;
      if (min_capacity) filters.min_capacity = min_capacity;
      
      const services = await TransportationService.getAllServices(filters);
      
      res.json({
        success: true,
        data: services,
        message: 'Transportation services retrieved successfully'
      });
    } catch (error) {
      req.logger.error('Error getting transportation services:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve transportation services'
      });
    }
  }

  // Get service details by ID
  async getServiceDetails(req, res) {
    try {
      const { serviceId } = req.params;
      const service = await TransportationService.getServiceById(serviceId);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Transportation service not found'
        });
      }
      
      res.json({
        success: true,
        data: service,
        message: 'Service details retrieved successfully'
      });
    } catch (error) {
      req.logger.error('Error getting service details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve service details'
      });
    }
  }

  // Check if tenant can book transportation for a property
  async checkBookingEligibility(req, res) {
    try {
      const tenantId = req.user.id;
      const { propertyId } = req.params;
      
      const eligibility = await TransportationService.canBookTransportation(tenantId, propertyId);
      
      res.json({
        success: true,
        data: eligibility,
        message: eligibility.can_book ? 'Eligible to book transportation' : 'Not eligible to book transportation'
      });
    } catch (error) {
      req.logger.error('Error checking booking eligibility:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check booking eligibility'
      });
    }
  }

  // Calculate price for transportation booking
  async calculateBookingPrice(req, res) {
    try {
      const { serviceId, distanceKm } = req.body;
      
      if (!serviceId || !distanceKm) {
        return res.status(400).json({
          success: false,
          message: 'Service ID and distance are required'
        });
      }
      
      const priceDetails = await TransportationService.calculatePrice(serviceId, distanceKm);
      
      res.json({
        success: true,
        data: priceDetails,
        message: 'Price calculated successfully'
      });
    } catch (error) {
      req.logger.error('Error calculating price:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to calculate price'
      });
    }
  }

  // Create a transportation booking (without payment)
  async createBooking(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
          message: 'Validation failed'
        });
      }
      
      const tenantId = req.user.id;
      const {
        property_id,
        service_id,
        pickup_address,
        destination_address,
        estimated_distance_km,
        booking_date,
        booking_time,
        items_description,
        special_requirements
      } = req.body;
      
      // Check eligibility
      const eligibility = await TransportationService.canBookTransportation(tenantId, property_id);
      if (!eligibility.can_book) {
        return res.status(400).json({
          success: false,
          message: eligibility.reason
        });
      }
      
      // Calculate price
      const priceDetails = await TransportationService.calculatePrice(service_id, estimated_distance_km);
      
      // Create booking
      const bookingData = {
        tenant_id: tenantId,
        property_id,
        service_id,
        pickup_address,
        destination_address,
        estimated_distance_km: parseFloat(estimated_distance_km),
        booking_date,
        booking_time,
        items_description: items_description || '',
        special_requirements: special_requirements || '',
        base_price: priceDetails.base_price,
        distance_price: priceDetails.distance_price,
        total_price: priceDetails.total_price
      };
      
      const booking = await TransportationService.createBooking(bookingData);
      
      res.status(201).json({
        success: true,
        data: booking,
        message: 'Transportation booking created successfully. Proceed to payment.'
      });
    } catch (error) {
      req.logger.error('Error creating booking:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create transportation booking'
      });
    }
  }

  // Get tenant's transportation bookings
  async getMyBookings(req, res) {
    try {
      const tenantId = req.user.id;
      const { booking_status, payment_status } = req.query;
      const filters = {};
      
      if (booking_status) filters.booking_status = booking_status;
      if (payment_status) filters.payment_status = payment_status;
      
      const bookings = await TransportationService.getTenantBookings(tenantId, filters);
      
      res.json({
        success: true,
        data: bookings,
        message: 'Bookings retrieved successfully'
      });
    } catch (error) {
      req.logger.error('Error getting bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve bookings'
      });
    }
  }

  // Get booking details by ID
  async getBookingDetails(req, res) {
    try {
      const { bookingId } = req.params;
      const tenantId = req.user.id;
      
      const booking = await TransportationService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if booking belongs to tenant
      if (booking.tenant_id !== tenantId) {
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
      req.logger.error('Error getting booking details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve booking details'
      });
    }
  }

    // Initialize payment for transportation booking
  async initializeBookingPayment(req, res) {
    try {
      const { bookingId } = req.params;
      const { payment_method = 'paystack' } = req.body;
      const tenantId = req.user.id;
      
      // Get booking details
      const booking = await TransportationService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if booking belongs to tenant
      if (booking.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      // Check if booking already paid
      if (booking.payment_status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Booking already paid'
        });
      }
      
      // Check if booking is pending payment
      if (booking.payment_status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Booking payment status is ${booking.payment_status}`
        });
      }
      
            // Initialize payment with Paystack
      const axios = require('axios');
      const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
      const PAYSTACK_BASE_URL = 'https://api.paystack.co';
      const reference = `TRANSPORT_${Date.now()}_${bookingId}`;

      let paymentResult;
      if (payment_method === 'paystack') {
        if (PAYSTACK_SECRET_KEY) {
          try {
            const paystackResponse = await axios.post(
              `${PAYSTACK_BASE_URL}/transaction/initialize`,
              {
                email: req.user.email,
                amount: Math.round(booking.total_price * 100),
                reference,
                metadata: {
                  payment_type: 'transportation_booking',
                  booking_id: bookingId,
                  tenant_id: tenantId,
                  property_id: booking.property_id,
                  service_id: booking.service_id
                },
                // FRONTEND_URL must be set in production
                callback_url: `${process.env.FRONTEND_URL}/transportation/payment/callback`
              },
              {
                headers: {
                  Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                  'Content-Type': 'application/json'
                }
              }
            );

            paymentResult = {
              success: true,
              data: {
                authorization_url: paystackResponse.data.data.authorization_url,
                reference: paystackResponse.data.data.reference,
                access_code: paystackResponse.data.data.access_code
              }
            };
          } catch (paystackError) {
            req.logger.error('Paystack initialization error:', paystackError.response?.data || paystackError.message);
            return res.status(502).json({
              success: false,
              message: paystackError.response?.data?.message || 'Payment gateway error'
            });
          }
        } else if (allowMockPayments()) {
          req.logger.warn('PAYSTACK_SECRET_KEY not configured; using explicitly enabled local mock payment');
          paymentResult = {
            success: true,
            data: {
              authorization_url: `/api/transportation/mock-payment/${bookingId}`,
              reference,
              access_code: `transport_${bookingId}_${Date.now()}`
            }
          };
        } else {
          return res.status(503).json({
            success: false,
            message: 'Payment gateway is not configured. Please contact support.'
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Only Paystack payment method is currently supported'
        });
      }
      
      if (!paymentResult.success) {
        return res.status(400).json({
          success: false,
          message: paymentResult.message || 'Failed to initialize payment'
        });
      }
      
      res.json({
        success: true,
        data: {
          payment_url: paymentResult.data.authorization_url,
          reference: paymentResult.data.reference,
          booking_id: bookingId,
          amount: booking.total_price
        },
        message: 'Payment initialized successfully'
      });
    } catch (error) {
      req.logger.error('Error initializing booking payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize payment'
      });
    }
  }

  // Mock payment verification for testing
  async mockPaymentVerification(req, res) {
    try {
      if (!allowMockPayments()) {
        return res.status(404).json({
          success: false,
          message: 'Mock payments are disabled'
        });
      }

      const { bookingId } = req.params;
      const tenantId = req.user.id;
      
      // Get booking details
      const booking = await TransportationService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if booking belongs to tenant
      if (booking.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      const mockPaymentId = Date.now();
      
      // Update booking payment status
      await TransportationService.updatePaymentStatus(bookingId, 'completed', mockPaymentId);
      
      // Get updated booking
      const updatedBooking = await TransportationService.getBookingById(bookingId);
      
      res.json({
        success: true,
        data: updatedBooking,
        message: 'Mock payment verified and booking confirmed successfully'
      });
    } catch (error) {
      req.logger.error('Error in mock payment verification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify mock payment'
      });
    }
  }

  // Verify transportation booking payment
  async verifyBookingPayment(req, res) {
    try {
      const { reference } = req.params;
      const tenantId = req.user.id;
      
      // Extract booking ID from reference (format: TRANSPORT_TIMESTAMP_BOOKINGID)
      const parts = reference.split('_');
      if (parts.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment reference format'
        });
      }
      
      const bookingId = parts[2];
      
      // Get booking details
      const booking = await TransportationService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if booking belongs to tenant
      if (booking.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
            // Verify payment with Paystack
      const axios = require('axios');
      const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
      const PAYSTACK_BASE_URL = 'https://api.paystack.co';

      if (PAYSTACK_SECRET_KEY) {
        try {
          const verifyResponse = await axios.get(
            `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
            {
              headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (verifyResponse.data.data.status !== 'success') {
            return res.status(400).json({
              success: false,
              message: 'Payment verification failed: ' + verifyResponse.data.data.status
            });
          }
        } catch (verifyError) {
          req.logger.error('Paystack verification error:', verifyError.response?.data || verifyError.message);
          return res.status(502).json({
            success: false,
            message: verifyError.response?.data?.message || 'Payment verification gateway error'
          });
        }
      } else if (allowMockPayments()) {
        req.logger.warn('PAYSTACK_SECRET_KEY not configured; using explicitly enabled local mock verification');
      } else {
        return res.status(503).json({
          success: false,
          message: 'Payment gateway is not configured. Please contact support.'
        });
      }

      const paymentId = PAYSTACK_SECRET_KEY ? reference : Date.now();
      
      // Update booking payment status
      await TransportationService.updatePaymentStatus(bookingId, 'completed', paymentId);
      
      // Get updated booking
      const updatedBooking = await TransportationService.getBookingById(bookingId);
      
      res.json({
        success: true,
        data: updatedBooking,
        message: 'Payment verified and booking confirmed successfully'
      });
    } catch (error) {
      req.logger.error('Error verifying booking payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify payment'
      });
    }
  }

  // Cancel transportation booking
  async cancelBooking(req, res) {
    try {
      const { bookingId } = req.params;
      const tenantId = req.user.id;
      const cancellationReason = String(req.body?.cancellation_reason || req.body?.reason || '').trim();

      if (!cancellationReason) {
        return res.status(400).json({
          success: false,
          message: 'Cancellation reason is required'
        });
      }
      
      const booking = await TransportationService.getBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if booking belongs to tenant
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
          message: 'Booking already cancelled'
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
      
      // Update booking status to cancelled
      const updatedBooking = await TransportationService.updateBookingStatus(bookingId, 'cancelled', {
        cancellation_reason: cancellationReason,
        cancelled_by: 'tenant'
      });
      
      res.json({
        success: true,
        data: updatedBooking,
        message: 'Booking cancelled successfully'
      });
    } catch (error) {
      req.logger.error('Error cancelling booking:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel booking'
      });
    }
  }

  // Get transportation statistics for dashboard
  async getTransportStats(req, res) {
    try {
      const tenantId = req.user.id;
      
      const stats = await TransportationService.getTenantTransportStats(tenantId);
      
      res.json({
        success: true,
        data: stats,
        message: 'Transportation statistics retrieved successfully'
      });
    } catch (error) {
      req.logger.error('Error getting transport stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve transportation statistics'
      });
    }
  }

  // Get upcoming bookings
  async getUpcomingBookings(req, res) {
    try {
      const tenantId = req.user.id;
      const { limit = 5 } = req.query;
      
      const bookings = await TransportationService.getUpcomingBookings(tenantId, parseInt(limit));
      
      res.json({
        success: true,
        data: bookings,
        message: 'Upcoming bookings retrieved successfully'
      });
    } catch (error) {
      req.logger.error('Error getting upcoming bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve upcoming bookings'
      });
    }
  }
}

module.exports = new TransportationController();
