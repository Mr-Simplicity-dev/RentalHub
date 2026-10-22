const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const {
  submitRegistrationProof,
  approveTransfer,
  rejectTransfer,
  getRegistrationTransferStatus,
} = require('../services/bankTransferService');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const makeReq = (overrides = {}) => ({
  user: { id: 2, user_type: 'super_admin', full_name: 'Boss' },
  body: {},
  params: {},
  query: {},
  logger: { error() {}, warn() {}, info() {} },
  ...overrides,
});

const normalizeSql = (text) => String(text).replace(/\s+/g, ' ').trim();

const mockDb = (t, handler) => {
  const original = db.query;
  db.query = async (sql, params) => handler(normalizeSql(sql), params);
  t.after(() => { db.query = original; });
};

const schemaStub = (text) =>
  text.startsWith('CREATE TABLE') ||
  text.startsWith('CREATE INDEX') ||
  text.startsWith('CREATE UNIQUE INDEX') ||
  text.startsWith('ALTER TABLE');

test('registration proof refuses anything that is not a captured image', async (t) => {
  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM tenant_registration_payments')) {
      return { rows: [{ id: 1, transaction_reference: 'ARH_REG_1', amount: 3000, registered_user_id: null }] };
    }
    if (text.includes('FROM bank_accounts WHERE id')) return { rows: [{ id: 7 }] };
    return { rows: [], rowCount: 0 };
  });

  const res = makeRes();
  await submitRegistrationProof(
    makeReq({ body: { reference: 'ARH_REG_1', bank_account_id: 7, proof_image: 'not-an-image' } }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /screen capture/i);
});

test('registration proof refuses an already completed registration', async (t) => {
  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM tenant_registration_payments')) {
      return { rows: [{ id: 1, transaction_reference: 'ARH_REG_1', amount: 3000, registered_user_id: 55 }] };
    }
    return { rows: [], rowCount: 0 };
  });

  const res = makeRes();
  await submitRegistrationProof(
    makeReq({ body: { reference: 'ARH_REG_1', bank_account_id: 7, proof_image: 'data:image/png;base64,AAAA' } }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /already completed/i);
});

test('approving a transfer refuses an amount below the expected fee', async (t) => {
  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM bank_transfer_payments WHERE id')) {
      return {
        rows: [{
          id: 5,
          status: 'awaiting_approval',
          amount: '3000.00',
          payment_type: 'registration',
          registration_reference: 'ARH_REG_1',
        }],
      };
    }
    return { rows: [], rowCount: 0 };
  });

  const res = makeRes();
  await approveTransfer(
    makeReq({ params: { id: '5' }, body: { amount_received: 1500 } }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /less than the expected/i);
});

test('rejecting a transfer requires a reason', async (t) => {
  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  });

  const res = makeRes();
  await rejectTransfer(makeReq({ params: { id: '5' }, body: { note: '  ' } }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /reason/i);
});

test('pending registration status returns the receiving accounts before proof', async (t) => {
  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM tenant_registration_payments')) {
      return {
        rows: [{
          amount: '3000.00',
          full_name: 'Haruna Musa',
          email: 'haruna@example.com',
          user_type: 'tenant',
          registered_user_id: null,
          payment_method: 'bank_transfer',
        }],
      };
    }
    if (text.includes('FROM bank_transfer_payments')) return { rows: [] };
    if (text.includes('FROM bank_accounts')) {
      return { rows: [{ id: 7, bank_name: 'Moniepoint', account_name: 'Amana RentalHub NG', account_number: '0123456789' }] };
    }
    return { rows: [], rowCount: 0 };
  });

  const res = makeRes();
  await getRegistrationTransferStatus(makeReq({ params: { reference: 'ARH_REG_1' } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'awaiting_transfer');
  assert.equal(res.body.data.amount, '3000.00');
  assert.equal(res.body.data.bank_accounts.length, 1);
});
