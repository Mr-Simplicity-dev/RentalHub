const test = require('node:test');
const assert = require('node:assert/strict');

const legalController = require('../controllers/legalController');
const agentWithdrawalController = require('../controllers/agentWithdrawalController');
const agentCommissionController = require('../controllers/agentCommissionController');
const damageReportController = require('../controllers/damageReportController');
const db = require('../config/middleware/database');

const makeRes = () => {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

test('legal grant-access blocks user granting for another account', async () => {
  const req = {
    body: { property_id: 10, lawyer_id: 9, client_user_id: 200 },
    user: { id: 100, user_type: 'tenant' },
  };
  const res = makeRes();

  await legalController.grantLawyerAccess(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
});

test('withdrawal create blocks non-agent non-admin users', async () => {
  const req = {
    params: { agentId: '7' },
    body: { landlordId: 22, amount: 5000 },
    user: { id: 55, user_type: 'tenant' },
  };
  const res = makeRes();

  await agentWithdrawalController.createWithdrawalRequest(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
});

test('withdrawal list blocks unauthorized roles', async () => {
  const req = {
    params: { agentId: '7' },
    query: {},
    user: { id: 66, user_type: 'tenant' },
  };
  const res = makeRes();

  await agentWithdrawalController.getWithdrawalRequests(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
});

test('commission rates blocks unrelated users', async () => {
  const req = {
    params: { agentId: '7' },
    query: { landlordId: '20' },
    user: { id: 88, user_type: 'tenant' },
  };
  const res = makeRes();

  await agentCommissionController.getCommissionRates(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
});

test('damage report summary blocks unauthorized tenant', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (String(sql).includes('SELECT landlord_id FROM properties')) {
      return { rows: [{ landlord_id: 999 }] };
    }
    if (String(sql).includes('FROM landlord_agents')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  const req = {
    params: { propertyId: '123' },
    user: { id: 77, user_type: 'tenant' },
  };
  const res = makeRes();

  try {
    await damageReportController.getReportSummary(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
  } finally {
    db.query = originalQuery;
  }
});
