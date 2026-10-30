const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const load = (file, mocks, env = process.env) => {
  const full = path.join(__dirname, '..', file), mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), { module: mod, exports: mod.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(require.resolve(id, { paths: [path.dirname(full)] })), process: { env }, Buffer, console, __dirname: path.dirname(full), setTimeout, clearTimeout }, { filename: full });
  return mod.exports;
};
const matcher = () => load('services/fingerprintMatcher.js', { fs: { existsSync: () => true } }, { FINGERPRINT_ENCRYPTION_KEY: 'ab'.repeat(32) });
test('fingerprint templates are encrypted, randomized and bound to the customer', () => {
  const m = matcher();
  const a = m.seal(12, 'sensitive-template'), b = m.seal(12, 'sensitive-template');
  assert.notEqual(a, b); assert.equal(m.unseal(12, a), 'sensitive-template');
  assert.throws(() => m.unseal(13, a));
  const tampered = Buffer.from(a, 'base64'); tampered[30] ^= 1;
  assert.throws(() => m.unseal(12, tampered.toString('base64')));
});
test('missing encryption key and unsafe thresholds fail closed', () => {
  for (const env of [{}, { FINGERPRINT_ENCRYPTION_KEY: 'ab'.repeat(32), FINGERPRINT_MATCH_THRESHOLD: '0' }, { FINGERPRINT_ENCRYPTION_KEY: 'ab'.repeat(32), FINGERPRINT_MATCH_THRESHOLD: 'NaN' }]) {
    const m = load('services/fingerprintMatcher.js', { fs: { existsSync: () => true } }, env);
    assert.throws(() => m.settings(), /not configured/);
  }
});
test('reader input rejects non-PNG, oversize and image bombs', () => {
  const m = matcher();
  for (const input of [null, 'abc', 'A'.repeat(400001)]) assert.throws(() => m.validateImage(input));
  const png = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a','hex').copy(png);
  png.writeUInt32BE(500000,16); png.writeUInt32BE(500000,20);
  assert.throws(() => m.validateImage(png.toString('base64')), /dimensions/);
});
const staff = { id: 4, user_type: 'super_support_admin' };
const setup = (overrides = {}) => {
  const calls = [], logs = [];
  const query = async (sql, args) => {
    calls.push({ sql, args });
    if (sql.includes('SELECT user_type')) return { rows: [{ user_type: 'tenant', phone_verified: true, phone: '08031234567' }] };
    if (sql.includes('SELECT encrypted_template')) return { rows: [{ encrypted_template: 'encrypted', engine_version: 'sourceafis-3.18.1' }] };
    return { rows: [] };
  };
  const service = load('services/officeFingerprintService.js', {
    '../config/middleware/database': { query: overrides.query || query, connect: overrides.connect || (async () => { throw new Error('Unexpected transaction'); }) },
    './assistedRegistrationService': { recordForStaff: overrides.record || (async () => ({ user_id: 12 })) },
    './fingerprintMatcher': { ENGINE: 'sourceafis-3.18.1', settings: () => {}, validateImage: () => {}, seal: () => 'encrypted-template', unseal: () => 'server-template', run: overrides.run || (async (_op, data) => { assert.equal(data.template, 'server-template'); return { matches: true }; }) },
    './activityLogger': { log: async data => logs.push(data) }
  });
  return { service, calls, logs };
};
test('staff scope rejection occurs before biometric lookup or matching', async () => {
  const { service, calls } = setup({ record: async () => { throw new Error('outside your assigned state'); } });
  await assert.rejects(service.verify(staff, 'ref', { image: 'scan' }), /assigned state/);
  assert.equal(calls.length, 0);
});
test('privileged and deleted customer accounts cannot be verified', async () => {
  for (const user of [{ user_type: 'super_admin' }, { user_type: 'tenant', deleted_at: '2026-01-01' }, { user_type: 'tenant', is_active: false }]) {
    const { service } = setup({ query: async () => ({ rows: [user] }) });
    await assert.rejects(service.verify(staff, 'ref', {}), /not eligible/);
  }
});
test('verification ignores submitted template/threshold and returns no login token or biometric data', async () => {
  const { service, logs } = setup();
  const result = await service.verify(staff, 'ref', { image: 'scan', template: 'attacker-template', threshold: 0, matched: true });
  assert.equal(result.matched, true);
  assert.deepEqual(Object.keys(result).sort(), ['matched','message']);
  assert.equal(logs[0].action, 'FINGERPRINT_MATCHED');
  assert.equal(JSON.stringify(logs).includes('server-template'), false);
});
test('a non-match remains a non-match and is audited', async () => {
  const { service, logs } = setup({ run: async () => ({ matches: false }) });
  assert.equal((await service.verify(staff, 'ref', { image: 'scan' })).matched, false);
  assert.equal(logs[0].action, 'FINGERPRINT_NOT_MATCHED');
});
test('enrollment refuses missing consent before processing scans', async () => {
  const { service } = setup();
  await assert.rejects(service.enroll(staff, 'ref', {}), /consent/);
});
test('unverified phone cannot receive enrollment approval', async () => {
  const { service } = setup({ query: async () => ({ rows: [{ user_type: 'tenant', phone_verified: false }] }) });
  await assert.rejects(service.requestConsent(staff, 'ref', { consent_confirmed: true }), /verify their phone/);
});
test('only a scoped supervisor can remove enrollment', async () => {
  const { service, calls } = setup();
  await assert.rejects(service.revoke({ id: 5, user_type: 'state_support_admin' }, 'ref'), /supervisor/);
  assert.equal(calls.some(c => c.sql.startsWith('DELETE')), false);
});
test('matcher startup failure is reported as unavailable without internal details', async () => {
  const { service } = setup({ run: async () => { throw new Error('secret path'); } });
  const result = await service.status();
  assert.equal(result.available, false); assert.equal(result.reason.includes('secret'), false);
});
test('enrollment approval is bound to staff and user, and cannot be replayed', async () => {
  for (const row of [null, {user_id:99,staff_id:4}, {user_id:12,staff_id:99}, {user_id:12,staff_id:4,consumed_at:new Date()}, {user_id:12,staff_id:4,attempts:5}, {user_id:12,staff_id:4,expires_at:new Date(0)}]) {
    let matched = false;
    const { service } = setup({ connect: async () => ({ query: async sql => ({ rows: sql.startsWith('SELECT') && row ? [{ phone_key:'+2348031234567', expires_at: new Date(Date.now()+60000), ...row }] : [] }), release() {} }), run: async () => { matched = true; } });
    await assert.rejects(service.enroll(staff,'ref',{consent_confirmed:true,challenge_id:'12345678-1234-4123-8123-123456789abc',enrollment_code:'123456'}), /expired/);
    assert.equal(matched,false);
  }
});
test('valid customer approval enrolls only encrypted template, and removes consumed approval', async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'office-fingerprint-test-secret';
  try {
    const { otpHash } = require('../services/assistedRegistrationPolicy');
    const id = '12345678-1234-4123-8123-123456789abc', queries = [];
    const query = async (sql,args) => {
      queries.push({sql,args});
      if (sql.startsWith('SELECT * FROM office_fingerprint_challenges')) return {rows:[{id,user_id:12,staff_id:4,phone_key:'+2348031234567',attempts:0,expires_at:new Date(Date.now()+60000),code_hash:otpHash(id,'123456')}]};
      if (sql.startsWith('SELECT id FROM users') || sql.startsWith('SELECT id FROM office_fingerprint_challenges')) return {rows:[{id:12}]};
      return {rows:[]};
    };
    const {service,logs}=setup({connect:async()=>({query,release(){}}),run:async()=>({matches:true,template:'private-template'})});
    const result = await service.enroll(staff,'ref',{consent_confirmed:true,challenge_id:id,enrollment_code:'123456',image:'scan-a',confirmation:'scan-b'});
    assert.equal(result.enrolled,true);
    assert.equal(queries.find(q=>q.sql.startsWith('INSERT INTO office_fingerprint_enrollments')).args[1],'encrypted-template');
    assert.ok(queries.some(q=>q.sql.startsWith('DELETE FROM office_fingerprint_challenges')));
    assert.equal(JSON.stringify(queries).includes('private-template'),false);
    assert.equal(JSON.stringify(logs).includes('scan-a'),false);
  } finally { if(previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET=previous; }
});
test('all fingerprint routes sit behind staff authentication and MFA; writes are rate limited', () => {
  const routes = fs.readFileSync(path.join(__dirname,'../routes/assistedRegistration.js'),'utf8');
  const guard = routes.indexOf("router.use('/staff', authenticate, staff, requirePrivilegedMfa)");
  for (const action of ['consent','enroll','verify']) {
    const start = routes.indexOf(`router.post('/staff/:reference/fingerprint/${action}'`);
    assert.ok(start > guard && guard >= 0);
    assert.match(routes.slice(start, routes.indexOf('\n',start)), /sensitiveActionLimiter/);
  }
});
