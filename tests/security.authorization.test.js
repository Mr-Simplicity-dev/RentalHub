const test = require('node:test');
const assert = require('node:assert/strict');

const legalController = require('../controllers/legalController');
const agentWithdrawalController = require('../controllers/agentWithdrawalController');
const agentCommissionController = require('../controllers/agentCommissionController');
const damageReportController = require('../controllers/damageReportController');
const db = require('../config/middleware/database');
const supportRoutes = require('../routes/support');

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

test('support admin ticket scope follows LGA, state, assignment, and super hierarchy', () => {
  const { canSupportAdminAccessTicket } = supportRoutes._supportScopeForTest;
  const lagosIkejaTicket = { id: 1, state: 'Lagos', lga: 'Ikeja', assigned_to: null };
  const abujaTicket = { id: 2, state: 'FCT', lga: 'AMAC', assigned_to: null };

  assert.equal(
    canSupportAdminAccessTicket(
      { id: 10, user_type: 'lga_support_admin', assigned_state: 'Lagos', assigned_city: 'Ikeja' },
      lagosIkejaTicket
    ),
    true
  );

  assert.equal(
    canSupportAdminAccessTicket(
      { id: 10, user_type: 'lga_support_admin', assigned_state: 'Lagos', assigned_city: 'Surulere' },
      lagosIkejaTicket
    ),
    false
  );

  assert.equal(
    canSupportAdminAccessTicket(
      { id: 20, user_type: 'state_support_admin', assigned_state: 'Lagos' },
      lagosIkejaTicket
    ),
    true
  );

  assert.equal(
    canSupportAdminAccessTicket(
      { id: 20, user_type: 'state_support_admin', assigned_state: 'Lagos' },
      abujaTicket
    ),
    false
  );

  assert.equal(
    canSupportAdminAccessTicket(
      { id: 30, user_type: 'lga_support_admin', assigned_state: 'Oyo', assigned_city: 'Ibadan' },
      { ...lagosIkejaTicket, assigned_to: 30 }
    ),
    true
  );

  assert.equal(
    canSupportAdminAccessTicket(
      { id: 40, user_type: 'super_support_admin' },
      abujaTicket
    ),
    true
  );
});

test('support service metadata normalizes category, department, and escalation status', () => {
  const {
    normalizeSupportCategory,
    normalizeRelatedType,
    normalizeDepartment,
    normalizeEscalationStatus,
    resolveSlaDueAt,
  } = supportRoutes._supportScopeForTest;

  assert.equal(normalizeRelatedType('transportation-booking'), 'transportation_booking');
  assert.equal(normalizeSupportCategory('', 'transportation_booking'), 'transportation');
  assert.equal(normalizeDepartment('', 'fumigation_cleaning', 'fumigation_cleaning_booking'), 'fumigation');
  assert.equal(normalizeDepartment('', 'payment', null), 'finance');
  assert.equal(normalizeEscalationStatus('action-required'), 'action_required');

  const before = Date.now();
  const dueAt = resolveSlaDueAt('transportation', 'medium');
  const hours = (dueAt.getTime() - before) / (1000 * 60 * 60);
  assert.ok(hours > 11.9 && hours <= 12.1);
});
