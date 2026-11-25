const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');

const { createStaffIdentityService } = require('../services/staffIdentityService');
const {
  createStaffVerificationRouter,
  hasValidImageMagicBytes,
} = require('../routes/staffVerification');

const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2059_staff_identity_verification_portal.sql'),
  'utf8'
);

// PGlite adapter exposing pg Pool-like query() and serialized connect() with transaction lock
function createPglitePool(pg) {
  let txChain = Promise.resolve();

  const adapter = {
    query: (text, params) => pg.query(text, params),
    connect: async () => {
      let releaseLock;
      const myTurn = txChain;
      txChain = txChain.then(
        () => new Promise((resolve) => {
          releaseLock = resolve;
        })
      );
      await myTurn;

      let released = false;
      return {
        query: (text, params) => pg.query(text, params),
        release: () => {
          if (!released) {
            released = true;
            releaseLock();
          }
        },
      };
    },
  };
  return adapter;
}

async function setupEnv() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(50),
      user_type VARCHAR(60) NOT NULL,
      nin VARCHAR(64),
      bvn VARCHAR(64),
      residential_address TEXT,
      salary NUMERIC,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(80),
      link TEXT,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pg.exec(MIGRATION_SQL);

  await pg.query(
    `INSERT INTO users (id, full_name, email, phone, user_type, nin, bvn, residential_address, salary, is_active)
     VALUES
       (1, 'Chief Super Admin', 'super@rentalhub.com.ng', '+2348000000001', 'super_admin', '11111111111', '22222222222', '1 HQ Way, Abuja', 500000, TRUE),
       (2, 'Amina Bello', 'amina@rentalhub.com.ng', '+2348000000002', 'agent', '33333333333', '44444444444', '22 Private St, Lagos', 180000, TRUE),
       (3, 'Chinedu Okafor', 'chinedu@rentalhub.com.ng', '+2348000000003', 'marketing_agent', '55555555555', '66666666666', '15 Secret Ave, Enugu', 150000, TRUE),
       (4, 'Regular Tenant', 'tenant@example.com', '+2348000000004', 'tenant', '77777777777', '88888888888', '9 Tenant Rd, Kano', 0, TRUE)`
  );

  const db = createPglitePool(pg);
  const auditLogs = [];
  const socketEvents = [];

  const service = createStaffIdentityService({
    db,
    qrcode: { toDataURL: async (val) => `data:image/png;base64,QR(${val})` },
    activityLogger: { log: async (entry) => auditLogs.push(entry) },
    realtimeEmitter: {
      emitToUser: (userId, event, payload) => socketEvents.push({ userId, event, payload }),
      emitToRole: (role, event, payload) => socketEvents.push({ role, event, payload }),
    },
    getFrontendUrl: () => 'https://rentalhub.com.ng',
  });

  const noopLimiter = (_req, _res, next) => next();
  const fakeAuth = (req, res, next) => {
    const uid = req.headers['x-test-user-id'];
    const role = req.headers['x-test-user-role'];
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
    req.user = {
      id: Number(uid),
      user_type: role || 'agent',
      full_name: `User ${uid}`,
    };
    if (req.headers['x-test-impersonating'] === 'true') {
      req.auth = { impersonation: true };
    }
    return next();
  };
  const fakeSuperAdmin = (req, res, next) => {
    if (!req.user || req.user.user_type !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Super admin access only' });
    }
    return next();
  };
  const fakeNotImpersonating = (req, res, next) => {
    if (req.auth?.impersonation) {
      return res.status(403).json({ success: false, message: 'Blocked while impersonating' });
    }
    return next();
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api/staff-verification',
    createStaffVerificationRouter({
      service,
      authenticate: fakeAuth,
      requireSuperAdmin: fakeSuperAdmin,
      requireNotImpersonating: fakeNotImpersonating,
      lookupLimiter: noopLimiter,
      challengeCreateLimiter: noopLimiter,
      challengePollLimiter: noopLimiter,
      impersonationLimiter: noopLimiter,
      storeProcessedStaffPhoto: async () => '/uploads/staff-photos/test_verified.jpg',
    })
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = async (method, urlPath, { headers = {}, body } = {}) => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
  };

  return {
    pg,
    service,
    auditLogs,
    socketEvents,
    request,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await pg.close();
    },
  };
}

