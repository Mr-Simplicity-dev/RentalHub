const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const TransportationTrackingService = require('../services/transportationTrackingService');
const db = require('../config/middleware/database');
const logger = require('../config/utils/logger') || console;

// Middleware to verify driver authorization
const requireDriverOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  // Any authenticated user can act as driver if assigned to a booking,
  // or user_type can be driver / transportation_driver / admin
  return next();
};

/**
 * GET /api/transportation/driver/assigned
 * Retrieve active and assigned trips for the logged-in driver
 */
router.get('/assigned', authenticate, requireDriverOrAdmin, async (req, res) => {
  try {
    const userId = req.user.id;
    const userPhone = req.user.phone || '';
    const cleanPhone = userPhone.replace(/\D/g, '');

    const query = `
      SELECT 
        tb.*,
        ts.service_name,
        ts.service_type,
        ts.provider_name,
        p.title as property_title,
        p.full_address as property_address,
        p.state as property_state,
        p.lga as property_lga,
        u.full_name as tenant_name,
        u.phone as tenant_phone
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      LEFT JOIN properties p ON tb.property_id = p.id
      LEFT JOIN users u ON tb.tenant_id = u.id
      WHERE (
        tb.driver_id = $1 
        OR ($2 != '' AND REPLACE(REPLACE(tb.driver_phone, ' ', ''), '-', '') LIKE '%' || $2 || '%')
        OR ($3 = 'super_admin' OR $3 = 'super_transportation_admin')
      )
      AND tb.booking_status IN ('confirmed', 'in_progress', 'pending')
      ORDER BY tb.booking_date ASC, tb.booking_time ASC
    `;

    let trips = [];
    try {
      const result = await db.query(query, [userId, cleanPhone, req.user.user_type]);
      trips = result.rows || [];
    } catch (e) {
      logger.warn?.('DB query assigned trips failed, returning empty list:', e.message);
    }

    return res.json({
      success: true,
      data: trips,
      message: 'Assigned driver trips retrieved successfully'
    });
  } catch (error) {
    logger.error?.('Get assigned trips error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve assigned trips'
    });
  }
});

/**
 * GET /api/transportation/driver/trips/:bookingId
 * Retrieve detailed trip manifest for driver
 */
router.get(
  '/trips/:bookingId',
  authenticate,
  requireDriverOrAdmin,
  [param('bookingId').isInt().withMessage('Valid booking ID required')],
  validateRequest,
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const summary = await TransportationTrackingService.getTrackingSummary(bookingId);

      if (!summary) {
        return res.status(404).json({
          success: false,
          message: 'Transportation booking not found'
        });
      }

      const booking = await TransportationTrackingService.getBookingForTracking(bookingId);
      if (!TransportationTrackingService.isAuthorizedDriver(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this trip manifest'
        });
      }

      return res.json({
        success: true,
        data: summary,
        message: 'Trip manifest retrieved successfully'
      });
    } catch (error) {
      logger.error?.('Get driver trip details error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve trip manifest'
      });
    }
  }
);

/**
 * POST /api/transportation/driver/location
 * Ingest real GPS coordinates from driver device
 */
router.post(
  '/location',
  authenticate,
  requireDriverOrAdmin,
  [
    body('booking_id').isInt().withMessage('Booking ID is required'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required (-90 to 90)'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required (-180 to 180)'),
    body('accuracy').optional().isFloat({ min: 0 }),
    body('heading').optional().isFloat({ min: 0, max: 360 }),
    body('speed').optional().isFloat({ min: 0 }),
    body('altitude').optional().isFloat(),
    body('battery_level').optional().isFloat({ min: 0, max: 100 }),
    body('is_mocked').optional().isBoolean()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const {
        booking_id,
        latitude,
        longitude,
        accuracy,
        heading,
        speed,
        altitude,
        battery_level,
        is_mocked
      } = req.body;

      const booking = await TransportationTrackingService.getBookingForTracking(booking_id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Transportation booking not found'
        });
      }

      // Check authorization
      if (!TransportationTrackingService.isAuthorizedDriver(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'You are not the authorized driver for this booking'
        });
      }

      // Check if booking is in an active tracking phase
      const inactiveStatuses = ['pending', 'cancelled', 'completed'];
      if (inactiveStatuses.includes(booking.booking_status) && booking.tracking_status === 'completed') {
        return res.status(400).json({
          success: false,
          message: `Location sharing is not allowed for booking with status '${booking.booking_status}'`
        });
      }

      const result = await TransportationTrackingService.recordLocationPing({
        bookingId: booking_id,
        driverId: req.user.id,
        latitude,
        longitude,
        accuracy,
        heading,
        speed,
        altitude,
        batteryLevel: battery_level,
        isMocked: is_mocked
      });

      return res.json({
        success: true,
        data: result,
        message: 'Location recorded successfully'
      });
    } catch (error) {
      logger.error?.('Record location error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to record location'
      });
    }
  }
);

