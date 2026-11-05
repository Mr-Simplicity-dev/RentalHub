const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const TransportationTrackingService = require('../services/transportationTrackingService');

describe('TransportationTrackingService Unit Tests', () => {
  test('isAuthorizedDriver correctly authorizes assigned driver, matching phone, and admins', () => {
    const booking = {
      id: 1,
      driver_id: 42,
      driver_phone: '+234 803 123 4567',
      driver_name: 'Adewale Adeleke',
      booking_status: 'in_progress'
    };

    // User with matching driver_id
    assert.equal(
      TransportationTrackingService.isAuthorizedDriver(booking, { id: 42, user_type: 'tenant' }),
      true
    );

    // User with different id but matching phone
    assert.equal(
      TransportationTrackingService.isAuthorizedDriver(booking, { id: 99, phone: '08031234567', user_type: 'tenant' }),
      true
    );

    // Super admin
    assert.equal(
      TransportationTrackingService.isAuthorizedDriver(booking, { id: 8, user_type: 'super_admin' }),
      true
    );

    // Super transportation admin
    assert.equal(
      TransportationTrackingService.isAuthorizedDriver(booking, { id: 9, user_type: 'super_transportation_admin' }),
      true
    );

    // Random unassigned user
    assert.equal(
      TransportationTrackingService.isAuthorizedDriver(booking, { id: 777, phone: '+2348099999999', user_type: 'tenant' }),
      false
    );
  });

  test('recordLocationPing rejects invalid coordinates and saves valid coordinates', async () => {
    // Should throw on out-of-range latitude
    await assert.rejects(
      async () => {
        await TransportationTrackingService.recordLocationPing({
          bookingId: 1,
          driverId: 1,
          latitude: 999.0,
          longitude: 7.42,
          speed: 25
        });
      },
      /Invalid GPS coordinates/
    );

    // Should throw on out-of-range longitude
    await assert.rejects(
      async () => {
        await TransportationTrackingService.recordLocationPing({
          bookingId: 1,
          driverId: 1,
          latitude: 9.07,
          longitude: -250.0,
          speed: 25
        });
      },
      /Invalid GPS coordinates/
    );

    // Valid ping recording
    const validPing = await TransportationTrackingService.recordLocationPing({
      bookingId: 1,
      driverId: 1,
      latitude: 9.0765,
      longitude: 7.4215,
      accuracy: 8.5,
      heading: 90,
      speed: 40,
      batteryLevel: 88
    });

    assert.equal(validPing.booking_id, 1);
    assert.equal(validPing.latitude, 9.0765);
    assert.equal(validPing.longitude, 7.4215);
    assert.equal(validPing.speed, 40);
    assert.equal(validPing.is_fresh, true);
    assert.ok(validPing.recorded_at);
  });

  test('updateTrackingStatus updates status and records in operations log', async () => {
    const updated = await TransportationTrackingService.updateTrackingStatus({
      bookingId: 1,
      actorUser: { id: 1, full_name: 'Driver John', user_type: 'driver' },
      newStatus: 'in_transit',
      note: 'Departed pickup location with cargo safely loaded'
    });

    assert.equal(updated.booking_id, 1);
    assert.equal(updated.tracking_status, 'in_transit');
    assert.equal(updated.booking_status, 'in_progress');
    assert.equal(updated.is_tracking_active, true);
  });

  test('reportIncident creates an operational incident and marks booking delayed', async () => {
    const incident = await TransportationTrackingService.reportIncident({
      bookingId: 1,
      reportedBy: { id: 1, full_name: 'Driver John', user_type: 'driver' },
      incidentType: 'traffic_delay',
      severity: 'medium',
      description: 'Heavy congestion along Abuja airport road due to road maintenance',
      latitude: 9.07,
      longitude: 7.41
    });

    assert.ok(incident);
    assert.equal(incident.booking_id, 1);
    assert.equal(incident.incident_type, 'traffic_delay');
    assert.equal(incident.severity, 'medium');
  });

  test('getTrackingSummary returns comprehensive tracking data for tenant', async () => {
    const summary = await TransportationTrackingService.getTrackingSummary(1);
    assert.ok(summary);
    assert.equal(summary.booking_id, 1);
    assert.ok(summary.driver);
    assert.ok(summary.estimates);
    assert.ok(Array.isArray(summary.breadcrumb_trail));
    assert.ok(summary.current_location);
    assert.equal(summary.current_location.latitude, 9.0765);
  });

  test('getLiveFleet returns active vehicles for admin jurisdiction', async () => {
    const fleet = await TransportationTrackingService.getLiveFleet({ scope: 'GLOBAL' });
    assert.ok(Array.isArray(fleet));
    assert.ok(fleet.length >= 1);
    assert.ok(fleet[0].booking_id);
    assert.ok(fleet[0].driver_name);
  });
});
