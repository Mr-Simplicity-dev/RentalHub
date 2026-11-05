const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const FumigationTrackingService = require('../services/fumigationTrackingService');

describe('FumigationTrackingService Unit Tests', () => {
  test('isAuthorizedTeam correctly authorizes assigned specialists and fumigation admins, and strictly denies transportation admins', () => {
    const booking = {
      id: 1,
      assigned_team_id: 10,
      assigned_team_leader: 'Ibrahim Danladi',
      assigned_team_phone: '+234 802 333 4444',
      booking_status: 'in_progress'
    };

    // User with matching assigned_team_id
    assert.equal(
      FumigationTrackingService.isAuthorizedTeam(booking, { id: 10, user_type: 'service_provider' }),
      true
    );

    // User with matching team phone
    assert.equal(
      FumigationTrackingService.isAuthorizedTeam(booking, { id: 99, phone: '08023334444', user_type: 'service_provider' }),
      true
    );

    // Super Admin has oversight
    assert.equal(
      FumigationTrackingService.isAuthorizedTeam(booking, { id: 1, user_type: 'super_admin' }),
      true
    );

    // Zonal Fumigation Admin has oversight
    assert.equal(
      FumigationTrackingService.isAuthorizedTeam(booking, { id: 2, user_type: 'zonal_fumigation_admin' }),
      true
    );

    // State Fumigation Admin has oversight
    assert.equal(
      FumigationTrackingService.isAuthorizedTeam(booking, { id: 3, user_type: 'state_fumigation_admin' }),
      true
    );

    // IMPORTANT CONSTRAINT: Super Transportation Admin MUST NOT have fumigation authority
    assert.equal(
      FumigationTrackingService.isAuthorizedTeam(booking, { id: 88, user_type: 'super_transportation_admin' }),
      false
    );

    // Unassigned regular tenant must be denied
    assert.equal(
      FumigationTrackingService.isAuthorizedTeam(booking, { id: 777, phone: '+2348090000000', user_type: 'tenant' }),
      false
    );
  });

  test('recordLocationPing rejects invalid coordinates and records valid telemetry', async () => {
    // Out of range latitude
    await assert.rejects(
      async () => {
        await FumigationTrackingService.recordLocationPing({
          bookingId: 1,
          teamId: 1,
          latitude: 999.0,
          longitude: 7.42,
          speed: 20
        });
      },
      /Invalid GPS coordinates/
    );

    // Out of range longitude
    await assert.rejects(
      async () => {
        await FumigationTrackingService.recordLocationPing({
          bookingId: 1,
          teamId: 1,
          latitude: 9.07,
          longitude: -250.0,
          speed: 20
        });
      },
      /Invalid GPS coordinates/
    );

    // Valid ping recording
    const validPing = await FumigationTrackingService.recordLocationPing({
      bookingId: 1,
      teamId: 1,
      latitude: 9.0722,
      longitude: 7.4913,
      accuracy: 6.2,
      heading: 120,
      speed: 35,
      batteryLevel: 94
    });

    assert.equal(validPing.booking_id, 1);
    assert.equal(validPing.latitude, 9.0722);
    assert.equal(validPing.longitude, 7.4913);
    assert.equal(validPing.speed, 35);
    assert.equal(validPing.is_fresh, true);
    assert.ok(validPing.recorded_at);
  });

  test('updateTrackingStatus progression and enforces mandatory completion safety evidence', async () => {
    // 1. Dispatch team
    const dispatched = await FumigationTrackingService.updateTrackingStatus({
      bookingId: 1,
      actorUser: { id: 1, full_name: 'Ibrahim Danladi', user_type: 'service_provider' },
      newStatus: 'dispatched_travelling',
      note: 'Fumigation crew mobilized with PPE and equipment'
    });
    assert.equal(dispatched.booking_id, 1);
    assert.equal(dispatched.tracking_status, 'dispatched_travelling');

    // 2. Arrival
    const arrived = await FumigationTrackingService.updateTrackingStatus({
      bookingId: 1,
      actorUser: { id: 1, full_name: 'Ibrahim Danladi', user_type: 'service_provider' },
      newStatus: 'arrived_on_site',
      note: 'On site conducting property perimeter assessment'
    });
    assert.equal(arrived.tracking_status, 'arrived_on_site');

    // 3. Treatment in progress
    const inProgress = await FumigationTrackingService.updateTrackingStatus({
      bookingId: 1,
      actorUser: { id: 1, full_name: 'Ibrahim Danladi', user_type: 'service_provider' },
      newStatus: 'chemical_treatment_active',
      note: 'Applying odorless residual spray and thermal fogging'
    });
    assert.equal(inProgress.tracking_status, 'chemical_treatment_active');

    // 4. Attempt completion WITHOUT completion evidence (should fail)
    await assert.rejects(
      async () => {
        await FumigationTrackingService.updateTrackingStatus({
          bookingId: 1,
          actorUser: { id: 1, full_name: 'Ibrahim Danladi', user_type: 'service_provider' },
          newStatus: 'service_completed',
          note: 'Trying to finish without evidence or safety specs'
        });
      },
      /without completion evidence/
    );

    // 4b. Attempt completion WITH photos but WITHOUT chemical safety disclosure (should fail)
    await assert.rejects(
      async () => {
        await FumigationTrackingService.updateTrackingStatus({
          bookingId: 1,
          actorUser: { id: 1, full_name: 'Ibrahim Danladi', user_type: 'service_provider' },
          newStatus: 'service_completed',
          afterPhotos: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80'],
          note: 'Photos uploaded but missing chemical names'
        });
      },
      /without recording the chemical applied/
    );

    // 5. Complete with mandatory chemical details and completion evidence
    const completed = await FumigationTrackingService.updateTrackingStatus({
      bookingId: 1,
      actorUser: { id: 1, full_name: 'Ibrahim Danladi', user_type: 'service_provider' },
      newStatus: 'service_completed',
      note: 'Treatment finished successfully. Windows secured for aeration.',
      chemicalName: 'Deltamethrin 2.5% EC',
      nafdacRegNumber: 'A4-2281',
      ventilationHours: 4,
      afterPhotos: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80'],
      safetyChecklist: {
        pets_removed: true,
        foodstuffs_sealed: true,
        windows_closed_initially: true,
        ppe_worn: true
      }
    });

    assert.equal(completed.booking_id, 1);
    assert.equal(completed.tracking_status, 'service_completed');
    assert.ok(completed.safe_reentry_at);
  });

  test('reportIncident and resolveIncident manages operational delays and chemical alerts', async () => {
    const incident = await FumigationTrackingService.reportIncident({
      bookingId: 1,
      reportedBy: { id: 1, full_name: 'Ibrahim Danladi', user_type: 'service_provider' },
      incidentType: 'weather_delay',
      severity: 'medium',
      description: 'Heavy rainfall pausing external perimeter thermal fogging',
      latitude: 9.07,
      longitude: 7.49
    });

    assert.ok(incident);
    assert.equal(incident.booking_id, 1);
    assert.equal(incident.incident_type, 'weather_delay');
    assert.equal(incident.status, 'reported');

    // Resolve incident
    const resolved = await FumigationTrackingService.resolveIncident({
      incidentId: incident.id,
      resolvedBy: { id: 2, full_name: 'Admin Yusuf', user_type: 'super_admin' },
      resolutionNotes: 'Rain cleared. Team resumed application with ground moisture barrier.'
    });

    assert.ok(resolved);
    assert.equal(resolved.status, 'resolved');
  });

  test('confirmTenantSignoff accepts customer confirmation or escalation report', async () => {
    const signoff = await FumigationTrackingService.confirmTenantSignoff({
      bookingId: 1,
      tenantId: 1,
      satisfied: true,
      rating: 5,
      feedback: 'Excellent service! Very professional crew and clear safety instructions.'
    });

    assert.ok(signoff);
    assert.equal(signoff.booking_id, 1);
    assert.equal(signoff.customer_satisfaction_status, 'confirmed_satisfied');
  });

  test('getTrackingSummary returns complete customer payload with safety countdown', async () => {
    const summary = await FumigationTrackingService.getTrackingSummary(1);
    assert.ok(summary);
    assert.equal(summary.booking_id, 1);
    assert.ok(summary.team);
    assert.ok(summary.safety_instructions);
    assert.ok(summary.safety_instructions.chemical_name);
    assert.ok(summary.safety_instructions.ventilation_hours >= 1);
    assert.ok(Array.isArray(summary.timeline_stages));
    assert.ok(summary.current_location);
    assert.equal(summary.current_location.latitude, 9.0722);
  });

  test('getLiveFleet and getZonalOverview return real-time operational metrics across geopolitical zones', async () => {
    const fleet = await FumigationTrackingService.getLiveFleet({ scope: 'GLOBAL' });
    assert.ok(Array.isArray(fleet));
    assert.ok(fleet.length >= 1);
    assert.ok(fleet[0].booking_id);

    const zonal = await FumigationTrackingService.getZonalOverview();
    assert.ok(zonal);
    assert.ok(zonal.zones);
    assert.ok(zonal.zones['North Central']);
    assert.ok(zonal.zones['South West']);
    assert.ok(typeof zonal.total_active_jobs === 'number');
  });
});
