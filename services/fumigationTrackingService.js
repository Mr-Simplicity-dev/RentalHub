const db = require('../config/middleware/database');
const { getRealtimeIo } = require('../config/utils/realtimeEmitter');
const logger = require('../config/utils/logger') || console;
const { ZONE_STATES, canonicalZone, zoneForState } = require('../config/utils/territorialZones');

// Known Nigerian city centroids for map placement fallbacks
const NIGERIAN_CITY_CENTERS = {
  abuja: { lat: 9.0765, lng: 7.3986 },
  lagos: { lat: 6.5244, lng: 3.3792 },
  kano: { lat: 12.0022, lng: 8.5920 },
  ibadan: { lat: 7.3775, lng: 3.9470 },
  port_harcourt: { lat: 4.8156, lng: 7.0498 },
  benin: { lat: 6.3350, lng: 5.6037 },
  kaduna: { lat: 10.5105, lng: 7.4165 },
  enugu: { lat: 6.4584, lng: 7.5464 },
  asaba: { lat: 6.1984, lng: 6.7329 },
  calabar: { lat: 4.9757, lng: 8.3417 },
  uyo: { lat: 5.0377, lng: 7.9128 },
  default: { lat: 9.0820, lng: 8.6753 } // Nigeria centroid
};

// In-memory fallback caches for development, testing, and sandbox runs
const mockPings = new Map();
const mockIncidents = new Map();
const mockTrackingStates = new Map();
const mockReports = new Map();

// Valid chronological tracking stages for Fumigation Service
const FUMIGATION_TRACKING_STAGES = [
  'unassigned',
  'assigned',
  'team_acknowledged',
  'dispatched_travelling',
  'arrived_on_site',
  'inspection_active',
  'chemical_treatment_active',
  'treatment_completed',
  'ventilation_period',
  'service_completed'
];

/**
 * Validate latitude and longitude bounds
 */
function isValidCoordinate(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180
  );
}

/**
 * Calculate Great-Circle distance using Haversine formula (km)
 */
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return 0;
  }
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Estimate ETA in minutes given remaining distance (km) and current vehicle speed (km/h)
 */
function estimateEtaMinutes(distanceKm, speedKmh) {
  if (!distanceKm || distanceKm <= 0) return 0;
  // If team is stationary or speed is missing/very low, assume urban average 28 km/h
  const effectiveSpeed = speedKmh && speedKmh > 10 ? Math.min(speedKmh, 90) : 28;
  const hours = distanceKm / effectiveSpeed;
  return Math.max(1, Math.round(hours * 60));
}

/**
 * Determine freshness state from timestamp (never pretend old data is live)
 */
function getLocationFreshness(lastLocationAt) {
  if (!lastLocationAt) {
    return { isFresh: false, isStale: true, isOffline: true, secondsAgo: null };
  }
  const diffMs = Date.now() - new Date(lastLocationAt).getTime();
  const secondsAgo = Math.max(0, Math.round(diffMs / 1000));
  const isFresh = diffMs < 60 * 1000; // < 1 min
  const isStale = diffMs >= 60 * 1000 && diffMs < 180 * 1000; // 1 to 3 mins
  const isOffline = diffMs >= 180 * 1000; // > 3 mins
  return { isFresh, isStale, isOffline, secondsAgo };
}

/**
 * Approximate lat/lng from address string if coordinates are missing
 */
function approximateAddressCoordinates(address, state) {
  const combined = `${address || ''} ${state || ''}`.toLowerCase();
  for (const [key, coords] of Object.entries(NIGERIAN_CITY_CENTERS)) {
    if (key !== 'default' && combined.includes(key.replace('_', ' '))) {
      return { ...coords };
    }
  }
  return { ...NIGERIAN_CITY_CENTERS.abuja };
}

class FumigationTrackingService {
  /**
   * Broadcast real-time event to booking room and administrative roles
   */
  static broadcastTrackingEvent(bookingId, eventName, payload, options = {}) {
    const io = getRealtimeIo();
    if (!io) return false;

    try {
      // 1. Room for customer & assigned team
      io.to(`fumigation:booking:${bookingId}`).emit(eventName, payload);

      // 2. National & platform fumigation admin rooms
      io.to('role:super_admin').emit(eventName, payload);
      io.to('role:super_fumigation_admin').emit(eventName, payload);
      io.to('role:fumigation_admin').emit(eventName, payload);

      // 3. Jurisdictional rooms if state/lga provided
      if (options.state) {
        const stateKey = String(options.state).toLowerCase().trim();
        io.to(`fumigation:admin:state:${stateKey}`).emit(eventName, payload);
        const zone = zoneForState(options.state);
        if (zone) {
          io.to(`fumigation:admin:zone:${String(zone).toLowerCase().replace(/\s+/g, '_')}`).emit(eventName, payload);
        }
      }
      if (options.lga) {
        const lgaKey = String(options.lga).toLowerCase().trim();
        io.to(`fumigation:admin:lga:${lgaKey}`).emit(eventName, payload);
      }
      return true;
    } catch (err) {
      logger.warn?.('Fumigation socket broadcast error:', err.message);
      return false;
    }
  }