test('Staff Identity Verification Portal end-to-end security, lifecycle, live confirmation, concurrency, and impersonation tests', async (t) => {
  const env = await setupEnv();
  t.after(() => env.close());

  const superHeaders = { 'x-test-user-id': '1', 'x-test-user-role': 'super_admin' };
  const staffAHeaders = { 'x-test-user-id': '2', 'x-test-user-role': 'agent' };
  const staffBHeaders = { 'x-test-user-id': '3', 'x-test-user-role': 'marketing_agent' };
  const tenantHeaders = { 'x-test-user-id': '4', 'x-test-user-role': 'tenant' };

  // 1. Public & non-super-admin users cannot access super-admin endpoints
  {
    const unauth = await env.request('GET', '/api/staff-verification/admin/identities');
    assert.equal(unauth.status, 401);

    const asAgent = await env.request('POST', '/api/staff-verification/admin/identities', {
      headers: staffAHeaders,
      body: { user_id: 2 },
    });
    assert.equal(asAgent.status, 403);

    const asTenant = await env.request('GET', '/api/staff-verification/admin/impersonation-reports', {
      headers: tenantHeaders,
    });
    assert.equal(asTenant.status, 403);
  }

  // 2. Super-admin cannot register an ineligible tenant account
  {
    const bad = await env.request('POST', '/api/staff-verification/admin/identities', {
      headers: superHeaders,
      body: {
        user_id: 4,
        official_role: 'Tenant',
        department: 'Public',
        engagement_type: 'volunteer',
      },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'INELIGIBLE_ACCOUNT_ROLE');
  }

  // 3. Super-admin registers eligible agent (starts pending_approval, NOT auto-approved)
  let staffA;
  {
    const created = await env.request('POST', '/api/staff-verification/admin/identities', {
      headers: superHeaders,
      body: {
        user_id: 2,
        full_name: 'Amina Bello',
        official_role: 'Senior Field Inspection Officer',
        department: 'Property Operations',
        engagement_type: 'field_agent',
        approved_activities: [
          'coordinate_property_inspections',
          'assist_property_viewing',
          'collect_cash_rent_unlisted_fake_code', // must be stripped!
        ],
        official_photo_url: 'https://res.cloudinary.com/demo/image/upload/amina.jpg',
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    assert.equal(created.status, 201);
    staffA = created.json.data;
    assert.equal(staffA.status, 'pending_approval');
    assert.match(staffA.staff_verification_id, /^AMN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.deepEqual(staffA.approved_activities, [
      'coordinate_property_inspections',
      'assist_property_viewing',
    ]);
    assert.equal(staffA.financial_collection_authorized, false);
  }

  // 4. Pending identity MUST NOT appear as verified publicly (returns NOT_FOUND)
  {
    const res = await env.request(
      'GET',
      `/api/staff-verification/public/lookup/${encodeURIComponent(staffA.staff_verification_id)}`
    );
    assert.equal(res.status, 200);
    assert.equal(res.json.data.verification_state, 'NOT_FOUND');
    assert.equal(res.json.data.staff_profile, null);
    assert.equal(res.json.data.payment_safety_notice.title, 'IMPORTANT PAYMENT SAFETY NOTICE');
  }

  // 5. Unknown staff ID returns NOT_FOUND
  {
    const res = await env.request('GET', '/api/staff-verification/public/lookup/AMN-ZZZZ-9999-XXXX');
    assert.equal(res.status, 200);
    assert.equal(res.json.data.verification_state, 'NOT_FOUND');
    assert.equal(res.json.data.staff_profile, null);
  }

  // 6. Super-admin approves Staff A -> public manual ID & QR URL lookups work & never leak PII
  {
    const approved = await env.request(
      'POST',
      `/api/staff-verification/admin/identities/${staffA.id}/status`,
      {
        headers: superHeaders,
        body: { action: 'approve', reason: 'Verified HR records' },
      }
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.json.data.status, 'active');

    // Manual lookup (unauthenticated visitor)
    const manual = await env.request(
      'GET',
      `/api/staff-verification/public/lookup/${encodeURIComponent(staffA.staff_verification_id)}`
    );
    assert.equal(manual.status, 200);
    assert.equal(manual.json.data.verification_state, 'ACTIVE_REGISTRATION');
    const p = manual.json.data.staff_profile;
    assert.equal(p.full_name, 'Amina Bello');
    assert.equal(p.staff_verification_id, staffA.staff_verification_id);
    assert.equal(p.department, 'Property Operations');
    assert.equal(p.engagement_type, 'field_agent');
    assert.equal(p.financial_collection_authorized, false);
    assert.equal(p.can_request_live_confirmation, true);
    assert.equal(p.approved_activities.length, 2);

    // Strict PII non-exposure check
    const serialized = JSON.stringify(manual.json);
    for (const secret of [
      '33333333333', // NIN
      '44444444444', // BVN
      '+2348000000002', // phone
      'amina@rentalhub.com.ng', // email
      '22 Private St, Lagos', // address
      '180000', // salary
      'Verified HR records', // internal admin reason
    ]) {
      assert.ok(!serialized.includes(secret), `Public response leaked private value: ${secret}`);
    }
    assert.equal('user_id' in p, false);
    assert.equal('id' in p, false);

    // QR URL lookup via POST
    const qrLookup = await env.request('POST', '/api/staff-verification/public/lookup', {
      body: { qr_payload: `https://rentalhub.com.ng/verify-staff/${staffA.staff_verification_id}` },
    });
    assert.equal(qrLookup.status, 200);
    assert.equal(qrLookup.json.data.verification_state, 'ACTIVE_REGISTRATION');
    assert.equal(qrLookup.json.data.staff_profile.staff_verification_id, staffA.staff_verification_id);
  }

  // 7. Register & approve Staff B so we can test cross-staff isolation
  let staffB;
  {
    const createdB = await env.request('POST', '/api/staff-verification/admin/identities', {
      headers: superHeaders,
      body: {
        user_id: 3,
        full_name: 'Chinedu Okafor',
        official_role: 'Field Marketing Officer',
        department: 'Growth',
        engagement_type: 'employee',
        approved_activities: ['provide_platform_support'],
      },
    });
    staffB = createdB.json.data;
    await env.request('POST', `/api/staff-verification/admin/identities/${staffB.id}/status`, {
      headers: superHeaders,
      body: { action: 'approve' },
    });
  }

  // 8. Live confirmation: create challenge, block unauth & wrong staff, allow owner, block replay
  {
    const challengeRes = await env.request('POST', '/api/staff-verification/public/challenges', {
      body: {
        staff_verification_id: staffA.staff_verification_id,
        purpose: 'Property inspection visit at Lekki Phase 1',
      },
    });
    assert.equal(challengeRes.status, 201);
    const ch = challengeRes.json.data;
    assert.equal(ch.verification_state, 'PENDING');
    assert.match(ch.challenge_reference, /^CHK-/);
    assert.match(ch.short_code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.ok(ch.qr_payload.startsWith('amana-staff-challenge:'));
    assert.ok(ch.visitor_poll_token.length >= 20);

    // Unauthenticated person cannot approve
    const unauthRespond = await env.request(
      'POST',
      `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`,
      { body: { decision: 'confirm' } }
    );
    assert.equal(unauthRespond.status, 401);

    // Different staff member (Staff B) CANNOT lookup or approve Staff A's challenge
    const wrongLookup = await env.request(
      'POST',
      '/api/staff-verification/me/challenges/lookup',
      { headers: staffBHeaders, body: { code: ch.short_code } }
    );
    assert.equal(wrongLookup.status, 403);

    const wrongRespond = await env.request(
      'POST',
      `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`,
      { headers: staffBHeaders, body: { decision: 'confirm' } }
    );
    assert.equal(wrongRespond.status, 403);

    // Impersonating session cannot approve
    const impersonatedRespond = await env.request(
      'POST',
      `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`,
      {
        headers: { ...staffAHeaders, 'x-test-impersonating': 'true' },
        body: { decision: 'confirm' },
      }
    );
    assert.equal(impersonatedRespond.status, 403);

    // Visitor polls while pending -> PENDING
    const pollPending = await env.request(
      'GET',
      `/api/staff-verification/public/challenges/${ch.challenge_reference}`,
      { headers: { 'x-challenge-poll-token': ch.visitor_poll_token } }
    );
    assert.equal(pollPending.status, 200);
    assert.equal(pollPending.json.data.verification_state, 'PENDING');

    // Correct staff member looks up via short code and confirms
    const ownerLookup = await env.request(
      'POST',
      '/api/staff-verification/me/challenges/lookup',
      { headers: staffAHeaders, body: { code: ch.short_code } }
    );
    assert.equal(ownerLookup.status, 200);
    assert.equal(ownerLookup.json.data.challenge_reference, ch.challenge_reference);

    const ownerConfirm = await env.request(
      'POST',
      `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`,
      { headers: staffAHeaders, body: { decision: 'confirm' } }
    );
    assert.equal(ownerConfirm.status, 200);
    assert.equal(ownerConfirm.json.data.verification_state, 'LIVE_CONFIRMATION_SUCCESSFUL');

    // Visitor poll now returns authoritative LIVE_CONFIRMATION_SUCCESSFUL
    const pollConfirmed = await env.request(
      'GET',
      `/api/staff-verification/public/challenges/${ch.challenge_reference}`,
      { headers: { 'x-challenge-poll-token': ch.visitor_poll_token } }
    );
    assert.equal(pollConfirmed.status, 200);
    assert.equal(pollConfirmed.json.data.verification_state, 'LIVE_CONFIRMATION_SUCCESSFUL');

    // Replay / reuse of already-confirmed challenge is rejected (409)
    const replay = await env.request(
      'POST',
      `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`,
      { headers: staffAHeaders, body: { decision: 'confirm' } }
    );
    assert.equal(replay.status, 409);
  }

  // 9. Concurrent challenge acceptance cannot produce multiple successful results
  {
    const chRes = await env.request('POST', '/api/staff-verification/public/challenges', {
      body: {
        staff_verification_id: staffA.staff_verification_id,
        purpose: 'Concurrent acceptance race test',
      },
    });
    const ch = chRes.json.data;
    const [r1, r2, r3] = await Promise.all([
      env.request('POST', `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`, {
        headers: staffAHeaders,
        body: { decision: 'confirm' },
      }),
      env.request('POST', `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`, {
        headers: staffAHeaders,
        body: { decision: 'confirm' },
      }),
      env.request('POST', `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`, {
        headers: staffAHeaders,
        body: { decision: 'reject' },
      }),
    ]);
    const statuses = [r1.status, r2.status, r3.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409, 409]);
  }

  // 10. Staff rejection returns REJECTED to visitor
  {
    const chRes = await env.request('POST', '/api/staff-verification/public/challenges', {
      body: {
        staff_verification_id: staffA.staff_verification_id,
        purpose: 'Suspicious unexpected request',
      },
    });
    const ch = chRes.json.data;
    const rej = await env.request(
      'POST',
      `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`,
      { headers: staffAHeaders, body: { decision: 'reject' } }
    );
    assert.equal(rej.status, 200);
    assert.equal(rej.json.data.verification_state, 'REJECTED');

    const poll = await env.request(
      'GET',
      `/api/staff-verification/public/challenges/${ch.challenge_reference}`,
      { headers: { 'x-challenge-poll-token': ch.visitor_poll_token } }
    );
    assert.equal(poll.json.data.verification_state, 'REJECTED');
  }

  // 11. Expired challenge is rejected (410) and poll returns EXPIRED
  {
    const chRes = await env.request('POST', '/api/staff-verification/public/challenges', {
      body: {
        staff_verification_id: staffA.staff_verification_id,
        purpose: 'Expiry enforcement test',
      },
    });
    const ch = chRes.json.data;
    await env.pg.query(
      `UPDATE staff_verification_challenges SET expires_at = NOW() - INTERVAL '5 seconds' WHERE challenge_reference = $1`,
      [ch.challenge_reference]
    );

    const lateConfirm = await env.request(
      'POST',
      `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`,
      { headers: staffAHeaders, body: { decision: 'confirm' } }
    );
    assert.equal(lateConfirm.status, 410);

    const poll = await env.request(
      'GET',
      `/api/staff-verification/public/challenges/${ch.challenge_reference}`,
      { headers: { 'x-challenge-poll-token': ch.visitor_poll_token } }
    );
    assert.equal(poll.json.data.verification_state, 'EXPIRED');
  }

  // 12. Staff suspension DURING a pending challenge blocks confirmation AND returns SUSPENDED
  {
    const chRes = await env.request('POST', '/api/staff-verification/public/challenges', {
      body: {
        staff_verification_id: staffA.staff_verification_id,
        purpose: 'Mid-challenge suspension test',
      },
    });
    const ch = chRes.json.data;

    const suspendRes = await env.request(
      'POST',
      `/api/staff-verification/admin/identities/${staffA.id}/status`,
      { headers: superHeaders, body: { action: 'suspend', reason: 'Under review' } }
    );
    assert.equal(suspendRes.status, 200);

    // Staff cannot confirm now (cancelled/suspended)
    const blocked = await env.request(
      'POST',
      `/api/staff-verification/me/challenges/${ch.challenge_reference}/respond`,
      { headers: staffAHeaders, body: { decision: 'confirm' } }
    );
    assert.ok([403, 409].includes(blocked.status));

    // Public lookup & challenge poll BOTH return SUSPENDED
    const lookupSuspended = await env.request(
      'GET',
      `/api/staff-verification/public/lookup/${encodeURIComponent(staffA.staff_verification_id)}`
    );
    assert.equal(lookupSuspended.json.data.verification_state, 'SUSPENDED');
    assert.equal(lookupSuspended.json.data.staff_profile.can_request_live_confirmation, false);

    const pollSuspended = await env.request(
      'GET',
      `/api/staff-verification/public/challenges/${ch.challenge_reference}`,
      { headers: { 'x-challenge-poll-token': ch.visitor_poll_token } }
    );
    assert.equal(pollSuspended.json.data.verification_state, 'SUSPENDED');
  }

  // 13. Revoked & Expired staff registrations return exact states and block challenges
  {
    await env.request(
      'POST',
      `/api/staff-verification/admin/identities/${staffA.id}/status`,
      { headers: superHeaders, body: { action: 'revoke', reason: 'Left organisation' } }
    );
    const revoked = await env.request(
      'GET',
      `/api/staff-verification/public/lookup/${encodeURIComponent(staffA.staff_verification_id)}`
    );
    assert.equal(revoked.json.data.verification_state, 'REVOKED');

    const chRevoked = await env.request('POST', '/api/staff-verification/public/challenges', {
      body: { staff_verification_id: staffA.staff_verification_id, purpose: 'Blocked test' },
    });
    assert.equal(chRevoked.status, 403);

    // Reinstate then expire registration date
    await env.request(
      'POST',
      `/api/staff-verification/admin/identities/${staffA.id}/status`,
      { headers: superHeaders, body: { action: 'reinstate' } }
    );
    await env.pg.query(
      `UPDATE staff_identities SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [staffA.id]
    );
    const expiredReg = await env.request(
      'GET',
      `/api/staff-verification/public/lookup/${encodeURIComponent(staffA.staff_verification_id)}`
    );
    assert.equal(expiredReg.json.data.verification_state, 'EXPIRED_STAFF_REGISTRATION');
    assert.equal(expiredReg.json.data.staff_profile.can_request_live_confirmation, false);
  }

  // 14. Public impersonation reporting records securely without exposing complainant publicly
  {
    const rep = await env.request(
      'POST',
      '/api/staff-verification/public/impersonation-reports',
      {
        body: {
          reported_staff_id: staffA.staff_verification_id,
          category: 'unauthorised_payment_request',
          description: 'Caller asked me to transfer rent to a personal bank account.',
          incident_location: 'Lekki, Lagos',
          reporter_name: 'Tunde Adeyemi',
          reporter_contact: '+2348099999999',
        },
      }
    );
    assert.equal(rep.status, 201);
    assert.match(rep.json.data.report_reference, /^IMP-/);
    assert.equal('reporter_contact' in rep.json.data, false);
    assert.equal('reporter_name' in rep.json.data, false);

    // Super-admin can review reports and history
    const listReps = await env.request(
      'GET',
      '/api/staff-verification/admin/impersonation-reports',
      { headers: superHeaders }
    );
    assert.equal(listReps.status, 200);
    assert.equal(listReps.json.data.length, 1);
    assert.equal(listReps.json.data[0].reporter_contact, '+2348099999999');

    const hist = await env.request('GET', '/api/staff-verification/admin/history', {
      headers: superHeaders,
    });
    assert.equal(hist.status, 200);
    assert.ok(hist.json.data.events.length > 0);
    assert.ok(hist.json.data.challenges.length > 0);
  }

  // 15. Image magic-byte validation blocks fake/script uploads and allows real JPEG/PNG/WebP
  {
    assert.equal(hasValidImageMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), true);
    assert.equal(hasValidImageMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), true);
    assert.equal(hasValidImageMagicBytes(Buffer.from('RIFFxxxxWEBP')), true);
    assert.equal(hasValidImageMagicBytes(Buffer.from('<svg onload=alert(1)></svg>')), false);
    assert.equal(hasValidImageMagicBytes(Buffer.from('%PDF-1.7 fake image')), false);
  }
});
