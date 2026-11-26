const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { notifyNewPropertyArrival } = require('../config/utils/propertyPostedNotificationService');

const liveProperty = (overrides = {}) => ({
  id: 42,
  landlord_id: 99,
  user_id: 99,
  state_id: 4,
  bedrooms: 2,
  title: 'Secret riverside penthouse',
  is_available: true,
  is_verified: true,
  status: 'available',
  deleted_at: null,
  expires_at: null,
  ...overrides,
});

const harness = ({
  property = liveProperty(),
  tenantRows = [{ id: 2 }],
  ownerRows = [{ id: 99 }],
  flags = { require_property_ownership_verification: false },
  createNotification,
} = {}) => {
  const statements = [];
  const created = [];
  const dbQuery = async (sql, params = []) => {
    statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (sql.includes('FROM properties p')) {
      const live = property
        && property.is_available === true
        && property.is_verified === true
        && property.status === 'available'
        && !property.deleted_at
        && (!property.expires_at || new Date(property.expires_at).getTime() > Date.now());
      return { rows: live ? [property] : [] };
    }
    if (sql.includes('ownership_gate_enabled_at')) return { rows: [] };
    if (sql.includes('preferred_state_id')) return { rows: tenantRows };
    if (sql.includes("user_type IN ('landlord', 'agent', 'user')")) return { rows: ownerRows };
    return { rows: [] };
  };
  const create = createNotification || (async (...args) => {
    created.push(args);
    return { id: created.length };
  });
  return {
    deps: { dbQuery, createNotification: create, getFeatureFlagsMap: async () => flags },
    statements,
    created,
  };
};

const bodyFor = (bedrooms) => bedrooms === null
  ? 'A new property has arrived on Amana RentalHub. Explore the listing now.'
  : `A new ${bedrooms}-bedroom apartment has arrived on Amana RentalHub. Explore the listing now.`;

test('a live approved listing announces the exact two-bedroom copy to tenants and the listing owner', async () => {
  const h = harness();
  const result = await notifyNewPropertyArrival(liveProperty(), h.deps);

  assert.deepEqual(result, { tenants: { matched: 1, sent: 1 }, landlord: { matched: 1, sent: 1 } });
  assert.equal(h.created.length, 2);
  for (const [userId, type, title, message, link] of h.created) {
    assert.ok([2, 99].includes(userId));
    assert.ok(['property_posted', 'property_approved'].includes(type));
    assert.equal(title, 'New property available!');
    assert.equal(message, bodyFor(2));
    assert.equal(link, '/properties/42');
  }
  assert.deepEqual(h.created.map((call) => call[5]), [
    'property-arrival:42:tenant:2',
    'property-arrival:42:landlord:99',
  ]);
});

test('bedroom counts are dynamic and invalid counts use the neutral fallback', async () => {
  for (const [bedrooms, expected] of [[1, bodyFor(1)], [2, bodyFor(2)], [3, bodyFor(3)], [null, bodyFor(null)], [0, bodyFor(null)], ['unknown', bodyFor(null)]]) {
    const h = harness({ property: liveProperty({ bedrooms }) });
    await notifyNewPropertyArrival(liveProperty({ bedrooms }), h.deps);
    assert.equal(h.created[0][3], expected);
  }
});

test('announcement only queries genuinely live listings and excludes hidden market states', async () => {
  const h = harness();
  await notifyNewPropertyArrival({ id: 42 }, h.deps);
  const sql = h.statements.find((entry) => entry.sql.includes('FROM properties p')).sql;
  for (const condition of [
    'p.is_available = TRUE',
    'p.is_verified = TRUE',
    "LOWER(COALESCE(p.status, '')) = 'available'",
    'p.deleted_at IS NULL',
    'p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP',
  ]) {
    assert.ok(sql.includes(condition), `missing condition: ${condition}`);
  }
});

test('drafts, pending, rejected, deleted, expired and unverified listings produce no announcement', async () => {
  for (const property of [
    null,
    liveProperty({ is_verified: false }),
    liveProperty({ status: 'pending' }),
    liveProperty({ status: 'rejected' }),
    liveProperty({ deleted_at: new Date() }),
    liveProperty({ expires_at: new Date(Date.now() - 1000) }),
  ]) {
    const h = harness({ property });
    const result = await notifyNewPropertyArrival({ id: 42 }, h.deps);
    assert.equal(h.created.length, 0);
    assert.deepEqual(result, { tenants: { matched: 0, sent: 0 }, landlord: { matched: 0, sent: 0 } });
  }
});