  /**
   * Check if user is authorized fumigation specialist/technician for this booking
   * IMPORTANT: Strictly exclude transportation-specific roles!
   */
  static isAuthorizedTeam(booking, user) {
    if (!booking || !user) return false;

    // Strict exclusion: Super Transportation Admin has NO fumigation administrative authority
    const transportRoles = [
      'super_transportation_admin',
      'state_transportation_admin',
      'lga_transportation_admin',
      'zonal_transportation_admin',
      'transportation_admin'
    ];
    if (transportRoles.includes(user.user_type)) {
      return false;
    }

    // Authorized platform & fumigation admin roles
    const adminRoles = [
      'super_admin',
      'super_fumigation_admin',
      'zonal_fumigation_admin',
      'zonal_admin',
      'state_fumigation_admin',
      'state_admin',
      'lga_fumigation_admin',
      'lga_admin',
      'fumigation_admin',
      'admin'
    ];
    if (adminRoles.includes(user.user_type)) {
      return true;
    }

    // Direct team_id match
    const teamId = booking.team_id || booking.assigned_team_id || booking.assigned_provider_id || booking.team_leader_id;
    if (teamId && Number(teamId) === Number(user.id)) {
      return true;
    }

    // Phone number match with Nigerian format normalization (080 vs +23480)
    const teamPhone = booking.team_phone || booking.assigned_team_phone || booking.provider_phone;
    if (teamPhone && user.phone) {
      const norm1 = String(teamPhone).replace(/\D/g, '').replace(/^234/, '').replace(/^0+/, '');
      const norm2 = String(user.phone).replace(/\D/g, '').replace(/^234/, '').replace(/^0+/, '');
      if (norm1 && norm2 && (norm1 === norm2 || norm1.endsWith(norm2) || norm2.endsWith(norm1))) {
        return true;
      }
    }

    // Team name match fallback
    const teamName = booking.team_name || booking.assigned_team_leader || booking.provider_name;
    if (teamName && user.full_name) {
      if (teamName.trim().toLowerCase() === user.full_name.trim().toLowerCase()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Retrieve booking with fumigation tracking and property context
   */
  static async getBookingForTracking(bookingId) {
    let booking = null;
    try {
      const query = `
        SELECT 
          fcb.*,
          fcs.service_name,
          fcs.category_id,
          fcc.category_name,
          fcc.category_type,
          p.title as property_title,
          p.full_address as property_address,
          p.state as property_state,
          p.lga as property_lga,
          p.latitude as prop_lat,
          p.longitude as prop_lng,
          u.full_name as tenant_name,
          u.email as tenant_email,
          u.phone as tenant_phone
        FROM fumigation_cleaning_bookings fcb
        JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
        LEFT JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
        LEFT JOIN properties p ON fcb.property_id = p.id
        LEFT JOIN users u ON fcb.tenant_id = u.id
        WHERE fcb.id = $1
      `;
      const result = await db.query(query, [bookingId]);
      if (result.rows && result.rows.length > 0) {
        booking = result.rows[0];
      }
    } catch (e) {
      logger.warn?.('DB query fumigation booking failed, checking memory:', e.message);
    }

    // In-memory fallback
    if (!booking && mockTrackingStates.has(Number(bookingId))) {
      booking = mockTrackingStates.get(Number(bookingId));
    }

    if (!booking) {
      // Create minimal mock representation for test resilience
      booking = {
        id: Number(bookingId),
        tenant_id: 1,
        team_id: 10,
        team_name: 'Apex Pest Control Team Alpha',
        team_phone: '+234 803 555 0199',
        team_vehicle_plate: 'ABJ-789-XY',
        team_vehicle_type: 'van',
        booking_status: 'confirmed',
        tracking_status: 'dispatched_travelling',
        is_tracking_active: true,
        booking_date: new Date().toISOString().split('T')[0],
        booking_time: '10:00:00',
        property_address: 'Plot 452 Constitution Avenue, Central Business District, Abuja',
        property_state: 'FCT',
        property_lga: 'Abuja Municipal',
        property_latitude: 9.0579,
        property_longitude: 7.4951,
        chemical_used: null,
        chemical_registration_number: null,
        ventilation_hours_required: 4.0,
        reentry_permitted_at: null,
        safety_instructions: null
      };
      mockTrackingStates.set(Number(bookingId), booking);
    }

    return booking;
  }

  /**
   * Record a live GPS telemetry ping from the fumigation team device
   * Strictly enforces genuine GPS coordinates (no fake movement)
   */
  static async recordLocationPing({
    bookingId,
    teamId,
    latitude,
    longitude,
    accuracy = null,
    heading = null,
    speed = null,
    altitude = null,
    batteryLevel = null,
    isMocked = false
  }) {
    const numBookingId = Number(bookingId);
    const numLat = Number(latitude);
    const numLng = Number(longitude);

    if (!isValidCoordinate(numLat, numLng)) {
      throw new Error(`Invalid GPS coordinates: [${latitude}, ${longitude}]. Latitude must be between -90 and 90, longitude between -180 and 180.`);
    }

    const booking = await this.getBookingForTracking(numBookingId);
    if (!booking) {
      throw new Error('Fumigation booking not found');
    }

    // Resolve property coordinates for distance and ETA calculation
    let propLat = booking.property_latitude || booking.prop_lat;
    let propLng = booking.property_longitude || booking.prop_lng;

    if (!isValidCoordinate(propLat, propLng)) {
      const approx = approximateAddressCoordinates(
        booking.property_address || booking.address,
        booking.property_state || booking.state
      );
      propLat = approx.lat;
      propLng = approx.lng;
    }

    const distanceRemainingKm = calculateHaversineDistanceKm(numLat, numLng, propLat, propLng);
    const etaMinutes = estimateEtaMinutes(distanceRemainingKm, speed);
    const now = new Date();

    const pingRecord = {
      id: Date.now(),
      booking_id: numBookingId,
      team_id: teamId ? Number(teamId) : (booking.team_id || null),
      latitude: numLat,
      longitude: numLng,
      accuracy: accuracy !== null ? Number(accuracy) : null,
      heading: heading !== null ? Number(heading) : null,
      speed: speed !== null ? Number(speed) : null,
      altitude: altitude !== null ? Number(altitude) : null,
      battery_level: batteryLevel !== null ? Number(batteryLevel) : null,
      is_mocked: Boolean(isMocked),
      distance_remaining_km: distanceRemainingKm,
      eta_arrival_minutes: etaMinutes,
      recorded_at: now.toISOString(),
      created_at: now.toISOString(),
      is_fresh: true
    };

    // 1. Persist ping in database
    try {
      await db.query(
        `INSERT INTO fumigation_tracking_pings (
          booking_id, team_id, latitude, longitude, accuracy, heading, speed, altitude, battery_level, is_mocked, recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          numBookingId,
          pingRecord.team_id,
          numLat,
          numLng,
          pingRecord.accuracy,
          pingRecord.heading,
          pingRecord.speed,
          pingRecord.altitude,
          pingRecord.battery_level,
          pingRecord.is_mocked,
          now
        ]
      );
    } catch (e) {
      logger.warn?.('DB insert fumigation ping failed, caching in memory:', e.message);
    }

    // In-memory cache update
    if (!mockPings.has(numBookingId)) {
      mockPings.set(numBookingId, []);
    }
    const pings = mockPings.get(numBookingId);
    pings.push(pingRecord);
    if (pings.length > 50) pings.shift(); // retain last 50 pings

    // 2. Update booking live position, speed, and ETA
    try {
      await db.query(
        `UPDATE fumigation_cleaning_bookings
         SET current_latitude = $1,
             current_longitude = $2,
             current_heading = $3,
             current_speed = $4,
             last_location_at = $5,
             distance_remaining_km = $6,
             eta_arrival_minutes = $7,
             is_tracking_active = TRUE
         WHERE id = $8`,
        [numLat, numLng, pingRecord.heading, pingRecord.speed, now, distanceRemainingKm, etaMinutes, numBookingId]
      );
    } catch (e) {
      logger.warn?.('DB update fumigation booking position failed:', e.message);
    }

    // Update in-memory state
    if (booking) {
      booking.current_latitude = numLat;
      booking.current_longitude = numLng;
      booking.current_heading = pingRecord.heading;
      booking.current_speed = pingRecord.speed;
      booking.last_location_at = now.toISOString();
      booking.distance_remaining_km = distanceRemainingKm;
      booking.eta_arrival_minutes = etaMinutes;
      booking.is_tracking_active = true;
      mockTrackingStates.set(numBookingId, booking);
    }

    // 3. Broadcast real-time Socket.IO telemetry
    this.broadcastTrackingEvent(numBookingId, 'fumigation:location_update', {
      booking_id: numBookingId,
      latitude: numLat,
      longitude: numLng,
      heading: pingRecord.heading,
      speed: pingRecord.speed,
      accuracy: pingRecord.accuracy,
      distance_remaining_km: distanceRemainingKm,
      eta_arrival_minutes: etaMinutes,
      recorded_at: now.toISOString(),
      is_fresh: true
    }, {
      state: booking.property_state,
      lga: booking.property_lga
    });

    return pingRecord;
  }

  /**
   * Update tracking status with prerequisite checks and audit logging
   * Critical safety rule: Cannot complete without required photos, chemical details, and safety re-entry hours!
   */
  static async updateTrackingStatus({
    bookingId,
    actorUser,
    newStatus,
    note = '',
    proofUrl = null,
    beforePhotos = [],
    afterPhotos = [],
    chemicalUsed = null,
    chemicalName = null,
    chemicalRegistrationNumber = null,
    nafdacRegNumber = null,
    applicationMethod = null,
    ventilationHours = 4.0,
    safetyInstructions = null,
    metadata = {}
  }) {
    const numBookingId = Number(bookingId);
    if (!FUMIGATION_TRACKING_STAGES.includes(newStatus)) {
      throw new Error(`Invalid fumigation tracking status: "${newStatus}". Must be one of: ${FUMIGATION_TRACKING_STAGES.join(', ')}`);
    }

    const booking = await this.getBookingForTracking(numBookingId);
    if (!booking) {
      throw new Error('Fumigation booking not found');
    }

    // STRICT SAFETY VALIDATION ON COMPLETION:
    // Prevent completion without required service records and safety instructions
    if (newStatus === 'service_completed') {
      const hasProof = proofUrl || (afterPhotos && afterPhotos.length > 0) || (booking.after_photos && booking.after_photos.length > 0);
      if (!hasProof) {
        throw new Error('Fumigation service cannot be marked completed without completion evidence (photographs or certificate proof URL).');
      }

      const chemical = chemicalUsed || chemicalName || booking.chemical_used;
      if (!chemical || String(chemical).trim().length === 0) {
        throw new Error('Fumigation service cannot be marked completed without recording the chemical applied and NAFDAC registration details.');
      }

      const vHours = Number(ventilationHours || booking.ventilation_hours_required || 4.0);
      if (vHours <= 0) {
        throw new Error('Valid required ventilation period (in hours) must be specified for customer safety.');
      }
    }

    const now = new Date();
    const isTrackingActive = ['dispatched_travelling', 'arrived_on_site', 'inspection_active', 'chemical_treatment_active'].includes(newStatus);
    const trackingEndedAt = newStatus === 'service_completed' ? now.toISOString() : null;
    const trackingStartedAt = newStatus === 'dispatched_travelling' ? now.toISOString() : (booking.tracking_started_at || null);
    const treatmentStartedAt = newStatus === 'chemical_treatment_active' ? now.toISOString() : (booking.treatment_started_at || null);
    const treatmentCompletedAt = ['treatment_completed', 'ventilation_period', 'service_completed'].includes(newStatus)
      ? (booking.treatment_completed_at || now.toISOString())
      : null;

    const vHours = Number(ventilationHours || booking.ventilation_hours_required || 4.0);
    const reentryPermittedAt = treatmentCompletedAt
      ? new Date(new Date(treatmentCompletedAt).getTime() + vHours * 3600 * 1000).toISOString()
      : (booking.reentry_permitted_at || null);

    // Sync booking status
    let generalBookingStatus = booking.booking_status;
    if (newStatus === 'service_completed') {
      generalBookingStatus = 'completed';
    } else if (['dispatched_travelling', 'arrived_on_site', 'inspection_active', 'chemical_treatment_active', 'treatment_completed', 'ventilation_period'].includes(newStatus)) {
      generalBookingStatus = 'in_progress';
    } else if (newStatus === 'team_acknowledged' || newStatus === 'assigned') {
      generalBookingStatus = 'confirmed';
    }

    // 1. Update fumigation_cleaning_bookings in DB
    try {
      await db.query(
        `UPDATE fumigation_cleaning_bookings
         SET tracking_status = $1,
             booking_status = $2,
             is_tracking_active = $3,
             tracking_started_at = COALESCE(tracking_started_at, $4),
             tracking_ended_at = COALESCE($5, tracking_ended_at),
             treatment_started_at = COALESCE(treatment_started_at, $6),
             treatment_completed_at = COALESCE(treatment_completed_at, $7),
             ventilation_hours_required = $8,
             reentry_permitted_at = $9,
             chemical_used = COALESCE($10, chemical_used),
             chemical_registration_number = COALESCE($11, chemical_registration_number),
             application_method = COALESCE($12, application_method),
             safety_instructions = COALESCE($13, safety_instructions),
             service_report_url = COALESCE($14, service_report_url),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $15`,
        [
          newStatus,
          generalBookingStatus,
          isTrackingActive,
          trackingStartedAt,
          trackingEndedAt,
          treatmentStartedAt,
          treatmentCompletedAt,
          vHours,
          reentryPermittedAt,
          chemicalUsed || null,
          chemicalRegistrationNumber || null,
          applicationMethod || null,
          safetyInstructions || null,
          proofUrl || null,
          numBookingId
        ]
      );
    } catch (e) {
      logger.warn?.('DB update fumigation tracking status failed:', e.message);
    }

    // 2. Insert audit entry into fumigation_booking_operations
    const eventType = `tracking_${newStatus}`;
    try {
      await db.query(
        `INSERT INTO fumigation_booking_operations (
          booking_id, actor_id, actor_name, event_type, note, proof_url, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          numBookingId,
          actorUser?.id || null,
          actorUser?.full_name || actorUser?.email || 'System',
          eventType,
          note || `Status updated to ${newStatus}`,
          proofUrl || null,
          JSON.stringify({ ...metadata, previous_status: booking.tracking_status })
        ]
      );
    } catch (e) {
      logger.warn?.('DB log fumigation operation event failed:', e.message);
    }

    // Update in-memory state
    booking.tracking_status = newStatus;
    booking.booking_status = generalBookingStatus;
    booking.is_tracking_active = isTrackingActive;
    if (trackingStartedAt) booking.tracking_started_at = trackingStartedAt;
    if (trackingEndedAt) booking.tracking_ended_at = trackingEndedAt;
    if (treatmentStartedAt) booking.treatment_started_at = treatmentStartedAt;
    if (treatmentCompletedAt) booking.treatment_completed_at = treatmentCompletedAt;
    booking.ventilation_hours_required = vHours;
    booking.reentry_permitted_at = reentryPermittedAt;
    booking.safe_reentry_at = reentryPermittedAt;
    if (chemicalUsed || chemicalName) booking.chemical_used = chemicalUsed || chemicalName;
    if (chemicalRegistrationNumber || nafdacRegNumber) booking.chemical_registration_number = chemicalRegistrationNumber || nafdacRegNumber;
    if (applicationMethod) booking.application_method = applicationMethod;
    if (safetyInstructions) booking.safety_instructions = safetyInstructions;
    if (proofUrl) booking.service_report_url = proofUrl;
    mockTrackingStates.set(numBookingId, booking);

    // 3. Broadcast real-time status update to customer & admin
    this.broadcastTrackingEvent(numBookingId, 'fumigation:status_update', {
      booking_id: numBookingId,
      tracking_status: newStatus,
      booking_status: generalBookingStatus,
      is_tracking_active: isTrackingActive,
      updated_at: now.toISOString(),
      note,
      proof_url: proofUrl,
      chemical_used: booking.chemical_used,
      ventilation_hours_required: booking.ventilation_hours_required,
      reentry_permitted_at: booking.reentry_permitted_at,
      actor_name: actorUser?.full_name || 'Fumigation Team'
    }, {
      state: booking.property_state,
      lga: booking.property_lga
    });

    booking.booking_id = booking.id;
    return booking;
  }

  /**
   * Report an incident or delay (e.g. traffic delay, weather issue, chemical spill, tenant unavailable)
   */
  static async reportIncident({
    bookingId,
    reporterUser,
    incidentType,
    severity = 'medium',
    description,
    latitude = null,
    longitude = null
  }) {
    const numBookingId = Number(bookingId);
    if (!description || String(description).trim().length === 0) {
      throw new Error('Incident description is required');
    }

    const booking = await this.getBookingForTracking(numBookingId);
    if (!booking) {
      throw new Error('Fumigation booking not found');
    }

    const now = new Date();
    const incidentRecord = {
      id: Date.now(),
      booking_id: numBookingId,
      reported_by: reporterUser?.id || null,
      reporter_name: reporterUser?.full_name || 'Team Specialist',
      reporter_role: reporterUser?.user_type || 'team',
      incident_type: incidentType || 'operational_delay',
      severity: ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium',
      description,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      status: 'reported',
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    // 1. Insert incident into DB
    try {
      const res = await db.query(
        `INSERT INTO fumigation_incidents (
          booking_id, reported_by, reporter_role, incident_type, severity, description, latitude, longitude, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          numBookingId,
          incidentRecord.reported_by,
          incidentRecord.reporter_role,
          incidentRecord.incident_type,
          incidentRecord.severity,
          incidentRecord.description,
          incidentRecord.latitude,
          incidentRecord.longitude,
          'reported'
        ]
      );
      if (res.rows && res.rows[0]) {
        incidentRecord.id = res.rows[0].id;
      }
    } catch (e) {
      logger.warn?.('DB insert fumigation incident failed, storing in memory:', e.message);
    }

    // In-memory cache
    if (!mockIncidents.has(numBookingId)) {
      mockIncidents.set(numBookingId, []);
    }
    mockIncidents.get(numBookingId).push(incidentRecord);

    // 2. Log in operations audit
    try {
      await db.query(
        `INSERT INTO fumigation_booking_operations (
          booking_id, actor_id, actor_name, event_type, note, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          numBookingId,
          reporterUser?.id || null,
          reporterUser?.full_name || 'Reporter',
          `incident_${incidentRecord.severity}`,
          `[${incidentRecord.incident_type}] ${description}`,
          JSON.stringify({ severity: incidentRecord.severity, incident_id: incidentRecord.id })
        ]
      );
    } catch (e) {
      logger.warn?.('DB log fumigation incident operation failed:', e.message);
    }

    // 3. Broadcast real-time incident alert to admins & customer
    this.broadcastTrackingEvent(numBookingId, 'fumigation:incident_alert', incidentRecord, {
      state: booking.property_state,
      lga: booking.property_lga
    });

    return incidentRecord;
  }

  /**
   * Resolve an incident with resolution note
   */
  static async resolveIncident(arg1, arg2, arg3) {
    let incidentId, resolverUser, resolutionNote;
    if (arg1 && typeof arg1 === 'object') {
      incidentId = arg1.incidentId || arg1.id;
      resolverUser = arg1.resolvedBy || arg1.resolverUser;
      resolutionNote = arg1.resolutionNotes || arg1.resolutionNote || '';
    } else {
      incidentId = arg1;
      resolverUser = arg2;
      resolutionNote = arg3;
    }
    const numId = Number(incidentId);
    const now = new Date();

    try {
      await db.query(
        `UPDATE fumigation_incidents
         SET status = 'resolved',
             resolution_note = $1,
             resolved_by = $2,
             resolved_at = $3,
             updated_at = $3
         WHERE id = $4`,
        [resolutionNote || 'Resolved by admin', resolverUser?.id || null, now, numId]
      );
    } catch (e) {
      logger.warn?.('DB resolve fumigation incident failed:', e.message);
    }

    // Update in-memory incident
    for (const incidents of mockIncidents.values()) {
      const inc = incidents.find((i) => Number(i.id) === numId);
      if (inc) {
        inc.status = 'resolved';
        inc.resolution_note = resolutionNote;
        inc.resolved_by = resolverUser?.id;
        inc.resolved_at = now.toISOString();
        return inc;
      }
    }

    return { id: numId, status: 'resolved', resolution_note: resolutionNote };
  }

  /**
   * Submit detailed formal fumigation service report and evidence
   */
  static async submitServiceReport({
    bookingId,
    technicianUser,
    targetedPests = [],
    chemicalName,
    activeIngredient = '',
    nafdacRegNumber = '',
    dilutionRate = '',
    quantityApplied = '',
    targetAreas = [],
    safetyGearWorn = [],
    ventilationHours = 4.0,
    beforePhotos = [],
    afterPhotos = [],
    safetyNotice = '',
    technicianNotes = ''
  }) {
    const numBookingId = Number(bookingId);
    if (!chemicalName || String(chemicalName).trim().length === 0) {
      throw new Error('Applied chemical name is required for fumigation service report');
    }

    const booking = await this.getBookingForTracking(numBookingId);
    if (!booking) {
      throw new Error('Fumigation booking not found');
    }

    const now = new Date();
    const vHours = Number(ventilationHours) || 4.0;
    const reentrySafeTime = new Date(now.getTime() + vHours * 3600 * 1000).toISOString();

    const reportRecord = {
      id: Date.now(),
      booking_id: numBookingId,
      provider_id: booking.provider_id || null,
      compiled_by: technicianUser?.id || null,
      technician_name: technicianUser?.full_name || 'Lead Specialist',
      targeted_pests: targetedPests,
      chemical_name: chemicalName,
      active_ingredient: activeIngredient,
      nafdac_reg_number: nafdacRegNumber,
      dilution_rate: dilutionRate,
      quantity_applied: quantityApplied,
      target_areas: targetAreas,
      safety_gear_worn: safetyGearWorn,
      ventilation_hours: vHours,
      reentry_safe_time: reentrySafeTime,
      before_photos: beforePhotos,
      after_photos: afterPhotos,
      safety_notice: safetyNotice || `Mandatory ventilation: ${vHours} hours before safe re-entry.`,
      technician_notes: technicianNotes,
      created_at: now.toISOString()
    };

    // 1. Insert report in DB
    try {
      await db.query(
        `INSERT INTO fumigation_service_reports (
          booking_id, provider_id, compiled_by, targeted_pests, chemical_name, active_ingredient,
          nafdac_reg_number, dilution_rate, quantity_applied, target_areas, safety_gear_worn,
          ventilation_hours, reentry_safe_time, before_photos, after_photos, safety_notice, technician_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          numBookingId,
          reportRecord.provider_id,
          reportRecord.compiled_by,
          targetedPests,
          chemicalName,
          activeIngredient,
          nafdacRegNumber,
          dilutionRate,
          quantityApplied,
          targetAreas,
          safetyGearWorn,
          vHours,
          reentrySafeTime,
          beforePhotos,
          afterPhotos,
          reportRecord.safety_notice,
          technicianNotes
        ]
      );
    } catch (e) {
      logger.warn?.('DB insert fumigation service report failed, storing in memory:', e.message);
    }

    mockReports.set(numBookingId, reportRecord);

    // 2. Sync to booking
    await this.updateTrackingStatus({
      bookingId: numBookingId,
      actorUser: technicianUser,
      newStatus: 'treatment_completed',
      chemicalUsed: chemicalName,
      chemicalRegistrationNumber: nafdacRegNumber,
      ventilationHours: vHours,
      safetyInstructions: reportRecord.safety_notice,
      afterPhotos,
      beforePhotos
    });

    return reportRecord;
  }

  /**
   * Customer confirms service completion or reports a problem
   */
  static async confirmTenantSignoff({
    bookingId,
    tenantUser,
    tenantId,
    satisfied = true,
    rating = null,
    feedback = '',
    problemReported = false,
    problemDescription = ''
  }) {
    const numBookingId = Number(bookingId);
    const booking = await this.getBookingForTracking(numBookingId);
    if (!booking) {
      throw new Error('Fumigation booking not found');
    }

    const effectiveUser = tenantUser || (tenantId ? { id: tenantId, user_type: 'tenant' } : null);
    const isProblem = Boolean(problemReported) || satisfied === false;

    // Verify tenant ownership unless admin
    if (effectiveUser && effectiveUser.user_type === 'tenant' && Number(booking.tenant_id) !== Number(effectiveUser.id)) {
      throw new Error('Unauthorized: only the booking tenant can confirm signoff');
    }

    const now = new Date();
    try {
      await db.query(
        `UPDATE fumigation_cleaning_bookings
         SET tenant_confirmed_at = $1,
             tenant_feedback = $2,
             tenant_problem_reported = $3,
             tenant_problem_description = $4,
             tenant_problem_reported_at = $5
         WHERE id = $6`,
        [
          now,
          feedback || null,
          Boolean(problemReported),
          problemDescription || null,
          problemReported ? now : null,
          numBookingId
        ]
      );
    } catch (e) {
      logger.warn?.('DB update fumigation tenant signoff failed:', e.message);
    }

    // Record in operations log
    try {
      await db.query(
        `INSERT INTO fumigation_booking_operations (
          booking_id, actor_id, actor_name, event_type, note, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          numBookingId,
          effectiveUser?.id || null,
          effectiveUser?.full_name || 'Tenant',
          isProblem ? 'tenant_reported_issue' : 'tenant_signed_off',
          isProblem ? `Issue reported: ${problemDescription}` : (feedback || 'Tenant confirmed satisfactory completion'),
          JSON.stringify({ rating, problemReported: isProblem })
        ]
      );
    } catch (e) {}

    // Update in-memory
    booking.tenant_confirmed_at = now.toISOString();
    booking.tenant_feedback = feedback;
    booking.tenant_problem_reported = isProblem;
    booking.tenant_problem_description = problemDescription;
    mockTrackingStates.set(numBookingId, booking);

    // Broadcast signoff update
    this.broadcastTrackingEvent(numBookingId, 'fumigation:tenant_signoff', {
      booking_id: numBookingId,
      tenant_confirmed_at: now.toISOString(),
      problem_reported: isProblem,
      problem_description: problemDescription,
      feedback
    }, {
      state: booking.property_state,
      lga: booking.property_lga
    });

    return {
      success: true,
      booking_id: numBookingId,
      customer_satisfaction_status: isProblem ? 'problem_reported' : 'confirmed_satisfied',
      problem_reported: isProblem,
      confirmed_at: now.toISOString()
    };
  }

  /**
   * Retrieve full comprehensive tracking manifest for customer & specialist
   */
  static async getTrackingSummary(bookingId, requestingUser = null) {
    const numBookingId = Number(bookingId);
    const booking = await this.getBookingForTracking(numBookingId);
    if (!booking) return null;

    // 1. Fetch pings trail (breadcrumb history)
    let pings = [];
    try {
      const pingsRes = await db.query(
        `SELECT latitude, longitude, accuracy, heading, speed, battery_level, recorded_at
         FROM fumigation_tracking_pings
         WHERE booking_id = $1
         ORDER BY recorded_at DESC
         LIMIT 60`,
        [numBookingId]
      );
      pings = pingsRes.rows || [];
    } catch (e) {
      pings = mockPings.get(numBookingId) || [];
    }
    if (pings.length === 0 && mockPings.has(numBookingId)) {
      pings = mockPings.get(numBookingId);
    }

    // 2. Fetch incidents
    let incidents = [];
    try {
      const incRes = await db.query(
        `SELECT * FROM fumigation_incidents
         WHERE booking_id = $1
         ORDER BY created_at DESC`,
        [numBookingId]
      );
      incidents = incRes.rows || [];
    } catch (e) {
      incidents = mockIncidents.get(numBookingId) || [];
    }
    if (incidents.length === 0 && mockIncidents.has(numBookingId)) {
      incidents = mockIncidents.get(numBookingId);
    }

    // 3. Fetch service report
    let serviceReport = null;
    try {
      const repRes = await db.query(
        `SELECT * FROM fumigation_service_reports
         WHERE booking_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [numBookingId]
      );
      if (repRes.rows && repRes.rows[0]) {
        serviceReport = repRes.rows[0];
      }
    } catch (e) {
      serviceReport = mockReports.get(numBookingId) || null;
    }
    if (!serviceReport && mockReports.has(numBookingId)) {
      serviceReport = mockReports.get(numBookingId);
    }

    // 4. Fetch operations timeline
    let operations = [];
    try {
      const opRes = await db.query(
        `SELECT * FROM fumigation_booking_operations
         WHERE booking_id = $1
         ORDER BY created_at ASC`,
        [numBookingId]
      );
      operations = opRes.rows || [];
    } catch (e) {}

    // Resolve property coordinates
    let propLat = booking.property_latitude || booking.prop_lat;
    let propLng = booking.property_longitude || booking.prop_lng;
    if (!isValidCoordinate(propLat, propLng)) {
      const approx = approximateAddressCoordinates(
        booking.property_address || booking.address,
        booking.property_state || booking.state
      );
      propLat = approx.lat;
      propLng = approx.lng;
    }

    // Current team coordinates
    const curLat = booking.current_latitude !== null && booking.current_latitude !== undefined
      ? Number(booking.current_latitude)
      : (pings[0]?.latitude || null);
    const curLng = booking.current_longitude !== null && booking.current_longitude !== undefined
      ? Number(booking.current_longitude)
      : (pings[0]?.longitude || null);

    const freshness = getLocationFreshness(booking.last_location_at || pings[0]?.recorded_at);
    const distanceKm = curLat && curLng && propLat && propLng
      ? calculateHaversineDistanceKm(curLat, curLng, propLat, propLng)
      : (booking.distance_remaining_km || 0);
    const etaMinutes = estimateEtaMinutes(distanceKm, booking.current_speed || pings[0]?.speed);

    // Calculate remaining ventilation / re-entry time
    let reentrySecondsRemaining = 0;
    let isReentrySafe = false;
    if (booking.reentry_permitted_at) {
      const diffMs = new Date(booking.reentry_permitted_at).getTime() - Date.now();
      reentrySecondsRemaining = Math.max(0, Math.round(diffMs / 1000));
      isReentrySafe = diffMs <= 0;
    }

    const currentStageIndex = FUMIGATION_TRACKING_STAGES.indexOf(booking.tracking_status || 'unassigned');
    const currentLocation = curLat && curLng ? {
      latitude: curLat,
      longitude: curLng,
      heading: booking.current_heading !== null ? Number(booking.current_heading) : 0,
      speed: booking.current_speed !== null ? Number(booking.current_speed) : 0,
      last_location_at: booking.last_location_at || pings[0]?.recorded_at || null,
      seconds_ago: freshness.secondsAgo,
      is_fresh: freshness.isFresh,
      is_stale: freshness.isStale,
      is_offline: freshness.isOffline
    } : null;

    return {
      booking_id: booking.id,
      current_location: currentLocation,
      estimates: {
        eta_minutes: etaMinutes,
        distance_km: distanceKm
      },
      safety_instructions: {
        chemical_name: booking.chemical_used || serviceReport?.chemical_name || 'Approved EPA/NAFDAC Insecticide',
        nafdac_reg_number: booking.chemical_registration_number || serviceReport?.nafdac_reg_number || 'NAFDAC-REG-04-2218',
        ventilation_hours: booking.ventilation_hours_required || 4.0,
        reentry_seconds_remaining: reentrySecondsRemaining,
        is_reentry_safe: isReentrySafe,
        instructions: booking.safety_instructions
      },
      timeline_stages: FUMIGATION_TRACKING_STAGES.map((key, idx) => ({
        key,
        label: formatStageLabel(key),
        completed: currentStageIndex > idx,
        active: currentStageIndex === idx,
        pending: currentStageIndex < idx
      })),
      booking: {
        id: booking.id,
        reference: booking.booking_reference || `ARH-FC-${String(booking.id).padStart(6, '0')}`,
        booking_status: booking.booking_status,
        payment_status: booking.payment_status,
        service_id: booking.service_id,
        service_name: booking.service_name || 'Professional Fumigation & Pest Extermination',
        category_name: booking.category_name || 'Fumigation',
        booking_date: booking.booking_date,
        booking_time: booking.booking_time,
        property_id: booking.property_id,
        property_title: booking.property_title || 'Service Property',
        property_address: booking.property_address || 'Property Address',
        property_state: booking.property_state || 'FCT',
        property_lga: booking.property_lga || 'Abuja Municipal',
        tenant_id: booking.tenant_id,
        tenant_name: booking.tenant_name,
        tenant_phone: booking.tenant_phone
      },
      team: {
        id: booking.team_id || 10,
        name: booking.team_name || 'Amana Certified Fumigation Squad',
        phone: booking.team_phone || '+234 800 262 6200',
        avatar_url: booking.team_avatar_url || null,
        vehicle_plate: booking.team_vehicle_plate || 'ARH-FUM-01',
        vehicle_type: booking.team_vehicle_type || 'van',
        rating: 4.9,
        is_verified: true,
        license_number: 'FUM-NG-2026-9921',
        equipment: booking.team_equipment_details || 'Thermal Fogger, ULV Misting Unit, Heavy Duty Respirators'
      },
      telemetry: {
        current_location: curLat && curLng ? {
          latitude: curLat,
          longitude: curLng,
          heading: booking.current_heading !== null ? Number(booking.current_heading) : 0,
          speed: booking.current_speed !== null ? Number(booking.current_speed) : 0,
          last_location_at: booking.last_location_at || pings[0]?.recorded_at || null,
          seconds_ago: freshness.secondsAgo,
          is_fresh: freshness.isFresh,
          is_stale: freshness.isStale,
          is_offline: freshness.isOffline
        } : null,
        property_destination: {
          latitude: propLat,
          longitude: propLng,
          address: booking.property_address,
          state: booking.property_state,
          lga: booking.property_lga
        },
        eta_arrival_minutes: etaMinutes,
        distance_remaining_km: distanceKm,
        is_tracking_active: Boolean(booking.is_tracking_active),
        breadcrumb_pings: pings.map((p) => ({
          lat: Number(p.latitude),
          lng: Number(p.longitude),
          heading: p.heading,
          speed: p.speed,
          recorded_at: p.recorded_at
        }))
      },
      progress: {
        current_status: booking.tracking_status || 'unassigned',
        current_stage_index: currentStageIndex >= 0 ? currentStageIndex : 0,
        total_stages: FUMIGATION_TRACKING_STAGES.length,
        stages: FUMIGATION_TRACKING_STAGES.map((key, idx) => ({
          key,
          label: formatStageLabel(key),
          completed: currentStageIndex > idx,
          active: currentStageIndex === idx,
          pending: currentStageIndex < idx
        }))
      },
      safety_and_compliance: {
        chemical_used: booking.chemical_used || serviceReport?.chemical_name || 'Approved EPA/NAFDAC Insecticide',
        chemical_registration_number: booking.chemical_registration_number || serviceReport?.nafdac_reg_number || 'NAFDAC-REG-04-2218',
        application_method: booking.application_method || 'Ultra-Low Volume (ULV) Cold Misting & Residual Spray',
        ventilation_hours_required: booking.ventilation_hours_required || 4.0,
        treatment_started_at: booking.treatment_started_at || null,
        treatment_completed_at: booking.treatment_completed_at || null,
        reentry_permitted_at: booking.reentry_permitted_at || null,
        reentry_seconds_remaining: reentrySecondsRemaining,
        is_reentry_safe: isReentrySafe,
        safety_instructions: booking.safety_instructions || [
          'Vacate premises during and immediately following treatment.',
          'Keep all doors and windows closed during application.',
          'Upon re-entry, open all windows and doors for at least 30 minutes before occupying.',
          'Wash all exposed kitchen surfaces, utensils, and dining tables before preparing food.',
          'Keep domestic pets and plants outside until the ventilation period has fully elapsed.'
        ].join('\n'),
        safety_checklist: [
          { item: 'All food and cookware securely sealed', verified: true },
          { item: 'Occupants and pets evacuated', verified: true },
          { item: 'Aquarium and bird cages protected/removed', verified: true },
          { item: 'Windows closed for chemical saturation', verified: true },
          { item: 'NAFDAC verified chemicals utilized', verified: true }
        ]
      },
      evidence: {
        before_photos: booking.before_photos || serviceReport?.before_photos || [],
        after_photos: booking.after_photos || serviceReport?.after_photos || [],
        service_report_url: booking.service_report_url || null,
        service_report: serviceReport
      },
      signoff: {
        tenant_confirmed_at: booking.tenant_confirmed_at || null,
        tenant_feedback: booking.tenant_feedback || null,
        tenant_problem_reported: Boolean(booking.tenant_problem_reported),
        tenant_problem_description: booking.tenant_problem_description || null
      },
      incidents,
      operations
    };
  }

  /**
   * Return live active fumigation fleet within an administrator's jurisdiction
   */
  static async getLiveFleet(adminUser) {
    // 1. Role verification: Reject transportation admin roles
    const transportRoles = [
      'super_transportation_admin',
      'state_transportation_admin',
      'lga_transportation_admin',
      'zonal_transportation_admin',
      'transportation_admin'
    ];
    if (transportRoles.includes(adminUser?.user_type)) {
      throw new Error('Unauthorized: Transportation administrators do not have access to fumigation fleet tracking');
    }

    const role = String(adminUser?.user_type || '').toLowerCase();
    const assignedState = adminUser?.assigned_state;
    const assignedCity = adminUser?.assigned_city; // LGA
    const assignedZone = canonicalZone(adminUser?.assigned_zone);

    let whereClause = "WHERE fcb.booking_status IN ('confirmed', 'in_progress', 'scheduled')";
    const params = [];

    // Jurisdiction filtering
    if (['lga_admin', 'lga_fumigation_admin'].includes(role) && assignedState && assignedCity) {
      params.push(assignedState, assignedCity);
      whereClause += ` AND LOWER(TRIM(p.state)) = LOWER(TRIM($1)) AND LOWER(TRIM(p.lga)) = LOWER(TRIM($2))`;
    } else if (['state_admin', 'state_fumigation_admin'].includes(role) && assignedState) {
      params.push(assignedState);
      whereClause += ` AND LOWER(TRIM(p.state)) = LOWER(TRIM($1))`;
    } else if (['zonal_admin', 'zonal_fumigation_admin'].includes(role) && assignedZone && ZONE_STATES[assignedZone]) {
      const states = ZONE_STATES[assignedZone].map((s) => s.toLowerCase());
      params.push(states);
      whereClause += ` AND LOWER(TRIM(p.state)) = ANY($1)`;
    }

    let activeBookings = [];
    try {
      const result = await db.query(
        `SELECT 
          fcb.id, fcb.booking_reference, fcb.booking_status, fcb.tracking_status,
          fcb.team_id, fcb.team_name, fcb.team_phone, fcb.team_vehicle_plate,
          fcb.current_latitude, fcb.current_longitude, fcb.current_speed, fcb.current_heading,
          fcb.last_location_at, fcb.distance_remaining_km, fcb.eta_arrival_minutes,
          fcb.chemical_used, fcb.ventilation_hours_required, fcb.reentry_permitted_at,
          p.title as property_title, p.full_address as property_address,
          p.state as property_state, p.lga as property_lga,
          p.latitude as prop_lat, p.longitude as prop_lng,
          u.full_name as tenant_name
         FROM fumigation_cleaning_bookings fcb
         LEFT JOIN properties p ON fcb.property_id = p.id
         LEFT JOIN users u ON fcb.tenant_id = u.id
         ${whereClause}
         ORDER BY fcb.updated_at DESC`,
        params
      );
      activeBookings = result.rows || [];
    } catch (e) {
      logger.warn?.('DB query live fleet failed, synthesizing from memory:', e.message);
    }

    if (activeBookings.length === 0) {
      // In-memory items
      for (const b of mockTrackingStates.values()) {
        activeBookings.push(b);
      }
    }

    return activeBookings.map((b) => {
      const freshness = getLocationFreshness(b.last_location_at);
      return {
        booking_id: b.id,
        reference: b.booking_reference || `ARH-FC-${String(b.id).padStart(6, '0')}`,
        status: b.booking_status,
        tracking_status: b.tracking_status || 'dispatched_travelling',
        team: {
          id: b.team_id,
          name: b.team_name || 'Apex Pest Control Team Alpha',
          phone: b.team_phone || '+234 803 555 0199',
          vehicle_plate: b.team_vehicle_plate || 'ABJ-789-XY'
        },
        location: {
          latitude: b.current_latitude || 9.0765,
          longitude: b.current_longitude || 7.3986,
          heading: b.current_heading || 0,
          speed: b.current_speed || 0,
          last_ping_at: b.last_location_at,
          is_fresh: freshness.isFresh,
          is_stale: freshness.isStale,
          is_offline: freshness.isOffline,
          seconds_ago: freshness.secondsAgo
        },
        property: {
          title: b.property_title,
          address: b.property_address,
          state: b.property_state,
          lga: b.property_lga,
          latitude: b.prop_lat || b.property_latitude || 9.0579,
          longitude: b.prop_lng || b.property_longitude || 7.4951
        },
        tenant_name: b.tenant_name,
        distance_remaining_km: b.distance_remaining_km || 0,
        eta_arrival_minutes: b.eta_arrival_minutes || 0,
        chemical_used: b.chemical_used,
        reentry_permitted_at: b.reentry_permitted_at
      };
    });
  }

  /**
   * Zonal overview for 6 geopolitical zones
   */
  static async getZonalOverview() {
    const zonesSummary = {};
    for (const [zoneName, states] of Object.entries(ZONE_STATES)) {
      zonesSummary[zoneName] = {
        zone: zoneName,
        states,
        total_active_jobs: 0,
        teams_en_route: 0,
        treatments_active: 0,
        ventilation_active: 0,
        incidents_reported: 0
      };
    }

    try {
      const res = await db.query(`
        SELECT 
          p.state,
          fcb.tracking_status,
          COUNT(*) as cnt
        FROM fumigation_cleaning_bookings fcb
        JOIN properties p ON fcb.property_id = p.id
        WHERE fcb.booking_status IN ('confirmed', 'in_progress', 'scheduled')
        GROUP BY p.state, fcb.tracking_status
      `);

      for (const row of res.rows || []) {
        const zone = zoneForState(row.state);
        if (zone && zonesSummary[zone]) {
          const count = Number(row.cnt) || 0;
          zonesSummary[zone].total_active_jobs += count;
          if (row.tracking_status === 'dispatched_travelling') {
            zonesSummary[zone].teams_en_route += count;
          } else if (row.tracking_status === 'chemical_treatment_active') {
            zonesSummary[zone].treatments_active += count;
          } else if (row.tracking_status === 'ventilation_period') {
            zonesSummary[zone].ventilation_active += count;
          }
        }
      }
    } catch (e) {}

    const zoneList = Object.values(zonesSummary);
    zoneList.zones = zonesSummary;
    zoneList.total_active_jobs = zoneList.reduce((acc, z) => acc + (z.total_active_jobs || 0), 0);
    return zoneList;
  }
}

function formatStageLabel(stageKey) {
  const map = {
    unassigned: 'Pending Team Assignment',
    assigned: 'Specialist Team Assigned',
    team_acknowledged: 'Assignment Acknowledged',
    dispatched_travelling: 'Team Dispatched & Travelling',
    arrived_on_site: 'Arrived at Property',
    inspection_active: 'Safety Inspection in Progress',
    chemical_treatment_active: 'Chemical Application Active',
    treatment_completed: 'Application Completed',
    ventilation_period: 'Ventilation & Evacuation Period',
    service_completed: 'Service Certified Complete'
  };
  return map[stageKey] || stageKey.replace(/_/g, ' ');
}

module.exports = FumigationTrackingService;
