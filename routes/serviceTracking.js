const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const db = require('../config/middleware/database');
const logger = require('../config/utils/logger') || console;
const TransportationTrackingService = require('../services/transportationTrackingService');
const FumigationTrackingService = require('../services/fumigationTrackingService');

/**
 * GET /api/service-tracking/my-services
 * Retrieve unified listing of all requested services (Transportation & Fumigation)
 */
router.get('/my-services', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.id;
    const services = [];

    // 1. Fetch Transportation Bookings
    try {
      const transpQuery = `
        SELECT 
          tb.id,
          tb.booking_reference,
          tb.booking_status,
          tb.tracking_status,
          tb.booking_date,
          tb.booking_time,
          tb.driver_name,
          tb.driver_phone,
          tb.vehicle_number,
          tb.is_tracking_active,
          tb.eta_destination_minutes,
          tb.distance_remaining_km,
          ts.service_name,
          ts.service_type,
          p.title as property_title,
          p.full_address as property_address
        FROM transportation_bookings tb
        JOIN transportation_services ts ON tb.service_id = ts.id
        LEFT JOIN properties p ON tb.property_id = p.id
        WHERE tb.tenant_id = $1
        ORDER BY tb.booking_date DESC, tb.created_at DESC
        LIMIT 50
      `;
      const transpRes = await db.query(transpQuery, [tenantId]);
      for (const row of transpRes.rows || []) {
        services.push({
          id: row.id,
          service_type: 'transportation',
          service_badge: 'Transportation',
          service_name: row.service_name || 'Vehicle & Haulage Transport',
          reference: row.booking_reference || `ARH-TRP-${String(row.id).padStart(6, '0')}`,
          booking_status: row.booking_status,
          tracking_status: row.tracking_status || 'unassigned',
          booking_date: row.booking_date,
          booking_time: row.booking_time,
          property_title: row.property_title || 'Destination Property',
          property_address: row.property_address,
          assigned_contact: {
            name: row.driver_name,
            phone: row.driver_phone,
            vehicle: row.vehicle_number,
            role_label: 'Assigned Driver'
          },
          is_active: ['in_progress', 'confirmed'].includes(row.booking_status) && row.tracking_status !== 'completed',
          tracking_url: `/transportation/bookings/${row.id}`,
          distance_remaining_km: row.distance_remaining_km,
          eta_minutes: row.eta_destination_minutes
        });
      }
    } catch (e) {
      logger.warn?.('Fetch transportation bookings in service tracking failed:', e.message);
    }

    // 2. Fetch Fumigation Bookings
    try {
      const fumigQuery = `
        SELECT 
          fcb.id,
          fcb.booking_reference,
          fcb.booking_status,
          fcb.tracking_status,
          fcb.booking_date,
          fcb.booking_time,
          fcb.team_name,
          fcb.team_phone,
          fcb.team_vehicle_plate,
          fcb.is_tracking_active,
          fcb.chemical_used,
          fcb.ventilation_hours_required,
          fcb.reentry_permitted_at,
          fcb.distance_remaining_km,
          fcb.eta_arrival_minutes,
          fcs.service_name,
          p.title as property_title,
          p.full_address as property_address
        FROM fumigation_cleaning_bookings fcb
        JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
        LEFT JOIN properties p ON fcb.property_id = p.id
        WHERE fcb.tenant_id = $1
        ORDER BY fcb.booking_date DESC, fcb.created_at DESC
        LIMIT 50
      `;
      const fumigRes = await db.query(fumigQuery, [tenantId]);
      for (const row of fumigRes.rows || []) {
        services.push({
          id: row.id,
          service_type: 'fumigation',
          service_badge: 'Fumigation & Pest Control',
          service_name: row.service_name || 'Professional Pest Extermination',
          reference: row.booking_reference || `ARH-FC-${String(row.id).padStart(6, '0')}`,
          booking_status: row.booking_status,
          tracking_status: row.tracking_status || 'unassigned',
          booking_date: row.booking_date,
          booking_time: row.booking_time,
          property_title: row.property_title || 'Treatment Property',
          property_address: row.property_address,
          assigned_contact: {
            name: row.team_name,
            phone: row.team_phone,
            vehicle: row.team_vehicle_plate,
            role_label: 'Fumigation Squad'
          },
          is_active: ['in_progress', 'confirmed', 'scheduled'].includes(row.booking_status) && row.tracking_status !== 'service_completed',
          tracking_url: `/fumigation-cleaning/bookings/${row.id}`,
          distance_remaining_km: row.distance_remaining_km,
          eta_minutes: row.eta_arrival_minutes,
          chemical_used: row.chemical_used,
          reentry_permitted_at: row.reentry_permitted_at,
          ventilation_hours_required: row.ventilation_hours_required
        });
      }
    } catch (e) {
      logger.warn?.('Fetch fumigation bookings in service tracking failed:', e.message);
    }

    // Sort combined by date descending
    services.sort((a, b) => new Date(b.booking_date || 0) - new Date(a.booking_date || 0));

    return res.json({
      success: true,
      data: services,
      count: services.length,
      active_count: services.filter((s) => s.is_active).length,
      message: 'Unified service tracking list retrieved successfully'
    });
  } catch (error) {
    logger.error?.('Get my services error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve services' });
  }
});

/**
 * GET /api/service-tracking/:serviceType/:bookingId
 * Unified service detail telemetry router
 */
router.get('/:serviceType/:bookingId', authenticate, async (req, res) => {
  try {
    const { serviceType, bookingId } = req.params;
    const numId = Number(bookingId);

    if (serviceType === 'transportation') {
      const summary = await TransportationTrackingService.getTrackingSummary(numId, req.user);
      if (!summary) return res.status(404).json({ success: false, message: 'Transportation booking not found' });
      return res.json({ success: true, service_type: 'transportation', data: summary });
    }

    if (serviceType === 'fumigation' || serviceType === 'fumigation-cleaning') {
      const summary = await FumigationTrackingService.getTrackingSummary(numId, req.user);
      if (!summary) return res.status(404).json({ success: false, message: 'Fumigation booking not found' });
      return res.json({ success: true, service_type: 'fumigation', data: summary });
    }

    return res.status(400).json({ success: false, message: 'Unsupported service type' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
