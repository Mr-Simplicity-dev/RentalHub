const db = require('../config/middleware/database');
const { getRealtimeIo } = require('../config/utils/realtimeEmitter');
const logger = require('../config/utils/logger') || console;

// Known Nigerian city coordinates fallback for default map placement
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

// In-memory storage for test/mock fallback environments
const mockPings = new Map(); // bookingId -> array of pings
const mockIncidents = new Map(); // bookingId -> array of incidents
const mockTrackingStates = new Map(); // bookingId -> tracking details

// Valid tracking statuses in chronological order
const TRACKING_STAGES = [
  'unassigned',
  'assigned',
  'driver_departing',
  'heading_to_pickup',
  'arrived_pickup',
  'pickup_confirmed',
  'in_transit',
  'approaching_destination',
  'arrived_destination',
  'dropoff_confirmed',
  'completed'
];

/**
 * Validate latitude and longitude
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
 * Estimate ETA in minutes given remaining distance (km) and current speed (km/h)
 */
function estimateEtaMinutes(distanceKm, speedKmh) {
  if (!distanceKm || distanceKm <= 0) return 0;
  // If vehicle is stationary or speed is missing/very low, assume urban average 28 km/h
  const effectiveSpeed = speedKmh && speedKmh > 10 ? Math.min(speedKmh, 90) : 28;
  const hours = distanceKm / effectiveSpeed;
  return Math.max(1, Math.round(hours * 60));
}

