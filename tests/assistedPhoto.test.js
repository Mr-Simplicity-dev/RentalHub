const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const actor = { id: 4, user_type: 'super_support_admin' };
function setup({ denied = false, user = {}, expired = false } = {}) {
  const calls = [], logs = [], sessions = new Map();
  const mocks = {
    '../config/middleware/database': { query: async (sql, args) => {
      calls.push({ sql, args });
      if (sql.startsWith('SELECT')) return { rows: [{ id: args[0], full_name: 'Customer', user_type: 'tenant', ...user }] };
      if (sql.startsWith('INSERT')) sessions.set(args[0], { user: args[1], staff: args[2] });
      if (sql.startsWith('UPDATE')) {
        const entry = sessions.get(args[0]);
        if (!entry || expired || entry.user !== args[1] || entry.staff !== args[2]) return { rows: [] };
        sessions.delete(args[0]);
        assert.match(sql, /consumed_at IS NULL AND expires_at>NOW\(\)/);
        return { rows: [{ user_id: args[1] }] };
      }
      return { rows: [] };
    } },
    './assistedRegistrationService': { recordForStaff: async (_actor, reference) => {
      if (denied) throw Error('outside assigned state');
      return { user_id: reference === 'another' ? 13 : 12 };
    } },
    './assistedRegistrationPolicy': { fail: (statusCode, message) => Object.assign(Error(message), { statusCode }) },
    './activityLogger': { log: async value => logs.push(value) },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'services/assistedPhotoService.js'), 'utf8'), {
    module, require: name => mocks[name] || require(name),
  });
  return { service: module.exports, calls, logs };
}
test('photo session requires consent and stores only a hash bound to customer and staff', async () => {
  const { service, calls, logs } = setup();
  await assert.rejects(service.start(actor, 'ref', {}), /agreement/);
  const { token } = await service.start(actor, 'ref', { consent_confirmed: true });
  const insert = calls.find(call => call.sql.startsWith('INSERT'));
  assert.equal(token.length, 64);
  assert.notEqual(insert.args[0], token);
  assert.deepEqual(Array.from(insert.args.slice(1)), [12, 4]);
  assert.equal(logs[0].action, 'ASSISTED_PHOTO_CONSENT_CONFIRMED');
  assert.equal(JSON.stringify(logs).includes(token), false);
});
test('scope and privileged/deleted/inactive customer checks apply before capture', async () => {
  const scoped = setup({ denied: true });
  await assert.rejects(scoped.service.start(actor, 'ref', { consent_confirmed: true }), /assigned state/);
  assert.equal(scoped.calls.length, 0);
  for (const user of [{ user_type: 'super_admin' }, { deleted_at: 'date' }, { is_active: false }]) {
    await assert.rejects(setup({ user }).service.start(actor, 'ref', { consent_confirmed: true }), /not eligible/);
  }
});
test('capture token cannot be reused by another staff member or replayed', async () => {
  const { service } = setup();
  const { token } = await service.start(actor, 'ref', { consent_confirmed: true });
  await assert.rejects(service.consume({ ...actor, id: 99 }, 'ref', token), /expired|used/);
  await assert.rejects(service.consume(actor, 'another', token), /expired|used/);
  assert.equal((await service.consume(actor, 'ref', token)).id, 12);
  await assert.rejects(service.consume(actor, 'ref', token), /expired|used/);
});
test('expired and malformed capture tokens are rejected', async () => {
  const { service } = setup({ expired: true });
  const { token } = await service.start(actor, 'ref', { consent_confirmed: true });
  await assert.rejects(service.consume(actor, 'ref', token), /expired/);
  await assert.rejects(service.consume(actor, 'ref', 'invalid'), /new customer/);
});

function handlerFixture(assisted, active = null) {
  const source = fs.readFileSync(path.join(root, 'routes/users.js'), 'utf8');
  const body = source.slice(source.indexOf('const handlePassportUpload = '), source.indexOf("router.post('/upload-passport'"));
  const updates = [], audits = [];
  const context = {
    ensureIdentitySchema: async () => {}, REQUIRE_LIVE_CAPTURE_SESSION: true,
    consumeLiveCaptureSession: () => true, cleanupUploadedFile: () => {},
    isPremblyConfigured: () => false, decryptNIN: value => value,
    db: { query: async (sql, args) => {
      if (sql.includes('UPDATE users')) { updates.push(args); return { rows: [] }; }
      return { rows: [{ nin_verified: true, identity_document_type: 'nin', nin: 'encrypted', active_revalidation_status: active }] };
    } },
    require: () => ({ audit: async (...args) => audits.push(args) }),
  };
  vm.runInNewContext(body + '\nthis.handler = handlePassportUpload;', context);
  const req = {
    user: actor, body: { capture_source: 'live_camera', user_id: 99, identity_verified: true },
    file: { filename: 'passport_12_test.jpg' }, logger: { error: () => {} },
    ...(assisted ? { assistedPassportSubject: { id: 12, full_name: 'Customer' } } : {}),
  };
  const res = { status() { return this; }, json(value) { this.body = value; } };
  return { run: () => context.handler(req, res), updates, audits, res };
}
test('assisted upload writes selected customer only, remains reviewable and returns no identity fields', async () => {
  const f = handlerFixture(true);
  await f.run();
  assert.equal(f.updates[0][4], 12);
  assert.equal(f.updates[0][1], false);
  assert.equal(f.audits[0][0].id, actor.id);
  assert.equal(f.res.body.success, true);
  assert.equal(f.res.body.user, undefined);
});
test('ordinary self upload keeps existing identity behaviour', async () => {
  const f = handlerFixture(false);
  await f.run();
  assert.equal(f.updates[0][4], actor.id);
  assert.equal(f.updates[0][1], true);
});
test('assisted photo preserves active revalidation requirements', async () => {
  const f = handlerFixture(true, 'provider_pending');
  await f.run();
  assert.equal(f.updates[0][3], 'provider_pending');
  assert.equal(f.updates[0][1], false);
});
test('staff photo routes retain MFA and scope before the shared secure image pipeline', () => {
  const source = fs.readFileSync(path.join(root, 'routes/assistedRegistration.js'), 'utf8');
  const route = source.indexOf("router.post('/staff/:reference/photo',");
  assert.ok(source.indexOf("router.use('/staff', authenticate, staff, requirePrivilegedMfa)") < route);
  assert.match(source.slice(route, source.indexOf("router.get('/staff/biometric-status'", route)), /sensitiveActionLimiter, authorizePhoto,[\s\S]*uploadPassportLocal[\s\S]*validateFileMagicBytesMiddleware[\s\S]*reprocessPassportImage[\s\S]*scanUploadForMalware[\s\S]*handlePassportUpload/);
});
