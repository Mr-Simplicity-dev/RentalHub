const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const usersRouter = require('../routes/users');

const { canViewPassportPhoto } = usersRouter._userSecurityForTest;

const withMockedQueries = async (rowsByCall, callback) => {
  const originalQuery = db.query;
  const calls = [];

  db.query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    const rows = rowsByCall[calls.length - 1] || [];
    return { rows };
  };

  try {
    return await callback(calls);
  } finally {
    db.query = originalQuery;
  }
};

test('passport photo owner can read only the currently stored file', async () => {
  await withMockedQueries(
    [[{ passport_photo_url: '/uploads/passports/passport_7_current.jpg' }]],
    async (calls) => {
      const allowed = await canViewPassportPhoto({
        requester: { id: 7, user_type: 'tenant' },
        ownerId: 7,
        filename: 'passport_7_current.jpg',
      });

      assert.equal(allowed, true);
      assert.equal(calls.length, 1);
    }
  );
});

test('passport photo access rejects stale files even for the owner', async () => {
  await withMockedQueries(
    [[{ passport_photo_url: '/uploads/passports/passport_7_current.jpg' }]],
    async () => {
      const allowed = await canViewPassportPhoto({
        requester: { id: 7, user_type: 'tenant' },
        ownerId: 7,
        filename: 'passport_7_old.jpg',
      });

      assert.equal(allowed, false);
    }
  );
});

test('financial administrators cannot read identity photos', async () => {
  await withMockedQueries(
    [[{ passport_photo_url: '/uploads/passports/passport_7_current.jpg' }]],
    async (calls) => {
      const allowed = await canViewPassportPhoto({
        requester: { id: 30, user_type: 'financial_admin' },
        ownerId: 7,
        filename: 'passport_7_current.jpg',
      });

      assert.equal(allowed, false);
      assert.equal(calls.length, 1);
    }
  );
});

test('state administrators require an assigned jurisdiction and a matching user scope', async () => {
  await withMockedQueries(
    [
      [{ passport_photo_url: '/uploads/passports/passport_7_current.jpg' }],
      [{ allowed: true }],
    ],
    async (calls) => {
      const allowed = await canViewPassportPhoto({
        requester: {
          id: 30,
          user_type: 'state_admin',
          assigned_state: 'Lagos',
        },
        ownerId: 7,
        filename: 'passport_7_current.jpg',
      });

      assert.equal(allowed, true);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[1].params, [7, 'Lagos', null]);
    }
  );
});

test('LGA administrators cannot bypass a missing city assignment', async () => {
  await withMockedQueries(
    [[{ passport_photo_url: '/uploads/passports/passport_7_current.jpg' }]],
    async (calls) => {
      const allowed = await canViewPassportPhoto({
        requester: {
          id: 30,
          user_type: 'admin',
          assigned_state: 'Lagos',
          assigned_city: '',
        },
        ownerId: 7,
        filename: 'passport_7_current.jpg',
      });

      assert.equal(allowed, false);
      assert.equal(calls.length, 1);
    }
  );
});
