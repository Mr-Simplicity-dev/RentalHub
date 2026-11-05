const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const FumigationTrackingService = require('../services/fumigationTrackingService');
const db = require('../config/middleware/database');
const logger = require('../config/utils/logger') || console;

// Middleware to verify team specialist authorization
const requireTeamOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Reject transportation administrators explicitly
  const transportRoles = [
    'super_transportation_admin',
    'state_transportation_admin',
    'lga_transportation_admin',
    'zonal_transportation_admin',
    'transportation_admin'
  ];
  if (transportRoles.includes(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Transportation administrators cannot access fumigation operations'
    });
  }

  return next();
};

/**
 * GET /api/fumigation/team/assigned
 * Retrieve active and assigned jobs for the logged-in fumigation specialist
 */
router.get('/assigned', authenticate, requireTeamOrAdmin, async (req, res) => {
  try {
    const userId = req.user.id;
    const userPhone = req.user.phone || '';
    const cleanPhone = userPhone.replace(/\D/g, '');

    const query = `
      SELECT 
        fcb.*,
        fcs.service_name,
        fcs.category_id,
        fcc.category_name,
        p.title as property_title,
        p.full_address as property_address,
        p.state as property_state,
        p.lga as property_lga,
        u.full_name as tenant_name,
        u.phone as tenant_phone
      FROM fumigation_cleaning_bookings fcb
      JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
      LEFT JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
      LEFT JOIN properties p ON fcb.property_id = p.id
      LEFT JOIN users u ON fcb.tenant_id = u.id
      WHERE (
        fcb.team_id = $1 
        OR ($2 != '' AND REPLACE(REPLACE(fcb.team_phone, ' ', ''), '-', '') LIKE '%' || $2 || '%')
        OR ($3 = 'super_admin' OR $3 = 'super_fumigation_admin' OR $3 = 'fumigation_admin')
      )
      AND fcb.booking_status IN ('confirmed', 'in_progress', 'pending', 'scheduled')
      ORDER BY fcb.booking_date ASC, fcb.booking_time ASC
    `;

    let jobs = [];
    try {
      const result = await db.query(query, [userId, cleanPhone, req.user.user_type]);
      jobs = result.rows || [];
    } catch (e) {
      logger.warn?.('DB query assigned fumigation jobs failed:', e.message);
    }

    return res.json({
      success: true,
      data: jobs,
      message: 'Assigned fumigation jobs retrieved successfully'
    });
  } catch (error) {
    logger.error?.('Get assigned fumigation jobs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve assigned jobs'
    });
  }
});

/**
 * GET /api/fumigation/team/jobs/:bookingId
 * Retrieve detailed job manifest and safety instructions
 */
router.get(
  '/jobs/:bookingId',
  authenticate,
  requireTeamOrAdmin,
  [param('bookingId').isInt().withMessage('Valid booking ID required')],
  validateRequest,
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const summary = await FumigationTrackingService.getTrackingSummary(bookingId, req.user);

      if (!summary) {
        return res.status(404).json({
          success: false,
          message: 'Fumigation booking not found'
        });
      }

      const booking = await FumigationTrackingService.getBookingForTracking(bookingId);
      if (!FumigationTrackingService.isAuthorizedTeam(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You are not the assigned specialist for this fumigation job'
        });
      }

      return res.json({
        success: true,
        data: summary,
        message: 'Fumigation job manifest retrieved successfully'
      });
    } catch (error) {
      logger.error?.('Get fumigation job manifest error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve job manifest'
      });
    }
  }
);

/**
 * POST /api/fumigation/team/jobs/:bookingId/status
 * Update stage (dispatched, arrived, treatment, ventilation, completed)
 * Enforces mandatory completion evidence & chemical logs!
 */