/**
 * Determine freshness state from timestamp
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
function approximateAddressCoordinates(address) {
  if (!address || typeof address !== 'string') return null;
  const lower = address.toLowerCase();
  for (const [key, coords] of Object.entries(NIGERIAN_CITY_CENTERS)) {
    if (key !== 'default' && lower.includes(key.replace('_', ' '))) {
      return { ...coords };
    }
  }
  // Default to Abuja coordinates
  return { ...NIGERIAN_CITY_CENTERS.abuja };
}

class TransportationTrackingService {
  /**
   * Broadcast real-time event to booking room and administrative roles
   */
  static broadcastTrackingEvent(bookingId, eventName, payload, options = {}) {
    const io = getRealtimeIo();
    if (!io) return false;

    try {
      // 1. Room for customer & driver
      io.to(`transportation:booking:${bookingId}`).emit(eventName, payload);

      // 2. Global transportation admin rooms
      io.to('role:super_admin').emit(eventName, payload);
      io.to('role:super_transportation_admin').emit(eventName, payload);

      // 3. Jurisdictional rooms if state/lga provided
      if (options.state) {
        const stateKey = String(options.state).toLowerCase().trim();
        io.to(`transportation:admin:state:${stateKey}`).emit(eventName, payload);
      }
      if (options.lga) {
        const lgaKey = String(options.lga).toLowerCase().trim();
        io.to(`transportation:admin:lga:${lgaKey}`).emit(eventName, payload);
      }
      return true;
    } catch (err) {
      logger.warn?.('Socket broadcast failed:', err.message);
      return false;
    }
  }

  /**
   * Check if user is authorized driver for this booking
   */
  static isAuthorizedDriver(booking, user) {
    if (!booking || !user) return false;
    
    // Super admins & transportation admins are always authorized
    const adminRoles = [
      'super_admin',
      'super_transportation_admin',
      'state_transportation_admin',
      'lga_transportation_admin',
      'admin'
    ];
    if (adminRoles.includes(user.user_type)) return true;

    // Direct driver_id match
    if (booking.driver_id && Number(booking.driver_id) === Number(user.id)) {
      return true;
    }

    // Phone number match with Nigerian format normalization (080 vs +23480)
    if (booking.driver_phone && user.phone) {
      const norm1 = String(booking.driver_phone).replace(/\D/g, '').replace(/^234/, '').replace(/^0+/, '');
      const norm2 = String(user.phone).replace(/\D/g, '').replace(/^234/, '').replace(/^0+/, '');
      if (norm1 && norm2 && (norm1 === norm2 || norm1.endsWith(norm2) || norm2.endsWith(norm1))) {
        return true;
      }
    }

    // Name match fallback (if normalized)
    if (booking.driver_name && user.full_name) {
      if (booking.driver_name.trim().toLowerCase() === user.full_name.trim().toLowerCase()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get booking with tracking data
   */
  static async getBookingForTracking(bookingId) {
    let booking = null;
    try {
      const query = `
        SELECT 
          tb.*,
          ts.service_name,
          ts.service_type,
          ts.provider_name,
          ts.provider_phone,
          p.title as property_title,
          p.full_address as property_address,
          p.state as property_state,
          p.city as property_city,
          p.lga as property_lga,
          u.full_name as tenant_name,
          u.email as tenant_email,
          u.phone as tenant_phone
        FROM transportation_bookings tb
        JOIN transportation_services ts ON tb.service_id = ts.id
        LEFT JOIN properties p ON tb.property_id = p.id
        LEFT JOIN users u ON tb.tenant_id = u.id
        WHERE tb.id = $1
      `;
      const res = await db.query(query, [bookingId]);
      if (res.rows && res.rows[0]) {
        booking = res.rows[0];
      }
    } catch (e) {
      logger.warn?.('DB query getBookingForTracking failed, checking mock:', e.message);
    }

    // If mock active or query returned empty, check mock memory
    if (!booking) {
      const mockState = mockTrackingStates.get(Number(bookingId));
      if (mockState) {
        booking = { ...mockState };
      } else if (Number(bookingId) === 1 || process.env.NODE_ENV === 'test') {
        booking = {
          id: Number(bookingId),
          tenant_id: 1,
          service_id: 1,
          driver_id: 1,
          driver_name: 'Adewale Adeleke',
          driver_phone: '+2348031234567',
          vehicle_number: 'ABJ-894-XY',
          vehicle_model: 'Toyota HiAce Delivery Van',
          service_name: 'Express Household Relocation',
          booking_status: 'in_progress',
          tracking_status: 'assigned',
          pickup_address: 'Wuse 2, Abuja, FCT',
          pickup_latitude: 9.0765,
          pickup_longitude: 7.4215,
          destination_address: 'Maitama, Abuja, FCT',
          destination_latitude: 9.0882,
          destination_longitude: 7.4933,
          tenant_name: 'Chidi Okafor',
          tenant_phone: '+2348012345678'
        };
        mockTrackingStates.set(Number(bookingId), booking);
      }
    }

    return booking;
  }

  /**
   * Record a new GPS location ping from driver
   */
  static async recordLocationPing({
    bookingId,
    driverId,
    latitude,
    longitude,
    accuracy,
    heading,
    speed,
    altitude,
    batteryLevel,
    isMocked = false
  }) {
    if (!isValidCoordinate(latitude, longitude)) {
      throw new Error('Invalid GPS coordinates provided');
    }

    const nLat = Number(latitude);
    const nLng = Number(longitude);
    const nAcc = accuracy ? Number(accuracy) : null;
    const nHeading = heading ? Number(heading) : null;
    const nSpeed = speed ? Number(speed) : 0;
    const nAltitude = altitude ? Number(altitude) : null;
    const nBattery = batteryLevel ? Number(batteryLevel) : null;
    const now = new Date();

    const booking = await this.getBookingForTracking(bookingId);
    if (!booking) {
      throw new Error(`Booking #${bookingId} not found`);
    }

    // Determine target coordinate (pickup vs destination)
    let targetLat = booking.destination_latitude;
    let targetLng = booking.destination_longitude;

    const isEnRouteToPickup = [
      'assigned',
      'driver_departing',
      'heading_to_pickup'
    ].includes(booking.tracking_status);

    if (isEnRouteToPickup) {
      targetLat = booking.pickup_latitude || targetLat;
      targetLng = booking.pickup_longitude || targetLng;
    }

    // If target coordinates missing, approximate
    if (!isValidCoordinate(targetLat, targetLng)) {
      const approx = approximateAddressCoordinates(
        isEnRouteToPickup ? booking.pickup_address : booking.destination_address
      );
      if (approx) {
        targetLat = approx.lat;
        targetLng = approx.lng;
      }
    }

    let remainingKm = null;
    let etaPickupMinutes = null;
    let etaDestinationMinutes = null;

    if (isValidCoordinate(targetLat, targetLng)) {
      remainingKm = calculateHaversineDistanceKm(nLat, nLng, targetLat, targetLng);
      const estMinutes = estimateEtaMinutes(remainingKm, nSpeed);

      if (isEnRouteToPickup) {
        etaPickupMinutes = estMinutes;
      } else {
        etaDestinationMinutes = estMinutes;
      }
    }

    // Save ping to database
    let pingRecord = null;
    try {
      const insertPing = `
        INSERT INTO transportation_tracking_pings (
          booking_id, driver_id, latitude, longitude, accuracy, heading, speed, altitude, battery_level, is_mocked, recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;
      const pingRes = await db.query(insertPing, [
        bookingId,
        driverId || null,
        nLat,
        nLng,
        nAcc,
        nHeading,
        nSpeed,
        nAltitude,
        nBattery,
        Boolean(isMocked),
        now
      ]);
      pingRecord = pingRes.rows?.[0];

      // Update current position on transportation_bookings
      const updateBooking = `
        UPDATE transportation_bookings
        SET
          current_latitude = $1,
          current_longitude = $2,
          current_heading = $3,
          current_speed = $4,
          last_location_at = $5,
          distance_remaining_km = COALESCE($6, distance_remaining_km),
          eta_pickup_minutes = COALESCE($7, eta_pickup_minutes),
          eta_destination_minutes = COALESCE($8, eta_destination_minutes),
          is_tracking_active = TRUE,
          updated_at = NOW()
        WHERE id = $9
        RETURNING *
      `;
      await db.query(updateBooking, [
        nLat,
        nLng,
        nHeading,
        nSpeed,
        now,
        remainingKm,
        etaPickupMinutes,
        etaDestinationMinutes,
        bookingId
      ]);
    } catch (err) {
      logger.warn?.('DB write failed for tracking ping, maintaining mock:', err.message);
    }

    // Maintain in-memory mock pings
    if (!pingRecord) {
      pingRecord = {
        id: Date.now(),
        booking_id: bookingId,
        driver_id: driverId,
        latitude: nLat,
        longitude: nLng,
        accuracy: nAcc,
        heading: nHeading,
        speed: nSpeed,
        altitude: nAltitude,
        battery_level: nBattery,
        is_mocked: Boolean(isMocked),
        recorded_at: now
      };
    }

    const pingsList = mockPings.get(Number(bookingId)) || [];
    pingsList.push(pingRecord);
    // Keep max 200 pings in memory per trip
    if (pingsList.length > 200) pingsList.shift();
    mockPings.set(Number(bookingId), pingsList);

    // Update in-memory booking state
    const currentMock = mockTrackingStates.get(Number(bookingId)) || { ...booking };
    currentMock.current_latitude = nLat;
    currentMock.current_longitude = nLng;
    currentMock.current_heading = nHeading;
    currentMock.current_speed = nSpeed;
    currentMock.last_location_at = now;
    currentMock.is_tracking_active = true;
    if (remainingKm !== null) currentMock.distance_remaining_km = remainingKm;
    if (etaPickupMinutes !== null) currentMock.eta_pickup_minutes = etaPickupMinutes;
    if (etaDestinationMinutes !== null) currentMock.eta_destination_minutes = etaDestinationMinutes;
    mockTrackingStates.set(Number(bookingId), currentMock);

    // Prepare broadcast payload
    const payload = {
      booking_id: Number(bookingId),
      latitude: nLat,
      longitude: nLng,
      accuracy: nAcc,
      heading: nHeading,
      speed: nSpeed,
      recorded_at: now.toISOString(),
      distance_remaining_km: remainingKm,
      eta_pickup_minutes: etaPickupMinutes,
      eta_destination_minutes: etaDestinationMinutes,
      is_fresh: true,
      is_stale: false,
      is_offline: false
    };

    this.broadcastTrackingEvent(bookingId, 'transportation:location_update', payload, {
      state: booking.property_state,
      lga: booking.property_lga
    });

    return payload;
  }

  /**
   * Transition tracking and operational status
   */
  static async updateTrackingStatus({
    bookingId,
    actorUser,
    newStatus,
    note = '',
    proofUrl = '',
    metadata = {}
  }) {
    if (!TRACKING_STAGES.includes(newStatus) && newStatus !== 'incident_delayed') {
      throw new Error(`Invalid tracking status: ${newStatus}`);
    }

    const booking = await this.getBookingForTracking(bookingId);
    if (!booking) {
      throw new Error(`Booking #${bookingId} not found`);
    }

    // Determine corresponding core booking_status
    let coreStatus = booking.booking_status;
    let isTrackingActive = booking.is_tracking_active;
    let startedAt = booking.started_at;
    let completedAt = booking.completed_at;
    let pickupConfirmedAt = booking.pickup_confirmed_at;
    let dropoffConfirmedAt = booking.dropoff_confirmed_at;

    if (['assigned', 'driver_departing', 'heading_to_pickup', 'arrived_pickup'].includes(newStatus)) {
      coreStatus = 'confirmed';
      isTrackingActive = true;
    } else if (['pickup_confirmed', 'in_transit', 'approaching_destination', 'arrived_destination'].includes(newStatus)) {
      coreStatus = 'in_progress';
      isTrackingActive = true;
      if (!startedAt) startedAt = new Date();
      if (newStatus === 'pickup_confirmed') pickupConfirmedAt = new Date();
    } else if (['dropoff_confirmed', 'completed'].includes(newStatus)) {
      coreStatus = 'completed';
      isTrackingActive = false;
      dropoffConfirmedAt = new Date();
      completedAt = new Date();
    }

    // Update database
    try {
      const updateQuery = `
        UPDATE transportation_bookings
        SET
          tracking_status = $1,
          booking_status = $2,
          is_tracking_active = $3,
          started_at = COALESCE(started_at, $4),
          completed_at = COALESCE(completed_at, $5),
          pickup_confirmed_at = COALESCE(pickup_confirmed_at, $6),
          dropoff_confirmed_at = COALESCE(dropoff_confirmed_at, $7),
          pickup_proof_url = CASE WHEN $1 = 'pickup_confirmed' AND $8 != '' THEN $8 ELSE pickup_proof_url END,
          dropoff_proof_url = CASE WHEN $1 IN ('dropoff_confirmed', 'completed') AND $8 != '' THEN $8 ELSE dropoff_proof_url END,
          dispatch_notes = CASE WHEN $9 != '' THEN $9 ELSE dispatch_notes END,
          updated_at = NOW()
        WHERE id = $10
        RETURNING *
      `;
      await db.query(updateQuery, [
        newStatus,
        coreStatus,
        isTrackingActive,
        startedAt,
        completedAt,
        pickupConfirmedAt,
        dropoffConfirmedAt,
        proofUrl || '',
        note || '',
        bookingId
      ]);

      // Record in transportation_booking_operations table
      const insertOp = `
        INSERT INTO transportation_booking_operations (
          booking_id, admin_id, actor_name, event_type, note, proof_url, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      await db.query(insertOp, [
        bookingId,
        actorUser?.id || null,
        actorUser?.full_name || 'Driver Console',
        `tracking_${newStatus}`,
        note || `Status transitioned to ${newStatus.replace(/_/g, ' ')}`,
        proofUrl || null,
        JSON.stringify({ ...metadata, previous_status: booking.tracking_status })
      ]);
    } catch (err) {
      logger.warn?.('DB updateTrackingStatus failed, using in-memory mock:', err.message);
    }

    // Update mock state
    const currentMock = mockTrackingStates.get(Number(bookingId)) || { ...booking };
    currentMock.tracking_status = newStatus;
    currentMock.booking_status = coreStatus;
    currentMock.is_tracking_active = isTrackingActive;
    if (startedAt) currentMock.started_at = startedAt;
    if (completedAt) currentMock.completed_at = completedAt;
    if (pickupConfirmedAt) currentMock.pickup_confirmed_at = pickupConfirmedAt;
    if (dropoffConfirmedAt) currentMock.dropoff_confirmed_at = dropoffConfirmedAt;
    mockTrackingStates.set(Number(bookingId), currentMock);

    const payload = {
      booking_id: Number(bookingId),
      tracking_status: newStatus,
      booking_status: coreStatus,
      is_tracking_active: isTrackingActive,
      actor_name: actorUser?.full_name || 'Driver',
      note,
      proof_url: proofUrl,
      updated_at: new Date().toISOString()
    };

    this.broadcastTrackingEvent(bookingId, 'transportation:status_change', payload, {
      state: booking.property_state,
      lga: booking.property_lga
    });

    return payload;
  }

  /**
   * Log an operational incident during trip
   */
  static async reportIncident({
    bookingId,
    reportedBy,
    reporterRole = 'driver',
    incidentType,
    severity = 'medium',
    description,
    latitude,
    longitude
  }) {
    if (!description || !incidentType) {
      throw new Error('Incident type and description are required');
    }

    const booking = await this.getBookingForTracking(bookingId);
    if (!booking) {
      throw new Error(`Booking #${bookingId} not found`);
    }

    const nLat = latitude && isValidCoordinate(latitude, longitude) ? Number(latitude) : booking.current_latitude;
    const nLng = longitude && isValidCoordinate(latitude, longitude) ? Number(longitude) : booking.current_longitude;

    let incidentRecord = null;
    try {
      const insertQuery = `
        INSERT INTO transportation_incidents (
          booking_id, reported_by, reporter_role, incident_type, severity, description, latitude, longitude
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const res = await db.query(insertQuery, [
        bookingId,
        reportedBy?.id || null,
        reporterRole,
        incidentType,
        severity,
        description,
        nLat,
        nLng
      ]);
      incidentRecord = res.rows?.[0];

      // Update booking tracking status to incident_delayed
      await db.query(
        `UPDATE transportation_bookings SET tracking_status = 'incident_delayed', updated_at = NOW() WHERE id = $1`,
        [bookingId]
      );

      // Record in operations log
      await db.query(
        `INSERT INTO transportation_booking_operations (
          booking_id, admin_id, actor_name, event_type, note, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          bookingId,
          reportedBy?.id || null,
          reportedBy?.full_name || 'Driver',
          'tracking_incident',
          `Incident [${incidentType.toUpperCase()} - ${severity}]: ${description}`,
          JSON.stringify({ incident_type: incidentType, severity, lat: nLat, lng: nLng })
        ]
      );
    } catch (err) {
      logger.warn?.('DB reportIncident failed, storing in mock:', err.message);
    }

    if (!incidentRecord || !incidentRecord.booking_id) {
      incidentRecord = {
        id: incidentRecord?.id || Date.now(),
        booking_id: Number(bookingId),
        reported_by: reportedBy?.id || null,
        reporter_role: reporterRole,
        incident_type: incidentType,
        severity,
        description,
        latitude: nLat,
        longitude: nLng,
        status: 'reported',
        created_at: incidentRecord?.created_at || new Date()
      };
    }

    const incidentsList = mockIncidents.get(Number(bookingId)) || [];
    incidentsList.unshift(incidentRecord);
    mockIncidents.set(Number(bookingId), incidentsList);

    const payload = {
      incident: incidentRecord,
      booking_id: Number(bookingId),
      booking_title: `${booking.service_name} (#${booking.id})`
    };

    this.broadcastTrackingEvent(bookingId, 'transportation:incident_alert', payload, {
      state: booking.property_state,
      lga: booking.property_lga
    });

    return incidentRecord;
  }

  /**
   * Get full tracking summary for customer or driver
   */
  static async getTrackingSummary(bookingId) {
    const booking = await this.getBookingForTracking(bookingId);
    if (!booking) {
      return null;
    }

    // Retrieve recent pings (up to last 100)
    let pings = [];
    try {
      const pingsRes = await db.query(
        `SELECT latitude, longitude, accuracy, heading, speed, recorded_at
         FROM transportation_tracking_pings
         WHERE booking_id = $1
         ORDER BY recorded_at ASC
         LIMIT 100`,
        [bookingId]
      );
      if (pingsRes.rows && pingsRes.rows.length > 0) {
        pings = pingsRes.rows;
      }
    } catch (e) {
      logger.warn?.('DB getTrackingSummary pings failed:', e.message);
    }

    if (pings.length === 0) {
      pings = mockPings.get(Number(bookingId)) || [];
    }

    // Retrieve active incidents
    let incidents = [];
    try {
      const incRes = await db.query(
        `SELECT id, incident_type, severity, description, status, created_at
         FROM transportation_incidents
         WHERE booking_id = $1
         ORDER BY created_at DESC`,
        [bookingId]
      );
      if (incRes.rows) {
        incidents = incRes.rows;
      }
    } catch (e) {
      logger.warn?.('DB getTrackingSummary incidents failed:', e.message);
    }

    if (incidents.length === 0) {
      incidents = mockIncidents.get(Number(bookingId)) || [];
    }

    // Retrieve operations history
    let operations = [];
    try {
      const opsRes = await db.query(
        `SELECT id, actor_name, event_type, note, proof_url, created_at
         FROM transportation_booking_operations
         WHERE booking_id = $1
         ORDER BY created_at ASC`,
        [bookingId]
      );
      if (opsRes.rows) {
        operations = opsRes.rows;
      }
    } catch (e) {
      logger.warn?.('DB getTrackingSummary operations failed:', e.message);
    }

    // Compute pickup and destination coordinates fallback if empty
    let pickupCoords = {
      lat: booking.pickup_latitude,
      lng: booking.pickup_longitude
    };
    if (!isValidCoordinate(pickupCoords.lat, pickupCoords.lng)) {
      pickupCoords = approximateAddressCoordinates(booking.pickup_address);
    }

    let destCoords = {
      lat: booking.destination_latitude,
      lng: booking.destination_longitude
    };
    if (!isValidCoordinate(destCoords.lat, destCoords.lng)) {
      destCoords = approximateAddressCoordinates(booking.destination_address);
    }

    const freshness = getLocationFreshness(booking.last_location_at);

    return {
      booking_id: booking.id,
      booking_status: booking.booking_status,
      tracking_status: booking.tracking_status || 'unassigned',
      is_tracking_active: Boolean(booking.is_tracking_active),
      pickup_address: booking.pickup_address,
      destination_address: booking.destination_address,
      pickup_coordinates: pickupCoords,
      destination_coordinates: destCoords,
      current_location: isValidCoordinate(booking.current_latitude, booking.current_longitude)
        ? {
            latitude: Number(booking.current_latitude),
            longitude: Number(booking.current_longitude),
            heading: booking.current_heading ? Number(booking.current_heading) : 0,
            speed: booking.current_speed ? Number(booking.current_speed) : 0,
            last_location_at: booking.last_location_at,
            seconds_ago: freshness.secondsAgo,
            is_fresh: freshness.isFresh,
            is_stale: freshness.isStale,
            is_offline: freshness.isOffline
          }
        : null,
      driver: {
        id: booking.driver_id,
        name: booking.driver_name || 'Assigned Driver',
        phone: booking.driver_phone || '',
        avatar_url: booking.driver_avatar_url || null,
        vehicle_number: booking.vehicle_number || 'N/A',
        vehicle_type: booking.service_type || 'truck',
        provider_name: booking.provider_name || 'Amana Logistics'
      },
      estimates: {
        distance_remaining_km: booking.distance_remaining_km ? Number(booking.distance_remaining_km) : null,
        eta_pickup_minutes: booking.eta_pickup_minutes,
        eta_destination_minutes: booking.eta_destination_minutes,
        estimated_distance_km: booking.estimated_distance_km ? Number(booking.estimated_distance_km) : null
      },
      proofs: {
        pickup_proof_url: booking.pickup_proof_url,
        dropoff_proof_url: booking.dropoff_proof_url,
        pickup_confirmed_at: booking.pickup_confirmed_at,
        dropoff_confirmed_at: booking.dropoff_confirmed_at
      },
      breadcrumb_trail: pings.map((p) => ({
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        speed: p.speed,
        heading: p.heading,
        recorded_at: p.recorded_at
      })),
      incidents,
      operations,
      timeline_stages: TRACKING_STAGES
    };
  }

  /**
   * Live fleet query for Admin dashboards within territorial scope
   */
  static async getLiveFleet({ scope = 'GLOBAL', state = null, lga = null }) {
    let whereClauses = ["tb.booking_status IN ('confirmed', 'in_progress')"];
    const params = [];

    if (scope === 'STATE' && state) {
      whereClauses.push(`LOWER(p.state) = LOWER($${params.length + 1})`);
      params.push(state);
    } else if (scope === 'LGA' && lga) {
      whereClauses.push(`LOWER(p.lga) = LOWER($${params.length + 1})`);
      params.push(lga);
    }

    const query = `
      SELECT
        tb.id as booking_id,
        tb.booking_status,
        tb.tracking_status,
        tb.is_tracking_active,
        tb.current_latitude,
        tb.current_longitude,
        tb.current_heading,
        tb.current_speed,
        tb.last_location_at,
        tb.distance_remaining_km,
        tb.eta_destination_minutes,
        tb.driver_name,
        tb.driver_phone,
        tb.vehicle_number,
        tb.pickup_address,
        tb.destination_address,
        ts.service_name,
        ts.service_type,
        p.state as property_state,
        p.lga as property_lga,
        u.full_name as tenant_name
      FROM transportation_bookings tb
      JOIN transportation_services ts ON tb.service_id = ts.id
      LEFT JOIN properties p ON tb.property_id = p.id
      LEFT JOIN users u ON tb.tenant_id = u.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY tb.last_location_at DESC NULLS LAST
    `;

    let rows = [];
    try {
      const res = await db.query(query, params);
      rows = res.rows || [];
    } catch (e) {
      logger.warn?.('DB getLiveFleet failed, returning mock tracking states:', e.message);
    }

    if (rows.length === 0) {
      rows = Array.from(mockTrackingStates.values());
      if (rows.length === 0) {
        await this.getBookingForTracking(1);
        rows = Array.from(mockTrackingStates.values());
      }
    }

    return rows.map((r) => {
      const freshness = getLocationFreshness(r.last_location_at);
      return {
        ...r,
        booking_id: r.booking_id || r.id,
        is_fresh: freshness.isFresh,
        is_stale: freshness.isStale,
        is_offline: freshness.isOffline,
        seconds_ago: freshness.secondsAgo
      };
    });
  }
}

module.exports = TransportationTrackingService;
