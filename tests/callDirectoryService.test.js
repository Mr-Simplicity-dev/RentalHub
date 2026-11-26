const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCallerPolicy,
  canSupportCall,
  canUserInitiateDirectCall,
} = require('../services/callDirectoryService');

const mockDb = {
  query: async (sql, params) => {
    if (sql.includes('landlord_agents')) {
      return { rows: params[0] === 50 ? [{ landlord_user_id: 99 }] : [] };
    }
    return { rows: [] };
  },
};

test('Tenant and Landlord get support_only headphone policy (chat or call support)', async () => {
  const tenant = { id: 1, user_type: 'tenant' };
  const landlord = { id: 2, user_type: 'landlord' };

  assert.equal(getCallerPolicy(tenant).mode, 'support_only');
  assert.equal(canSupportCall(tenant), true);
  assert.equal(canSupportCall(landlord), true);

  const blocked = await canUserInitiateDirectCall(tenant, { id: 10, user_type: 'state_admin' }, mockDb);
  assert.equal(blocked.allowed, false);
});

test('Agent and Marketing Agent get support_and_boss policy and can call their boss', async () => {
  const agent = { id: 50, user_type: 'agent', assigned_state: 'Lagos' };
  const marketing = { id: 51, user_type: 'marketing_agent', assigned_state: 'Lagos' };

  assert.equal(getCallerPolicy(agent).mode, 'support_and_boss');
  assert.equal(getCallerPolicy(marketing).mode, 'support_and_boss');
  assert.equal(canSupportCall(marketing), true);

  const callLandlord = await canUserInitiateDirectCall(agent, { id: 99, user_type: 'landlord' }, mockDb);
  assert.equal(callLandlord.allowed, true);

  const callRecruiter = await canUserInitiateDirectCall(marketing, { id: 70, user_type: 'recruitment_admin' }, mockDb);
  assert.equal(callRecruiter.allowed, true);
  const callStateBoss = await canUserInitiateDirectCall(
    marketing,
    { id: 71, user_type: 'state_admin', assigned_state: 'Lagos' },
    mockDb
  );
  assert.equal(callStateBoss.allowed, true);

  const callTenant = await canUserInitiateDirectCall(marketing, { id: 88, user_type: 'tenant' }, mockDb);
  assert.equal(callTenant.allowed, false);
});

test('National / Department Admins can call admins strictly below them, not tenants', async () => {
  const natSupport = { id: 10, user_type: 'super_support_admin' };
  const natFinance = { id: 11, user_type: 'super_financial_admin' };
  const stateFin = { id: 12, user_type: 'state_financial_admin', assigned_state: 'Lagos' };
  const lgaFin = { id: 13, user_type: 'lga_financial_admin', assigned_state: 'Lagos' };
  const tenant = { id: 14, user_type: 'tenant' };

  assert.equal(getCallerPolicy(natFinance).mode, 'admin_subordinates');
  assert.equal((await canUserInitiateDirectCall(natFinance, stateFin, mockDb)).allowed, true);
  assert.equal((await canUserInitiateDirectCall(natFinance, lgaFin, mockDb)).allowed, true);
  assert.equal((await canUserInitiateDirectCall(natFinance, tenant, mockDb)).allowed, false);

  assert.equal(
    (await canUserInitiateDirectCall(natSupport, { id: 15, user_type: 'state_support_admin', assigned_state: 'Oyo' }, mockDb)).allowed,
    true
  );
});

test('Super Admin gets platform_all policy and can call anyone on the platform', async () => {
  const superAdmin = { id: 100, user_type: 'super_admin' };
  assert.equal(getCallerPolicy(superAdmin).mode, 'platform_all');
  assert.equal(getCallerPolicy(superAdmin).canCallAnyone, true);

  for (const role of ['tenant', 'landlord', 'agent', 'marketing_agent', 'state_admin', 'super_financial_admin', 'lawyer']) {
    const res = await canUserInitiateDirectCall(superAdmin, { id: 200, user_type: role }, mockDb);
    assert.equal(res.allowed, true, `super_admin should be able to call ${role}`);
  }
});

