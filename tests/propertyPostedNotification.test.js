const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = 'test';

const dbPath = path.resolve(__dirname, '..', 'config', 'middleware', 'database.js');
const notifPath = path.resolve(__dirname, '..', 'config', 'utils', 'notificationService.js');
const servicePath = path.resolve(
  __dirname,
  '..',
  'config',
  'utils',
  'propertyPostedNotificationService.js'
);
const originalDb = require.cache[dbPath];
const originalNotif = require.cache[notifPath];

// Records every notification that would be created.
const setup = ({ tenants = [], landlordExists = true } = {}) => {
  const created = [];
  const queries = [];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: async (sql) => {
        queries.push(sql);
        if (sql.includes('FROM users')) return { rows: tenants };
        return { rows: [] };
      },
    },
  };

  require.cache[notifPath] = {
    id: notifPath,
    filename: notifPath,
    loaded: true,
    exports: {
      createNotification: async (userId, type, title, message, link) => {
        created.push({ userId, type, title, message, link });
        return { id: created.length, userId, type };
      },
    },
  };

  delete require.cache[servicePath];
  return { service: require(servicePath), created, queries, landlordExists };
};

test.afterEach(() => {
  if (originalDb) require.cache[dbPath] = originalDb;
  else delete require.cache[dbPath];
  if (originalNotif) require.cache[notifPath] = originalNotif;
  else delete require.cache[notifPath];
  delete require.cache[servicePath];
});

const property = { id: 42, title: '3 bed flat', state_id: 5, landlord_id: 9, city: 'Gwagwalada' };

test('the landlord is notified that his own property went live', async () => {
  const { service, created } = setup({ tenants: [] });
  const result = await service.notifyTenantsOfLiveProperty(property);

  const landlordNote = created.find((n) => n.userId === 9);
  assert.ok(landlordNote, 'landlord should receive a notification');
  assert.equal(landlordNote.type, 'property_approved');
  assert.match(landlordNote.title, /live/i);
  assert.equal(landlordNote.link, '/properties/42');
  assert.equal(result.landlord.sent, 1);
});

test('tenants in the property state are still notified', async () => {
  const { service, created } = setup({ tenants: [{ id: 11 }, { id: 12 }] });
  const result = await service.notifyTenantsOfLiveProperty(property);

  const tenantNotes = created.filter((n) => n.type === 'property_posted');
  assert.deepEqual(
    tenantNotes.map((n) => n.userId).sort((a, b) => a - b),
    [11, 12]
  );
  assert.equal(result.tenants.sent, 2);
});

test('the landlord is never told about his own property as a "new property"', async () => {
  const { service, created, queries } = setup({ tenants: [{ id: 11 }] });
  await service.notifyTenantsOfLiveProperty(property);

  // The tenant query must exclude the landlord id.
  const tenantQuery = queries.find((sql) => sql.includes("preferred_state_id"));
  assert.ok(tenantQuery, 'tenant lookup should run');
  assert.match(tenantQuery, /id <> \$2/);

  const landlordAsTenant = created.find((n) => n.userId === 9 && n.type === 'property_posted');
  assert.equal(landlordAsTenant, undefined);
});

test('a property with no valid id is a safe no-op', async () => {
  const { service, created } = setup({ tenants: [{ id: 11 }] });
  const result = await service.notifyTenantsOfLiveProperty({});
  assert.equal(created.length, 0);
  assert.equal(result.landlord.sent, 0);
  assert.equal(result.tenants.sent, 0);
});