/**
 * POST /api/transportation/driver/status
 * Transition operational tracking status
 */
router.post(
  '/status',
  authenticate,
  requireDriverOrAdmin,
  [
    body('booking_id').isInt().withMessage('Booking ID is required'),
    body('status')
      .isString()
      .trim()
      .isIn([
        'driver_departing',
        'heading_to_pickup',
        'arrived_pickup',
        'pickup_confirmed',
        'in_transit',
        'approaching_destination',
        'arrived_destination',
        'dropoff_confirmed',
        'completed'
      ])
      .withMessage('Valid tracking status required'),
    body('note').optional().isString().trim().isLength({ max: 1000 }),
    body('proof_url').optional().isString().trim().isLength({ max: 2000 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { booking_id, status, note, proof_url } = req.body;

      const booking = await TransportationTrackingService.getBookingForTracking(booking_id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Transportation booking not found'
        });
      }

      if (!TransportationTrackingService.isAuthorizedDriver(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'You are not the authorized driver for this booking'
        });
      }

      const result = await TransportationTrackingService.updateTrackingStatus({
        bookingId: booking_id,
        actorUser: req.user,
        newStatus: status,
        note: note || '',
        proofUrl: proof_url || ''
      });

      return res.json({
        success: true,
        data: result,
        message: `Trip status updated to ${status.replace(/_/g, ' ')}`
      });
    } catch (error) {
      logger.error?.('Update driver status error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update trip status'
      });
    }
  }
);

/**
 * POST /api/transportation/driver/incident
 * Report an incident during transit
 */
router.post(
  '/incident',
  authenticate,
  requireDriverOrAdmin,
  [
    body('booking_id').isInt().withMessage('Booking ID is required'),
    body('incident_type')
      .isString()
      .trim()
      .isIn(['breakdown', 'traffic_delay', 'flat_tyre', 'accident', 'weather', 'road_block', 'other'])
      .withMessage('Valid incident type required'),
    body('severity')
      .isString()
      .trim()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Severity must be low, medium, high, or critical'),
    body('description').isString().trim().notEmpty().withMessage('Incident description is required'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { booking_id, incident_type, severity, description, latitude, longitude } = req.body;

      const booking = await TransportationTrackingService.getBookingForTracking(booking_id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Transportation booking not found'
        });
      }

      if (!TransportationTrackingService.isAuthorizedDriver(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'You are not the authorized driver for this booking'
        });
      }

      const incident = await TransportationTrackingService.reportIncident({
        bookingId: booking_id,
        reportedBy: req.user,
        reporterRole: 'driver',
        incidentType: incident_type,
        severity,
        description,
        latitude,
        longitude
      });

      return res.status(201).json({
        success: true,
        data: incident,
        message: 'Operational incident logged and dispatched to control desk'
      });
    } catch (error) {
      logger.error?.('Report incident error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to report incident'
      });
    }
  }
);

/**
 * GET /api/transportation/driver/history
 * Retrieve driver trip history
 */
router.get('/history', authenticate, requireDriverOrAdmin, async (req, res) => {
  try {
    const userId = req.user.id;
    const userPhone = req.user.phone || '';
    const cleanPhone = userPhone.replace(/\D/g, '');

    const query = `
      SELECT 
        tb.*,
        ts.service_name,
        ts.service_type,
        p.title as property_title,
        p.full_address as property_address,
        u.full_name as tenant_name
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      LEFT JOIN properties p ON tb.property_id = p.id
      LEFT JOIN users u ON tb.tenant_id = u.id
      WHERE (
        tb.driver_id = $1 
        OR ($2 != '' AND REPLACE(REPLACE(tb.driver_phone, ' ', ''), '-', '') LIKE '%' || $2 || '%')
      )
      AND tb.booking_status = 'completed'
      ORDER BY tb.completed_at DESC NULLS LAST
      LIMIT 50
    `;

    let trips = [];
    try {
      const result = await db.query(query, [userId, cleanPhone]);
      trips = result.rows || [];
    } catch (e) {
      logger.warn?.('DB query trip history failed:', e.message);
    }

    return res.json({
      success: true,
      data: trips,
      message: 'Trip history retrieved successfully'
    });
  } catch (error) {
    logger.error?.('Get driver history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve trip history'
    });
  }
});

module.exports = router;
