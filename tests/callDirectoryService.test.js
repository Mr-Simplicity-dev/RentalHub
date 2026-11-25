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
