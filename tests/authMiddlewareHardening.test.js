const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'auth-middleware-hardening-test-secret';

const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');

const SECRET = process.env.JWT_SECRET;

const userRow = (overrides = {}) => ({
  id: 7,
  email: 'admin@example.test',
  full_name: 'Test Admin',
  user_type: 'super_admin',
  identity_verified: true,
  subscription_active: true,
  assigned_state: null,
  assigned_city: null,
  assigned_lga: null,
  assigned_zone: null,
  is_recruitment_admin: false,
  preferred_state_id: null,
  preferred_lga_name: null,
  deleted_at: null,
  is_active: true,
  account_suspended_reason: null,
  token_version: 5,
  ...overrides,
});

const runAuthenticate = async (req) => {
  const outcome = { status: null, body: null, next: false };
  const res = {
    status(code) {
      outcome.status = code;
      return {
        json(payload) {
          outcome.body = payload;
          return payload;
        },
      };
    },
  };

  await authenticate(req, res, () => {
    outcome.next = true;
  });

  return outcome;
};

const withMockedUserQuery = async (row, fn) => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('ALTER TABLE')) return { rows: [] };
    if (/FROM users\s+WHERE id = \$1/.test(sql)) return { rows: row ? [row] : [] };
    return { rows: [] };
  };

  try {
    return await fn();
  } finally {
    db.query = originalQuery;
  }
};

const signSession = (claims) =>
  jwt.sign({ purpose: 'session', userType: 'super_admin', ...claims }, SECRET, {
    algorithm: 'HS256',
  });

// enforceFlags (app.use('/api', enforceFlags)) pre-attaches {id, user_type}
// straight from the JWT. authenticate used to short-circuit on any req.user.id,
// which skipped the token-version, deleted and suspension checks entirely —
// a revoked session or a banned account kept full API access.
test('authenticate rejects a revoked token even when a user was pre-attached', async () => {
  const token = signSession({ userId: 7, tv: 999 });

  const outcome = await withMockedUserQuery(userRow(), () =>
    runAuthenticate({
      headers: { authorization: `Bearer ${token}` },
      user: { id: 7, user_type: 'super_admin', _tokenOnly: true },
    })
  );

  assert.equal(outcome.next, false);
  assert.equal(outcome.status, 401);
  assert.equal(outcome.body.message, 'Session expired. Please log in again.');
});

test('authenticate rejects a deleted account even when a user was pre-attached', async () => {
  const token = signSession({ userId: 7, tv: 5 });
  const deletedRow = userRow({ deleted_at: new Date('2026-01-01') });

  const outcome = await withMockedUserQuery(deletedRow, () =>
    runAuthenticate({
      headers: { authorization: `Bearer ${token}` },
      user: { id: 7, user_type: 'super_admin', _tokenOnly: true },
    })
  );

  assert.equal(outcome.next, false);
  assert.equal(outcome.status, 403);
  assert.equal(outcome.body.message, 'Account deleted. Please contact support.');
});

test('authenticate rejects a suspended account even when a user was pre-attached', async () => {
  const token = signSession({ userId: 7, tv: 5 });
  const suspendedRow = userRow({ is_active: false, account_suspended_reason: 'Fraud review' });

  const outcome = await withMockedUserQuery(suspendedRow, () =>
    runAuthenticate({
      headers: { authorization: `Bearer ${token}` },
      user: { id: 7, user_type: 'super_admin', _tokenOnly: true },
    })
  );

  assert.equal(outcome.next, false);
  assert.equal(outcome.status, 403);
  assert.equal(outcome.body.message, 'Account suspended: Fraud review');
});

test('authenticate rejects a token for an account that no longer exists', async () => {
  const token = signSession({ userId: 999998, tv: 5 });

  const outcome = await withMockedUserQuery(null, () =>
    runAuthenticate({
      headers: { authorization: `Bearer ${token}` },
      user: { id: 999998, user_type: 'super_admin', _tokenOnly: true },
    })
  );

  assert.equal(outcome.next, false);
  assert.equal(outcome.status, 401);
});

test('authenticate loads the full row (email included) for a valid token', async () => {
  const token = signSession({ userId: 7, tv: 5 });
  const req = {
    headers: { authorization: `Bearer ${token}` },
    user: { id: 7, user_type: 'super_admin', _tokenOnly: true },
  };

  await withMockedUserQuery(userRow(), async () => {
    const outcome = await runAuthenticate(req);
    assert.equal(outcome.next, true);

    // req.user.email must be present: TOTP setup uses it to label the QR code,
    // and it used to render as "Amana RentalHub NG:undefined".
    assert.equal(req.user.email, 'admin@example.test');
    assert.equal(req.user.token_version, 5);
    assert.equal(req.user._tokenOnly, undefined);
  });
});