router.post(
  '/jobs/:bookingId/status',
  authenticate,
  requireTeamOrAdmin,
  [
    param('bookingId').isInt().withMessage('Valid booking ID required'),
    body('status').isString().trim().notEmpty().withMessage('Status is required'),
    body('note').optional().isString().trim(),
    body('proof_url').optional().isString().trim(),
    body('chemical_used').optional().isString().trim(),
    body('ventilation_hours').optional().isFloat({ min: 0.5, max: 72 }),
    body('safety_instructions').optional().isString().trim(),
    body('after_photos').optional().isArray()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const {
        status,
        note,
        proof_url,
        chemical_used,
        ventilation_hours,
        safety_instructions,
        after_photos,
        before_photos
      } = req.body;

      const booking = await FumigationTrackingService.getBookingForTracking(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Fumigation booking not found' });
      }

      if (!FumigationTrackingService.isAuthorizedTeam(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You cannot update status for a job not assigned to you'
        });
      }

      const updated = await FumigationTrackingService.updateTrackingStatus({
        bookingId,
        actorUser: req.user,
        newStatus: status,
        note,
        proofUrl: proof_url,
        chemicalUsed: chemical_used,
        ventilationHours: ventilation_hours ? Number(ventilation_hours) : 4.0,
        safetyInstructions: safety_instructions,
        afterPhotos: after_photos,
        beforePhotos: before_photos
      });

      return res.json({
        success: true,
        data: updated,
        message: `Fumigation job status updated to ${status}`
      });
    } catch (error) {
      logger.error?.('Update fumigation job status error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update job status'
      });
    }
  }
);

/**
 * POST /api/fumigation/team/jobs/:bookingId/ping
 * Submit live device GPS coordinates
 */
router.post(
  '/jobs/:bookingId/ping',
  authenticate,
  requireTeamOrAdmin,
  [
    param('bookingId').isInt().withMessage('Valid booking ID required'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required (-90 to 90)'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required (-180 to 180)'),
    body('accuracy').optional().isFloat({ min: 0 }),
    body('heading').optional().isFloat({ min: 0, max: 360 }),
    body('speed').optional().isFloat({ min: 0 }),
    body('altitude').optional().isFloat(),
    body('battery_level').optional().isFloat({ min: 0, max: 100 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { latitude, longitude, accuracy, heading, speed, altitude, battery_level } = req.body;

      const booking = await FumigationTrackingService.getBookingForTracking(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Fumigation booking not found' });
      }

      if (!FumigationTrackingService.isAuthorizedTeam(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You are not assigned to submit GPS telemetry for this job'
        });
      }

      const ping = await FumigationTrackingService.recordLocationPing({
        bookingId,
        teamId: req.user.id,
        latitude,
        longitude,
        accuracy,
        heading,
        speed,
        altitude,
        batteryLevel: battery_level
      });

      return res.json({
        success: true,
        data: ping,
        message: 'GPS telemetry ping recorded successfully'
      });
    } catch (error) {
      logger.error?.('Record fumigation GPS ping error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to record GPS telemetry'
      });
    }
  }
);

/**
 * POST /api/fumigation/team/jobs/:bookingId/report
 * Submit formal service report with chemical details, photos, and ventilation requirements
 */
