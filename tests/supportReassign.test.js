const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = 'test';

const dbPath = path.resolve(__dirname, '..', 'config', 'middleware', 'database.js');
const notifPath = path.resolve(__dirname, '..', 'config', 'utils', 'notificationService.js');
const servicePath = path.resolve(__dirname, '..', 'services', 'supportReassignService.js');
const originalDb = require.cache[dbPath];
const originalNotif = require.cache[notifPath];

let queries;
let notifications;

const setup = ({ candidates = [], nextAgent = null, superAdmin = 1, history = [] } = {}) => {
  queries = [];
  notifications = [];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: async (sql, params) => {
        queries.push({ sql: String(sql), params });

        if (/^\s*CREATE TABLE IF NOT EXISTS support_ticket_assignments/.test(sql)) return { rows: [] };
        if (sql.includes('ALTER TABLE support_tickets')) return { rows: [] };
        if (sql.includes('CREATE INDEX')) return { rows: [] };
        if (sql.includes('SELECT DISTINCT assigned_to FROM support_ticket_assignments')) {
          return { rows: history.map((id) => ({ assigned_to: id })) };
        }
        if (sql.includes('FROM support_tickets st') && sql.includes('LIMIT 50')) {
          return { rows: candidates };
        }
        if (sql.includes("u.user_type = $1")) {
          return { rows: nextAgent ? [{ id: nextAgent, open_tickets: 0 }] : [] };
        }
        if (sql.includes("u.user_type IN ('super_support_admin', 'super_admin')")) {
          return { rows: superAdmin ? [{ id: superAdmin, open_tickets: 0 }] : [] };
        }
        if (sql.includes('INSERT INTO support_ticket_assignments')) return { rows: [] };
        if (sql.includes('UPDATE support_tickets')) return { rows: [] };
        return { rows: [] };
      },
    },
  };

  require.cache[notifPath] = {
    id: notifPath,
    filename: notifPath,
    loaded: true,
    exports: {
      createNotification: async (userId, type) => {
        notifications.push({ userId, type });
        return { id: notifications.length };
      },
    },
  };

  delete require.cache[servicePath];
  return require(servicePath);
};

const ticket = (overrides = {}) => ({
  id: 7,
  subject: 'No water',
  assigned_to: 9,
  state: 'FCT',
  lga: 'Gwagwalada',
  status: 'open',
  handover_count: 0,
  first_response_at: null,
  last_typing_at: null,
  typing_age_seconds: null,
  ...overrides,
});

test.afterEach(() => {
  if (originalDb) require.cache[dbPath] = originalDb;
  else delete require.cache[dbPath];
  if (originalNotif) require.cache[notifPath] = originalNotif;
  else delete require.cache[notifPath];
  delete require.cache[servicePath];
});

test('the defaults match what was agreed: 90 seconds, 2 handovers', () => {
  const service = setup();
  assert.equal(service.REASSIGN_AFTER_SECONDS, 90);
  assert.equal(service.MAX_HANDOVERS, 2);
});

test('an unanswered ticket is handed to the next agent in line', async () => {
  const service = setup({ candidates: [ticket()], nextAgent: 12 });

  const result = await service.reassignUnansweredTickets();
  assert.equal(result.reassigned, 1);

  const update = queries.find((q) => q.sql.includes('UPDATE support_tickets') && q.params?.[0] === 12);
  assert.ok(update, 'the ticket should be assigned to agent 12');
  assert.equal(notifications[0].userId, 12);
  assert.equal(notifications[0].type, 'support_ticket_reassigned');
});

test('GUARD: a ticket the agent is typing on is never taken away', async () => {
  const service = setup({
    candidates: [ticket({ last_typing_at: new Date().toISOString(), typing_age_seconds: 5 })],
    nextAgent: 12,
  });

  const result = await service.reassignUnansweredTickets();
  assert.equal(result.reassigned, 0);
  assert.equal(result.escalated, 0);
  assert.equal(notifications.length, 0);
});

test('GUARD: stale typing (older than the grace window) does not block the move', async () => {
  const service = setup({
    candidates: [ticket({ last_typing_at: new Date().toISOString(), typing_age_seconds: 999 })],
    nextAgent: 12,
  });

  const result = await service.reassignUnansweredTickets();
  assert.equal(result.reassigned, 1);
});

test('GUARD: a ticket that already had its first reply never moves', async () => {
  const service = setup({
    candidates: [ticket({ first_response_at: new Date().toISOString() })],
    nextAgent: 12,
  });

  const result = await service.reassignUnansweredTickets();
  assert.equal(result.reassigned, 0);
  assert.equal(notifications.length, 0);
});

test('after two handovers the ticket goes to a super admin and stops', async () => {
  const service = setup({ candidates: [ticket({ handover_count: 2 })], nextAgent: 12, superAdmin: 1 });

  const result = await service.reassignUnansweredTickets();
  assert.equal(result.escalated, 1);
  assert.equal(result.reassigned, 0);

  const update = queries.find((q) => q.sql.includes('UPDATE support_tickets') && q.params?.[0] === 1);
  assert.ok(update, 'super admin should now own the ticket');
  assert.equal(notifications[0].userId, 1);
  assert.equal(notifications[0].type, 'support_ticket_escalated');

  // It must be stamped exhausted so it cannot move again.
  assert.ok(update.sql.includes('exhausted_at'));
});

test('a ticket is never assigned to the agent who just let it time out', async () => {
  const service = setup({ candidates: [ticket({ assigned_to: 9 })], nextAgent: 12, history: [3, 5] });

  await service.reassignUnansweredTickets();

  const lookup = queries.find((q) => q.sql.includes('u.user_type = $1'));
  assert.ok(lookup, 'the next-agent lookup should run');
  const excluded = lookup.params[lookup.params.length - 1];
  assert.ok(Array.isArray(excluded), 'exclusions should be passed as an array');
  assert.ok(excluded.includes(9), 'current owner must be excluded');
  assert.ok(excluded.includes(3) && excluded.includes(5), 'past owners must be excluded');
});

test('when no agent is available the ticket is escalated rather than stranded', async () => {
  const service = setup({ candidates: [ticket()], nextAgent: null, superAdmin: 1 });

  const result = await service.reassignUnansweredTickets();
  assert.equal(result.escalated, 1);
  assert.equal(notifications[0].userId, 1);
});

test('nothing happens when there are no candidates', async () => {
  const service = setup({ candidates: [] });
  const result = await service.reassignUnansweredTickets();
  assert.deepEqual(result, { scanned: 0, reassigned: 0, escalated: 0 });
});
