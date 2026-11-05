const express = require('express');
const router = express.Router();
const { param, body } = require('express-validator');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const FumigationTrackingService = require('../services/fumigationTrackingService');
const db = require('../config/middleware/database');
const logger = require('../config/utils/logger') || console;

const FUMIGATION_ADMIN_ROLES = new Set([
  'admin',
  'lga_admin',
  'super_admin',
  'state_admin',
  'state_financial_admin',
  'zonal_admin',
  'zonal_fumigation_admin',
  'fumigation_admin',
  'lga_fumigation_admin',
  'state_fumigation_admin',
  'super_fumigation_admin',
]);

const requireFumigationAdminAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Strict role check: Super Transportation Admin has NO fumigation administrative authority
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
      message: 'Access denied: Transportation administrators do not have fumigation oversight access'
    });
  }

  if (!FUMIGATION_ADMIN_ROLES.has(req.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Fumigation admin access only' });
  }

  return next();
};

router.use(authenticate);
router.use(requireFumigationAdminAccess);

/**
 * GET /api/fumigation-admin/live-tracking
 * Retrieve all active fumigation teams & bookings scoped strictly to the administrator's jurisdiction
 */
router.get('/live-tracking', async (req, res) => {
  try {
    const fleet = await FumigationTrackingService.getLiveFleet(req.user);
    return res.json({
      success: true,
      data: fleet,
      count: fleet.length,
      message: 'Active fumigation fleet retrieved successfully'
    });
  } catch (error) {
    logger.error?.('Get fumigation live fleet error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch live fleet' });
  }
});

/**
 * GET /api/fumigation-admin/incidents
 * Retrieve operational incidents and delays
 */
router.get('/incidents', async (req, res) => {
  try {
    const query = `
      SELECT 
        fi.*,
        fcb.booking_reference,
        fcb.team_name,
        p.title as property_title,
        p.state as property_state,
        p.lga as property_lga,
        u.full_name as reported_by_name
      FROM fumigation_incidents fi
      JOIN fumigation_cleaning_bookings fcb ON fi.booking_id = fcb.id
      LEFT JOIN properties p ON fcb.property_id = p.id
      LEFT JOIN users u ON fi.reported_by = u.id
      ORDER BY fi.created_at DESC
      LIMIT 100
    `;

    let incidents = [];
    try {
      const result = await db.query(query);
      incidents = result.rows || [];
    } catch (e) {}

    return res.json({
      success: true,
      data: incidents,
      message: 'Fumigation incidents retrieved successfully'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch incidents' });
  }
});

/**
 * PATCH /api/fumigation-admin/incidents/:incidentId/resolve
 * Resolve an operational incident with resolution note
 */
router.patch(
  '/incidents/:incidentId/resolve',
  [
    param('incidentId').isInt().withMessage('Valid incident ID required'),
    body('resolution_note').isString().trim().notEmpty().withMessage('Resolution note is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { incidentId } = req.params;
      const { resolution_note } = req.body;

      const resolved = await FumigationTrackingService.resolveIncident(
        incidentId,
        req.user,
        resolution_note
      );

      return res.json({
        success: true,
        data: resolved,
        message: 'Fumigation incident resolved successfully'
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
);

/**
 * GET /api/fumigation-admin/bookings/:bookingId/pings
 * Retrieve breadcrumb GPS history for forensic audit
 */
router.get(
  '/bookings/:bookingId/pings',
  [param('bookingId').isInt().withMessage('Valid booking ID required')],
  validateRequest,
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      let pings = [];
      try {
        const result = await db.query(
          `SELECT * FROM fumigation_tracking_pings
           WHERE booking_id = $1
           ORDER BY recorded_at ASC`,
          [bookingId]
        );
        pings = result.rows || [];
      } catch (e) {}

      return res.json({
        success: true,
        data: pings,
        message: 'Breadcrumb pings retrieved successfully'
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * GET /api/fumigation-admin/zonal-overview
 * Aggregate overview across the 6 geopolitical zones
 */
router.get('/zonal-overview', async (req, res) => {
  try {
    const zones = await FumigationTrackingService.getZonalOverview();
    return res.json({
      success: true,
      data: zones,
      message: 'Zonal fumigation overview retrieved successfully'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