router.post(
  '/jobs/:bookingId/report',
  authenticate,
  requireTeamOrAdmin,
  [
    param('bookingId').isInt().withMessage('Valid booking ID required'),
    body('chemical_name').isString().trim().notEmpty().withMessage('Chemical name is required'),
    body('nafdac_reg_number').optional().isString().trim(),
    body('active_ingredient').optional().isString().trim(),
    body('dilution_rate').optional().isString().trim(),
    body('quantity_applied').optional().isString().trim(),
    body('targeted_pests').optional().isArray(),
    body('target_areas').optional().isArray(),
    body('safety_gear_worn').optional().isArray(),
    body('ventilation_hours').optional().isFloat({ min: 0.5 }),
    body('before_photos').optional().isArray(),
    body('after_photos').optional().isArray(),
    body('safety_notice').optional().isString().trim(),
    body('technician_notes').optional().isString().trim()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const booking = await FumigationTrackingService.getBookingForTracking(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Fumigation booking not found' });
      }

      if (!FumigationTrackingService.isAuthorizedTeam(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You cannot submit service report for this booking'
        });
      }

      const report = await FumigationTrackingService.submitServiceReport({
        bookingId,
        technicianUser: req.user,
        chemicalName: req.body.chemical_name,
        activeIngredient: req.body.active_ingredient,
        nafdacRegNumber: req.body.nafdac_reg_number,
        dilutionRate: req.body.dilution_rate,
        quantityApplied: req.body.quantity_applied,
        targetedPests: req.body.targeted_pests || [],
        targetAreas: req.body.target_areas || [],
        safetyGearWorn: req.body.safety_gear_worn || [],
        ventilationHours: req.body.ventilation_hours || 4.0,
        beforePhotos: req.body.before_photos || [],
        afterPhotos: req.body.after_photos || [],
        safetyNotice: req.body.safety_notice,
        technicianNotes: req.body.technician_notes
      });

      return res.json({
        success: true,
        data: report,
        message: 'Fumigation service report and evidence submitted successfully'
      });
    } catch (error) {
      logger.error?.('Submit fumigation report error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to submit service report'
      });
    }
  }
);

/**
 * POST /api/fumigation/team/jobs/:bookingId/incidents
 * Report an operational exception or delay
 */
router.post(
  '/jobs/:bookingId/incidents',
  authenticate,
  requireTeamOrAdmin,
  [
    param('bookingId').isInt().withMessage('Valid booking ID required'),
    body('incident_type').isString().trim().notEmpty().withMessage('Incident type is required'),
    body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('description').isString().trim().notEmpty().withMessage('Description is required'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { incident_type, severity, description, latitude, longitude } = req.body;

      const booking = await FumigationTrackingService.getBookingForTracking(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Fumigation booking not found' });
      }

      if (!FumigationTrackingService.isAuthorizedTeam(booking, req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You are not authorized to report incidents for this job'
        });
      }

      const incident = await FumigationTrackingService.reportIncident({
        bookingId,
        reporterUser: req.user,
        incidentType: incident_type,
        severity: severity || 'medium',
        description,
        latitude,
        longitude
      });

      return res.json({
        success: true,
        data: incident,
        message: 'Operational incident reported successfully'
      });
    } catch (error) {
      logger.error?.('Report fumigation incident error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to report incident'
      });
    }
  }
);

/**
 * GET /api/fumigation/team/history
 * History of completed jobs
 */
router.get('/history', authenticate, requireTeamOrAdmin, async (req, res) => {
  try {
    const userId = req.user.id;
    const userPhone = req.user.phone || '';
    const cleanPhone = userPhone.replace(/\D/g, '');

    const query = `
      SELECT 
        fcb.*,
        fcs.service_name,
        p.title as property_title,
        p.full_address as property_address,
        u.full_name as tenant_name
      FROM fumigation_cleaning_bookings fcb
      JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
      LEFT JOIN properties p ON fcb.property_id = p.id
      LEFT JOIN users u ON fcb.tenant_id = u.id
      WHERE (
        fcb.team_id = $1 
        OR ($2 != '' AND REPLACE(REPLACE(fcb.team_phone, ' ', ''), '-', '') LIKE '%' || $2 || '%')
      )
      AND fcb.booking_status IN ('completed', 'cancelled')
      ORDER BY fcb.booking_date DESC
      LIMIT 100
    `;

    let history = [];
    try {
      const result = await db.query(query, [userId, cleanPhone]);
      history = result.rows || [];
    } catch (e) {}

    return res.json({
      success: true,
      data: history,
      message: 'Fumigation job history retrieved successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve job history'
    });
  }
});

module.exports = router;
