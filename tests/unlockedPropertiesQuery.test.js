const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const { getMyUnlockedProperties } = require('../services/paymentService');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const makeReq = (overrides = {}) => ({
  user: { id: 3, user_type: 'tenant' },
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

// The properties table has never had price, price_frequency or media columns.
// Selecting them raised Postgres 42703, so "Subscribed properties" showed
// "Could not load subscribed properties" for every tenant, including tenants
// with nothing unlocked.
test('unlocked properties query only selects columns that exist', async (t) => {
  const queries = mockDb(t, () => ({ rows: [], rowCount: 0 }));

  const res = makeRes();
  await getMyUnlockedProperties(makeReq(), res);

  assert.equal(res.statusCode, 200, 'empty unlock list is a success, not an error');
  assert.deepEqual(res.body.data, []);

  const select = queries.map((q) => q.text).find((text) => text.includes('FROM tenant_property_unlocks'));
  assert.ok(select, 'the unlock query ran');

  for (const ghost of ['p.price', 'p.price_frequency', 'p.media']) {
    assert.ok(
      !select.includes(ghost),
      `${ghost} does not exist on properties and must not be selected`
    );
  }
});

// The mobile PropertyCard reads these exact names, so the response must carry
// them or the card renders a blank price and a placeholder image.
test('unlocked properties return the field names the mobile card renders', async (t) => {
  mockDb(t, () => ({
    rows: [{
      id: 1,
      property_id: 42,
      unlocked_at: new Date('2026-10-20T10:00:00Z'),
      transaction_reference: 'ref-1',
      title: 'Lekki Court',
      city: 'Lagos',
      area: 'Lekki',
      property_type: 'apartment',
      bedrooms: 3,
      bathrooms: 2,
      rent_amount: '2500000',
      payment_frequency: 'yearly',
      full_address: '1 Admiralty Way',
      featured: false,
      state_name: 'Lagos',
      primary_photo: 'https://cdn.example.com/a.jpg',
      photo_count: 4,
    }],
    rowCount: 1,
  }));

  const res = makeRes();
  await getMyUnlockedProperties(makeReq(), res);

  const row = res.body.data[0];
  assert.equal(row.rent_amount, '2500000');
  assert.equal(row.payment_frequency, 'yearly');
  assert.equal(row.primary_photo, 'https://cdn.example.com/a.jpg');
  assert.equal(row.state_name, 'Lagos');
  assert.equal(row.area, 'Lekki');
});

test('a database failure still reports a clean 500', async (t) => {
  mockDb(t, () => { throw new Error('boom'); });

  const res = makeRes();
  await getMyUnlockedProperties(makeReq(), res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
});