test('recipient query uses authoritative roles and excludes deleted, suspended and disabled users', async () => {
  const h = harness();
  await notifyNewPropertyArrival({ id: 42 }, h.deps);
  const tenantSql = h.statements.find((entry) => entry.sql.includes('preferred_state_id')).sql;
  for (const condition of [
    "user_type = 'tenant'",
    'is_active = TRUE',
    'deleted_at IS NULL',
    'account_suspended_at IS NULL',
    'id <> $2',
  ]) {
    assert.ok(tenantSql.includes(condition), `missing tenant condition: ${condition}`);
  }
  const ownerSql = h.statements.find((entry) => entry.sql.includes("user_type IN ('landlord', 'agent', 'user')")).sql;
  for (const condition of ['is_active = TRUE', 'deleted_at IS NULL', 'account_suspended_at IS NULL']) {
    assert.ok(ownerSql.includes(condition), `missing owner condition: ${condition}`);
  }
});

test('ineligible listing owner receives no owner announcement', async () => {
  const h = harness({ ownerRows: [] });
  const result = await notifyNewPropertyArrival({ id: 42 }, h.deps);
  assert.equal(result.landlord.sent, 0);
  assert.equal(h.created.some((call) => call[1] === 'property_approved'), false);
});

test('edits, repeated saves and duplicate activation events cannot create duplicate announcements', async () => {
  const h = harness();
  await notifyNewPropertyArrival({ id: 42 }, h.deps);
  await notifyNewPropertyArrival(liveProperty({ title: 'Edited title' }), h.deps);
  assert.equal(h.created.length, 4);
  assert.equal(new Set(h.created.map((call) => call[5])).size, 2);
  for (const call of h.created) {
    assert.ok(!String(call[3]).includes('Edited title'));
  }
});

test('concurrent activation requests create one announcement per recipient', async () => {
  const keys = new Set();
  const created = [];
  const createNotification = async (...args) => {
    const key = args[5];
    if (keys.has(key)) return null;
    keys.add(key);
    created.push(args);
    return { id: created.length };
  };
  const h = harness({ createNotification });
  await Promise.all([
    notifyNewPropertyArrival({ id: 42 }, h.deps),
    notifyNewPropertyArrival({ id: 42 }, h.deps),
  ]);
  assert.equal(created.length, 2);
});

test('notification delivery failure does not throw or affect listing activation result', async () => {
  const h = harness({ createNotification: async () => { throw new Error('push provider unavailable'); } });
  const result = await notifyNewPropertyArrival({ id: 42 }, h.deps);
  assert.deepEqual(result, { tenants: { matched: 0, sent: 0 }, landlord: { matched: 0, sent: 0 } });
});

test('announcement contains no private contact data and never touches Phase C spoken events or read state', async () => {
  const h = harness();
  await notifyNewPropertyArrival({ id: 42 }, h.deps);
  const allText = h.created.map((call) => `${call[2]} ${call[3]} ${call[4]}`).join(' ');
  for (const secret of ['Secret riverside penthouse', '@', '+234', 'landlord', 'tenant', 'payment']) {
    assert.equal(allText.toLowerCase().includes(String(secret).toLowerCase()), false);
  }
  assert.equal(h.statements.some((entry) => /spoken_notification_events/i.test(entry.sql)), false);
  assert.equal(h.statements.some((entry) => /\bUPDATE notifications\b|is_read/i.test(entry.sql)), false);
});

test('the notification action uses the correct authorized property route', () => {
  const header = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'components', 'common', 'Header.jsx'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'pages', 'App.jsx'), 'utf8');
  assert.match(header, /<Link\s+to=\{notif\.link\}/);
  assert.match(app, /<Route path="\/properties\/:id"/);
});

test('admin approval and appeal uphold call the announcement after the authoritative live transition', () => {
  const admin = fs.readFileSync(path.join(__dirname, '..', 'services', 'adminService.js'), 'utf8');
  const approve = admin.slice(admin.indexOf('exports.approveProperty'), admin.indexOf('exports.rejectProperty'));
  assert.match(approve, /is_verified = TRUE/);
  assert.match(approve, /status = 'available'/);
  assert.match(approve, /notifyNewPropertyArrival\(property\)/);

  const appeals = fs.readFileSync(path.join(__dirname, '..', 'routes', 'appeals.js'), 'utf8');
  const review = appeals.slice(appeals.indexOf("'/admin/appeals/:id/review'"), appeals.indexOf("'/admin/appeals/:id/review'") + 12000);
  assert.match(review, /is_verified = TRUE/);
  assert.match(review, /status = 'available'/);
  assert.match(review, /await client\.query\('COMMIT'\)/);
  assert.match(review, /notifyNewPropertyArrival\(\{ id: appeal\.property_id \}\)/);
  assert.match(review, /await lockAndAssertAppealTarget\(client, req\.user, appeal\)/);
});

test('a stale appeal cannot re-activate a property after another decision', () => {
  const appeals = fs.readFileSync(path.join(__dirname, '..', 'routes', 'appeals.js'), 'utf8');
  const helper = appeals.slice(
    appeals.indexOf('const lockAndAssertAppealTarget'),
    appeals.indexOf('router.post(')
  );
  assert.match(helper, /p\.status,/);
  assert.match(helper, /normalizeText\(target\.status\) !== 'rejected'/);
  assert.match(helper, /FOR UPDATE OF p/);
});
