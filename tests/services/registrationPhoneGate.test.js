const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const makeGate = require('../../services/registrationPhoneGate');

function setup({ smsFails = false } = {}) {
  const rows = new Map(); let sent = 0;
  const db = { query: async (sql, args = []) => {
    if (/BEGIN|COMMIT|ROLLBACK|pg_advisory/.test(sql)) return { rows: [] };
    if (sql.includes('SELECT id') && sql.includes('consumed_at IS NOT NULL')) { const row = rows.get(args[0]); return { rows: row?.consumed && row.payload_digest === args[1] && row.created > Date.now()-86400000 ? [row] : [] }; }
    if (sql.includes('SELECT id')) return { rows: [...rows.values()].filter(row => row.phoneKey === args[0] && row.created > Date.now() - 60000) };
    if (sql.startsWith('INSERT')) { rows.set(args[0], { id: args[0], phoneKey: args[1], payload_digest: args[2], code_hash: '', attempts: 0, expires: Date.now() + 600000, created: Date.now() }); return { rows: [] }; }
    if (sql.includes('SET code_hash')) { rows.get(args[1]).code_hash = args[0]; return { rows: [] }; }
    if (sql.includes('SET attempts')) { const row = rows.get(args[0]); if (!row || row.consumed || row.expires < Date.now() || row.attempts >= 5) return { rows: [] }; row.attempts++; return { rows: [{ ...row }] }; }
    if (sql.includes('WHERE phone_key')) { for (const row of rows.values()) if (row.phoneKey === args[0]) row.consumed = true; return { rows: [] }; }
    if (sql.includes('SET consumed_at')) { const row = rows.get(args[0]); if (row.consumed) return { rows: [] }; row.consumed = true; return { rows: [row] }; }
    throw Error('Unexpected SQL: ' + sql);
  } };
  db.connect = async () => ({ query: db.query, release() {} });
  const gate = makeGate({ db, secret: () => 'test-secret-only', sendVerificationCode: async () => { sent++; return { success: !smsFails, code: 123456 }; } });
  return { gate, rows, sent: () => sent };
}
const details = { user_type: 'tenant', phone: '08012345678', email: 'test@example.test', password: 'test-password', payment_method: 'paystack', registration_flow: 'paid' };
test('sends once before payment, stores only hashed code, returns ten-minute challenge', async () => {
  const f = setup(), challenge = await f.gate.send(details);
  assert.equal(f.sent(), 1); assert.equal(challenge.expires_in, 600); assert.equal(challenge.otp_required, true);
  assert.equal([...f.rows.values()][0].code_hash.length, 64);
  assert.ok(!JSON.stringify([...f.rows.values()]).includes('123456'));
  await assert.rejects(f.gate.send(details), { code: 'OTP_COOLDOWN' });
});
test('tenant, landlord and free registrations verify only their bound details', async () => {
  for (const payload of [details, { ...details, user_type: 'landlord' }, { ...details, registration_flow: 'free' }]) {
    const f = setup(), c = await f.gate.send(payload);
    const grant = await f.gate.verify({ ...payload, phone_challenge: c.phone_challenge, otp: '123456' });
    assert.equal(require('jsonwebtoken').decode(grant).purpose, 'registration-phone');
    await assert.rejects(f.gate.verify({ ...payload, phone_challenge: c.phone_challenge, otp: '123456' }), { code: 'OTP_EXPIRED' });
  }
});
test('changing phone, email, role, method, password or flow cannot reuse verification', async () => {
  for (const [key, value] of Object.entries({ phone: '08099999999', email: 'other@example.test', user_type: 'super_admin', payment_method: 'bank_transfer', password: 'changed', registration_flow: 'free' })) {
    const f = setup(), c = await f.gate.send(details);
    await assert.rejects(f.gate.verify({ ...details, [key]: value, phone_challenge: c.phone_challenge, otp: '123456' }), { code: 'OTP_DETAILS_CHANGED' });
  }
});
test('five incorrect attempts lock a challenge; expiry and malformed codes are rejected', async () => {
  const f = setup(), c = await f.gate.send(details);
  const payload = { ...details, phone_challenge: c.phone_challenge };
  for (let i = 0; i < 5; i++) await assert.rejects(f.gate.verify({ ...payload, otp: '999999' }), { code: 'OTP_INVALID' });
  await assert.rejects(f.gate.verify({ ...payload, otp: '123456' }), { code: 'OTP_EXPIRED' });
  await assert.rejects(f.gate.verify({ ...payload, otp: '1' }), { code: 'OTP_INVALID' });
  const g = setup(), d = await g.gate.send(details); g.rows.get(d.phone_challenge).expires = 0;
  await assert.rejects(g.gate.verify({ ...details, phone_challenge: d.phone_challenge, otp: '123456' }), { code: 'OTP_EXPIRED' });
});
test('resending invalidates the previous code; failed SMS never claims a successful send', async () => {
  const f = setup(), c = await f.gate.send(details); f.rows.get(c.phone_challenge).created = 0;
  await f.gate.send(details);
  await assert.rejects(f.gate.verify({ ...details, phone_challenge: c.phone_challenge, otp: '123456' }), { code: 'OTP_EXPIRED' });
  await assert.rejects(setup({ smsFails: true }).gate.send(details), { code: 'OTP_SEND_FAILED' });
});
test('only one concurrent correct verification consumes a code', async () => {
  const f = setup(), c = await f.gate.send(details), payload = { ...details, phone_challenge: c.phone_challenge, otp: '123456' };
  const results = await Promise.allSettled([f.gate.verify(payload), f.gate.verify(payload)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});
test('initialization returns the phone gate before KYC, account creation or Paystack', async () => {
  const source = fs.readFileSync(require.resolve('../../services/authService'), 'utf8');
  const start = source.indexOf('exports.initializeRegistrationPayment = async');
  const end = source.indexOf('\n// Send a phone-OTP', start);
  let calls = 0; const context = { exports: {}, ensureTenantRegistrationPaymentSchema: async () => {}, getFeatureFlagsMap: async () => ({}), validationResult: () => ({ isEmpty: () => true }), PAYSTACK_SECRET_KEY: 'test', phoneGateResponse: async (_, res) => { calls++; res.json({ code: 'PHONE_VERIFICATION_REQUIRED' }); return true; } };
  vm.runInNewContext(source.slice(start, end), context);
  for (const user_type of ['tenant', 'landlord']) {
    let response; await context.exports.initializeRegistrationPayment({ body: { user_type }, logger: { error: error => { throw error; } } }, { json: value => { response = value; } });
    assert.equal(response.code, 'PHONE_VERIFICATION_REQUIRED');
  }
  assert.equal(calls, 2);
});

test('a reference or forged paid payload cannot bypass phone proof; phone proof cannot bypass actual payment', async () => {
  const source = fs.readFileSync(require.resolve('../../services/authService'), 'utf8');
  const start = source.indexOf('exports.completeRegistrationAfterPayment = async');
  const end = source.indexOf('\n};', start) + 4;
  const proof = 'verified-browser-secret'; let gatewayCalls = 0;
  const row = { transaction_reference: 'test-reference', payment_status: 'pending', created_at: new Date(), registration_payload: { registration_phone_grant_hash: makeGate.hashGrant(proof) } };
  const context = { exports: {}, ensureTenantRegistrationPaymentSchema: async () => {}, db: { query: async () => ({ rows: [row] }) }, hashGrant: makeGate.hashGrant, PAYSTACK_SECRET_KEY: 'test', PAYSTACK_BASE_URL: 'https://api.paystack.co', axios: { get: async () => { gatewayCalls++; return { data: { data: { status: 'failed' } } }; } } };
  vm.runInNewContext(source.slice(start, end), context);
  for (const token of [undefined, 'wrong-secret']) {
    const res = { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
    await context.exports.completeRegistrationAfterPayment({ params: { reference: 'test-reference' }, body: { completion_token: token, payment_status: 'completed', application_fee: 0 }, logger: { error() {} } }, res);
    assert.equal(res.statusCode, 428); assert.equal(gatewayCalls, 0);
  }
  const res = { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
  await context.exports.completeRegistrationAfterPayment({ params: { reference: 'test-reference' }, body: { completion_token: proof, payment_status: 'completed' }, logger: { error() {} } }, res);
  assert.equal(gatewayCalls, 1); assert.equal(res.statusCode, 402); assert.equal(res.body.success, false);
});

test('verified phone continues after OTP expiry, while forged or changed-detail continuation is rejected', async () => {
 const f=setup(), c=await f.gate.send(details), payload={...details,phone_challenge:c.phone_challenge,otp:'123456'};
 const grant=await f.gate.verify(payload);f.rows.get(c.phone_challenge).expires=0;
 assert.equal(await f.gate.resume({...payload,otp:undefined,phone_verification_token:grant},grant),grant);
 await assert.rejects(f.gate.resume({...payload,phone:'08099999999'},grant),{code:'OTP_DETAILS_CHANGED'});
 await assert.rejects(f.gate.resume(payload,'forged'),{code:'OTP_EXPIRED'});
 assert.throws(()=>require('../../config/utils/sessionToken').getSessionTokenIdentity(require('jsonwebtoken').decode(grant)));
 f.rows.get(c.phone_challenge).created=0;await assert.rejects(f.gate.resume(payload,grant),{code:'OTP_EXPIRED'});
});
