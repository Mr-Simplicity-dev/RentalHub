const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

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

test('department escalation access is scoped to department and jurisdiction', () => {
  const { departmentsForUser, canAccessDepartmentEscalation } = supportRoutes._supportScopeForTest;

  assert.deepEqual(departmentsForUser({ user_type: 'state_transportation_admin' }), ['transportation']);
  assert.deepEqual(departmentsForUser({ user_type: 'lga_fumigation_admin' }), ['fumigation']);

  const lagosTransportTicket = {
    state: 'Lagos',
    lga: 'Ikeja',
    category: 'transportation',
    escalation_department: 'transportation',
    related_type: 'transportation_booking',
  };

  assert.equal(
    canAccessDepartmentEscalation(
      { user_type: 'state_transportation_admin', assigned_state: 'Lagos' },
      lagosTransportTicket
    ),
    true
  );

  assert.equal(
    canAccessDepartmentEscalation(
      { user_type: 'state_transportation_admin', assigned_state: 'Oyo' },
      lagosTransportTicket
    ),
    false
  );

  assert.equal(
    canAccessDepartmentEscalation(
      { user_type: 'state_fumigation_admin', assigned_state: 'Lagos' },
      lagosTransportTicket
    ),
    false
  );

  assert.equal(
    canAccessDepartmentEscalation(
      { user_type: 'super_admin' },
      lagosTransportTicket
    ),
    true
  );
});

test('support SLA monitor applies policy timers and marks one-time alert columns', async () => {
  const { runSupportSlaMonitor } = supportRoutes._supportScopeForTest;
  const originalQuery = db.query;
  const calls = [];
  const timelineEvents = [];

  db.query = async (sql, params = []) => {
    const text = String(sql);
    calls.push({ text, params });

    if (text.includes('CREATE TABLE IF NOT EXISTS support_tickets')) return { rows: [] };
    if (text.includes("SELECT value FROM support_policy_settings WHERE key = 'support_governance'")) {
      return {
        rows: [{
          value: {
            sla_due_soon_hours: 3,
            escalation_acknowledgement_hours: 5,
            department_resolution_hours: 26,
            notify_super_admin_on_breach: false,
          },
        }],
      };
    }
    if (text.includes('SET sla_warning_notified_at')) {
      assert.deepEqual(params, [3]);
      return { rows: [{ id: 1, subject: 'Due soon', assigned_to: null }] };
    }
    if (text.includes('SET sla_breach_notified_at')) {
      return { rows: [{ id: 2, subject: 'Breached', assigned_to: null }] };
    }
    if (text.includes('SET escalation_ack_notified_at')) {
      assert.deepEqual(params, [5]);
      return { rows: [{ id: 3, subject: 'Ack overdue', assigned_to: null, escalation_department: 'transportation' }] };
    }
    if (text.includes('SET department_resolution_notified_at')) {
      assert.deepEqual(params, [26]);
      return { rows: [{ id: 4, subject: 'Resolution overdue', assigned_to: null, escalation_department: 'fumigation' }] };
    }
    if (text.includes('INSERT INTO support_ticket_timeline')) {
      timelineEvents.push(params[4]);
      return { rows: [] };
    }
    if (text.includes('FROM users')) return { rows: [] };
    return { rows: [] };
  };

  try {
    await runSupportSlaMonitor();
  } finally {
    db.query = originalQuery;
  }

  assert.ok(calls.some((call) => call.text.includes('sla_warning_notified_at')));
  assert.ok(calls.some((call) => call.text.includes('sla_breach_notified_at')));
  assert.ok(calls.some((call) => call.text.includes('escalation_ack_notified_at')));
  assert.ok(calls.some((call) => call.text.includes('department_resolution_notified_at')));
  assert.deepEqual(
    timelineEvents.sort(),
    ['department_acknowledgement_overdue', 'department_resolution_overdue', 'sla_breached', 'sla_due_soon'].sort()
  );
});

test('support admin deep links point to scoped operational dashboards', () => {
  const { getRelatedAdminPath, getDepartmentEscalationPath } = supportRoutes._supportScopeForTest;

  assert.equal(
    getRelatedAdminPath({ related_type: 'transportation_booking', related_id: 42, category: 'transportation' }, 'state_transportation_admin'),
    '/admin/transportation/state?tab=bookings&bookingId=42'
  );

  assert.equal(
    getRelatedAdminPath({ related_type: 'fumigation_cleaning_booking', related_id: 7, category: 'fumigation_cleaning' }, 'super_fumigation_admin'),
    '/super-admin/fumigation-cleaning?bookingId=7#fumigation-bookings'
  );

  assert.equal(
    getDepartmentEscalationPath('finance', 'super_financial_admin'),
    '/admin/super-financial-dashboard?panel=support-escalations'
  );
});