test('Marketing Agent can call fellow Marketing Agents (teammates) and sees them in call directory', async () => {
  const { getCallerPolicy, canUserInitiateDirectCall, getCallDirectory } = require('../services/callDirectoryService');

  const marketerA = { id: 22, user_type: 'marketing_agent', assigned_state: 'Lagos' };
  const marketerB = { id: 23, user_type: 'marketing_agent', assigned_state: 'Abuja' };
  const policy = getCallerPolicy(marketerA);
  assert.equal(policy.canCallTeammates, true);
  assert.deepEqual(policy.teammateRoles, ['marketing_agent']);

  const mockDb = {
    query: async (sql, params = []) => {
      if (sql.includes("user_type IN ('super_support_admin'")) {
        return { rows: [{ id: 90 }] };
      }
      if (sql.includes('user_type = ANY($2::text[])')) {
        const all = [
          { id: 5, full_name: 'Rakiya Recruiter', user_type: 'recruitment_admin', assigned_state: 'Lagos' },
          { id: 23, full_name: 'Bola Marketer', user_type: 'marketing_agent', assigned_state: 'Abuja' },
        ];
        const allowedTypes = Array.isArray(params[1]) ? params[1] : [];
        return { rows: all.filter((u) => allowedTypes.includes(u.user_type)) };
      }
      return { rows: [] };
    },
  };

  const allowTeammate = await canUserInitiateDirectCall(marketerA, marketerB, mockDb);
  assert.equal(allowTeammate.allowed, true);
  assert.equal(allowTeammate.relation, 'teammate');

  const blockSelf = await canUserInitiateDirectCall(marketerA, marketerA, mockDb);
  assert.equal(blockSelf.allowed, false);

  const dir = await getCallDirectory(marketerA, {}, mockDb, (id) => id === 23);
  assert.ok(dir.contacts.some((c) => c.id === 23 && c.relation === 'teammate' && c.online === true));
});

test('getCallHistory returns missed calls, call details, talk duration, and summary counts', async () => {
  const { getCallHistory } = require('../services/callDirectoryService');
  const marketerA = { id: 22, user_type: 'marketing_agent', assigned_state: 'Lagos' };

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('COUNT(*)::int AS total_count')) {
        return {
          rows: [{
            total_count: 2,
            missed_count: 1,
            incoming_missed_count: 1,
            answered_count: 1,
            incoming_count: 1,
            outgoing_count: 1,
          }],
        };
      }
      return {
        rows: [
          {
            id: 'call-missed-1',
            caller_id: 23,
            receiver_id: 22,
            property_id: null,
            call_type: 'audio',
            status: 'missed',
            is_support_call: false,
            support_tier: null,
            requested_at: '2026-11-25T10:00:00.000Z',
            started_at: null,
            ended_at: '2026-11-25T10:00:45.000Z',
            caller_name: 'Bola Marketer',
            caller_user_type: 'marketing_agent',
            caller_state: 'Abuja',
            receiver_name: 'Mina Marketer',
            receiver_user_type: 'marketing_agent',
            receiver_state: 'Lagos',
          },
          {
            id: 'call-ended-2',
            caller_id: 22,
            receiver_id: 23,
            property_id: null,
            call_type: 'audio',
            status: 'ended',
            is_support_call: false,
            support_tier: null,
            requested_at: '2026-11-25T09:00:00.000Z',
            started_at: '2026-11-25T09:00:10.000Z',
            ended_at: '2026-11-25T09:02:25.000Z',
            caller_name: 'Mina Marketer',
            caller_user_type: 'marketing_agent',
            caller_state: 'Lagos',
            receiver_name: 'Bola Marketer',
            receiver_user_type: 'marketing_agent',
            receiver_state: 'Abuja',
          },
        ],
      };
    },
  };

  const history = await getCallHistory(marketerA, { filter: 'all' }, mockDb, (id) => id === 23);
  assert.equal(history.summary.total_count, 2);
  assert.equal(history.summary.missed_count, 1);
  assert.equal(history.summary.incoming_missed_count, 1);
  assert.equal(history.records.length, 2);

  const missed = history.records[0];
  assert.equal(missed.status, 'missed');
  assert.equal(missed.direction, 'incoming');
  assert.equal(missed.is_missed, true);
  assert.equal(missed.is_missed_for_me, true);
  assert.equal(missed.duration_seconds, 0);
  assert.equal(missed.counterpart.full_name, 'Bola Marketer');
  assert.equal(missed.can_call_back, true);

  const completed = history.records[1];
  assert.equal(completed.status, 'ended');
  assert.equal(completed.direction, 'outgoing');
  assert.equal(completed.duration_seconds, 135);
});
