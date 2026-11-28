const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createListingAssistanceService,
  assertStaffScope,
  isAgentEligibleForLocation,
} = require('../../services/listingAssistanceService');

const requestRow = (overrides = {}) => ({
  id: 21,
  landlord_user_id: 7,
  property_id: null,
  state_id: 8,
  state_name: 'Lagos',
  lga_name: 'Ikeja',
  status: 'awaiting_assignment',
  created_at: '2026-11-28T10:00:00Z',
  ...overrides,
});

const agentRow = (overrides = {}) => ({
  id: 51,
  full_name: 'Agent One',
  assigned_state: 'Lagos',
  assigned_lga: 'Ikeja',
  ...overrides,
});

const staff = { id: 4, user_type: 'super_admin' };

test('duplicate pending request returns the existing request without notifying again', async () => {
  const notifications = [];
  const db = {
    query: async (sql) => {
      if (sql.includes('FROM states')) return { rows: [{ id: 8, state_name: 'Lagos' }] };
      if (sql.includes('FROM landlord_agents')) return { rows: [] };
      if (sql.includes('INSERT INTO landlord_listing_assistance_requests')) return { rows: [] };
      if (sql.includes("status = 'awaiting_assignment'")) return { rows: [requestRow()] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const service = createListingAssistanceService({ db, notify: async (...args) => notifications.push(args) });

  const result = await service.createRequest(7, { stateId: 8, lgaName: 'ikeja' });

  assert.equal(result.created, false);
  assert.equal(result.request.id, 21);
  assert.equal(result.request.status, 'awaiting_assignment');
  assert.deepEqual(notifications, []);
});

test('landlords with an active assignment cannot create a duplicate assistance request', async () => {
  const db = {
    query: async (sql) => {
      if (sql.includes('FROM states')) return { rows: [{ id: 8, state_name: 'Lagos' }] };
      if (sql.includes('FROM landlord_agents')) return { rows: [{ id: 4 }] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const service = createListingAssistanceService({ db });

  await assert.rejects(
    service.createRequest(7, { stateId: 8, lgaName: 'Ikeja' }),
    { statusCode: 409, message: 'A property agent is already assigned to your account.' }
  );
});

test('a request with no eligible agent remains in the staff queue', async () => {
  const notifications = [];
  const db = {
    query: async (sql) => {
      if (sql.includes('FROM states')) return { rows: [{ id: 8, state_name: 'Lagos' }] };
      if (sql.includes('FROM landlord_agents')) return { rows: [] };
      if (sql.includes('INSERT INTO landlord_listing_assistance_requests')) return { rows: [requestRow()] };
      if (sql.includes("user_type IN ('admin', 'super_admin')")) return { rows: [{ id: 2 }] };
      if (sql.includes('FROM landlord_listing_assistance_requests r')) return { rows: [requestRow()] };
      if (sql.includes('FROM platform_agents pa')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const service = createListingAssistanceService({ db, notify: async (...args) => notifications.push(args) });

  const created = await service.createRequest(7, { stateId: 8, lgaName: 'Ikeja' });
  const queue = await service.listStaffRequests(staff);

  assert.equal(created.request.status, 'awaiting_assignment');
  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0].eligible_agents, []);
  assert.equal(notifications.length, 1);
});

test('agent eligibility requires matching state and either matching LGA or state-wide scope', () => {
  const lagos = { state: 'Lagos', displayName: 'Lagos', lgas: ['Ikeja', 'Epe'] };
  assert.equal(isAgentEligibleForLocation(agentRow(), lagos, 'Ikeja'), true);
  assert.equal(isAgentEligibleForLocation(agentRow({ assigned_state: 'Oyo' }), lagos, 'Ikeja'), false);
  assert.equal(isAgentEligibleForLocation(agentRow({ assigned_lga: 'Epe' }), lagos, 'Ikeja'), false);
  assert.equal(isAgentEligibleForLocation(agentRow({ assigned_lga: null }), lagos, 'Ikeja'), true);
});

test('staff request access enforces state and LGA scope', () => {
  const request = requestRow();
  assert.doesNotThrow(() => assertStaffScope({ user_type: 'state_admin', assigned_state: 'Lagos' }, request));
  assert.doesNotThrow(() => assertStaffScope({ user_type: 'lga_admin', assigned_state: 'Lagos', assigned_lga: 'Ikeja' }, request));
  assert.throws(
    () => assertStaffScope({ user_type: 'lga_admin', assigned_state: 'Lagos', assigned_lga: 'Epe' }, request),
    { statusCode: 403 }
  );
  assert.throws(
    () => assertStaffScope({ user_type: 'state_admin', assigned_state: 'Oyo' }, request),
    { statusCode: 403 }
  );
  assert.throws(() => assertStaffScope({ user_type: 'tenant' }, request), { statusCode: 403 });
});

test('assignment is transactional, duplicate requests are rejected and permissions stay restricted', async () => {
  const events = [];
  const notifications = [];
  const assignedRequest = requestRow({ status: 'assigned', assigned_agent_user_id: 51 });
  const client = {
    query: async (sql, params = []) => {
      events.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM landlord_listing_assistance_requests') && sql.includes('FOR UPDATE')) {
        return { rows: [requestRow()] };
      }
      if (sql.includes('FROM platform_agents pa')) return { rows: [agentRow()] };
      if (sql.includes('INSERT INTO landlord_agents')) {
        return { rows: [{ id: 91, landlord_user_id: 7, agent_user_id: 51, status: 'active' }] };
      }
      if (sql.includes('INSERT INTO landlord_agent_assignment_operations')) return { rows: [] };
      if (sql.includes('UPDATE landlord_listing_assistance_requests')) return { rows: [assignedRequest] };
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    release: () => events.push({ sql: 'RELEASE' }),
  };
  const db = { connect: async () => client };
  const service = createListingAssistanceService({ db, notify: async (...args) => notifications.push(args) });

  const result = await service.assignRequest(21, 51, staff);

  assert.equal(result.request.status, 'assigned');
  assert.ok(events.some((event) => event.sql === 'COMMIT'));
  const insertion = events.find((event) => event.sql.includes('INSERT INTO landlord_agents'));
  assert.match(insertion.sql, /TRUE, FALSE, FALSE, FALSE, FALSE/);
  assert.deepEqual(insertion.params, [7, 51, staff.id]);
  assert.equal(notifications.length, 1);

  const duplicateClient = {
    ...client,
    query: async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE')) return { rows: [assignedRequest] };
      throw new Error(`Unexpected duplicate transaction query: ${sql}`);
    },
  };
  const duplicateService = createListingAssistanceService({
    db: { connect: async () => duplicateClient },
    notify: async () => assert.fail('duplicate assignment must not notify'),
  });
  await assert.rejects(duplicateService.assignRequest(21, 51, staff), { statusCode: 409 });
});

test('assignment rejects an agent from another LGA and preserves active uniqueness conflicts', async () => {
  const makeClient = ({ agent, insertError }) => ({
    query: async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE')) return { rows: [requestRow()] };
      if (sql.includes('FROM platform_agents pa')) return { rows: [agent] };
      if (sql.includes('INSERT INTO landlord_agents')) {
        if (insertError) throw insertError;
        return { rows: [{ id: 92 }] };
      }
      if (sql.includes('INSERT INTO landlord_agent_assignment_operations')) return { rows: [] };
      if (sql.includes('UPDATE landlord_listing_assistance_requests')) return { rows: [requestRow({ status: 'assigned' })] };
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    release: () => {},
  });

  const invalidAgentService = createListingAssistanceService({
    db: { connect: async () => makeClient({ agent: agentRow({ assigned_lga: 'Epe' }) }) },
  });
  await assert.rejects(invalidAgentService.assignRequest(21, 51, staff), { statusCode: 400 });

  const uniqueConflict = Object.assign(new Error('unique violation'), { code: '23505' });
  const conflictService = createListingAssistanceService({
    db: { connect: async () => makeClient({ agent: agentRow(), insertError: uniqueConflict }) },
  });
  await assert.rejects(conflictService.assignRequest(21, 51, staff), { statusCode: 409 });
});
