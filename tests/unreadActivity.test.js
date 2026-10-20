const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = 'test';

const dbPath = path.resolve(__dirname, '..', 'config', 'middleware', 'database.js');
const original = require.cache[dbPath];

const withFakeDb = (handler) => {
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { query: handler },
  };
  delete require.cache[
    path.resolve(__dirname, '..', 'config', 'utils', 'unreadActivityService.js')
  ];
  return require('../config/utils/unreadActivityService');
};

test.afterEach(() => {
  if (original) require.cache[dbPath] = original;
  else delete require.cache[dbPath];
});

test('the badge total is notifications plus messages', async () => {
  const service = withFakeDb(async (sql) => {
    if (sql.includes('FROM notifications')) return { rows: [{ count: 3 }] };
    if (sql.includes('FROM messages')) return { rows: [{ count: 2 }] };
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await service.getUnreadActivityCount(7);
  assert.equal(result.unreadNotifications, 3);
  assert.equal(result.unreadMessages, 2);
  assert.equal(result.total, 5);
});

test('no unread items means a total of zero, not a missing badge', async () => {
  const service = withFakeDb(async () => ({ rows: [{ count: 0 }] }));
  const result = await service.getUnreadActivityCount(7);
  assert.equal(result.total, 0);
});

test('a missing table cannot blank the badge', async () => {
  const service = withFakeDb(async (sql) => {
    if (sql.includes('FROM notifications')) return { rows: [{ count: 4 }] };
    throw new Error('relation "messages" does not exist');
  });

  const result = await service.getUnreadActivityCount(7);
  assert.equal(result.total, 4);
  assert.equal(result.unreadMessages, 0);
});

test('an unauthenticated lookup returns zero rather than throwing', async () => {
  const service = withFakeDb(async () => {
    throw new Error('should not be called without a user');
  });
  const result = await service.getUnreadActivityCount(null);
  assert.equal(result.total, 0);
});
