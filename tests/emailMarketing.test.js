const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const {
  importSubscribers,
  deleteUnsubscribedSubscribers,
} = require('../services/emailMarketingService');
const { emailKey, classifyNewEmails } = require('../services/contactIdentityService');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const makeReq = (overrides = {}) => ({
  user: { id: 2, user_type: 'super_admin', full_name: 'Boss' },
  body: {},
  params: {},
  query: {},
  logger: { error() {}, warn() {}, info() {} },
  ...overrides,
});

const normalizeSql = (text) => String(text).replace(/\s+/g, ' ').trim();

const mockDb = (t, handler) => {
  const original = db.query;
  const queries = [];
  db.query = async (sql, params) => {
    const text = normalizeSql(sql);
    queries.push({ text, params });
    return handler(text, params, queries);
  };
  t.after(() => { db.query = original; });
  return queries;
};

const schemaStub = (text) =>
  text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE');

test('emailKey lowercases and rejects malformed addresses', () => {
  assert.equal(emailKey('Ada@Mail.com'), 'ada@mail.com');
  assert.equal(emailKey('  ada@mail.com  '), 'ada@mail.com');
  assert.equal(emailKey('not-an-email'), null);
  assert.equal(emailKey('missing@domain'), null);
  assert.equal(emailKey(''), null);
});

test('importSubscribers accepts new addresses and reports the refused ones', async (t) => {
  // ada@example.com is a registered user; bola@example.com already subscribes.
  const queries = mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM users WHERE email')) return { rows: [{ email: 'ada@example.com' }] };
    if (text.includes('FROM email_subscribers WHERE email')) return { rows: [{ email: 'bola@example.com' }] };
    if (text.includes('INSERT INTO email_subscribers')) return { rows: [], rowCount: 1 };
    if (text.includes("COUNT(*)::int AS total FROM email_subscribers WHERE source = 'import'")) {
      return { rows: [{ total: 7 }] };
    }
    return { rows: [], rowCount: 0 };
  });

  const response = makeRes();
  await importSubscribers(
    makeReq({
      body: {
        emails: [
          'ada@example.com',      // platform user -> refused
          'ADA@example.com',      // same user, different case -> duplicate, not a second refusal
          'bola@example.com',     // existing subscriber -> refused
          'chioma@example.com',   // new -> imported
          'chioma@example.com',   // repeat -> duplicate
          'not-an-email',         // invalid
        ],
      },
    }),
    response
  );

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.invalid, 1, 'malformed entry counted as invalid');
  assert.equal(response.body.data.duplicates, 2, 'case-variant and repeat are duplicates within the upload');
  assert.equal(response.body.data.alreadyKnown, 2, 'the user and the existing subscriber are refused');

  const insert = queries.find((q) => q.text.includes('INSERT INTO email_subscribers'));
  assert.ok(insert.text.includes('DO NOTHING'), 'an existing subscriber is never upserted back on');
  assert.equal(insert.text.includes('DO UPDATE'), false, 'unsubscribed contacts are never revived');
  assert.ok(insert.params.includes('chioma@example.com'), 'the new address is stored lowercased');
});

test('importSubscribers refuses the whole upload when every address is known', async (t) => {
  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM users WHERE email')) return { rows: [{ email: 'ada@example.com' }] };
    if (text.includes('FROM email_subscribers WHERE email')) return { rows: [] };
    return { rows: [], rowCount: 0 };
  });

  const response = makeRes();
  await importSubscribers(makeReq({ body: { emails: ['ada@example.com'] } }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /already exist in the system/i);
});

test('deleteUnsubscribedSubscribers needs a reason and sweeps only opted-out rows', async (t) => {
  const queries = mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('DELETE FROM email_subscribers WHERE subscribed = FALSE')) {
      return { rows: [{ id: 3 }, { id: 9 }], rowCount: 2 };
    }
    if (text.includes('INSERT INTO email_marketing_operations')) return { rows: [{}], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  const blocked = makeRes();
  await deleteUnsubscribedSubscribers(makeReq({ body: {} }), blocked);
  assert.equal(blocked.statusCode, 400, 'no reason means no delete');
  assert.equal(
    queries.filter((q) => q.text.includes('DELETE FROM email_subscribers')).length,
    0,
    'nothing is deleted without a reason'
  );

  const response = makeRes();
  await deleteUnsubscribedSubscribers(
    makeReq({ body: { data: { note: 'Monthly list hygiene' } } }),
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.deleted, 2);

  const del = queries.find((q) => q.text.includes('DELETE FROM email_subscribers'));
  assert.ok(del.text.includes('subscribed = FALSE'), 'only opted-out contacts are removed');
});

test('classifyNewEmails compares addresses case-insensitively against the platform', async (t) => {
  mockDb(t, (text) => {
    if (text.includes('FROM users WHERE email')) return { rows: [{ email: 'Ada@Mail.com' }] };
    if (text.includes('FROM email_subscribers WHERE email')) return { rows: [] };
    return { rows: [], rowCount: 0 };
  });

  const { accepted, alreadyKnown } = await classifyNewEmails(['ada@mail.com', 'new@mail.com']);
  assert.equal(alreadyKnown, 1, 'the differently-cased address is recognised as the same person');
  assert.deepEqual(accepted, ['new@mail.com']);
});
