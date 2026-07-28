const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getSessionTokenIdentity,
  hasTokenPurpose,
} = require('../config/utils/sessionToken');

test('accepts current and legacy-shaped session claims with a role and version', () => {
  assert.deepEqual(
    getSessionTokenIdentity({
      userId: 7,
      userType: 'tenant',
      tv: 3,
      purpose: 'session',
    }),
    { userId: 7, userType: 'tenant', tokenVersion: 3 }
  );

  assert.deepEqual(
    getSessionTokenIdentity({ id: 8, user_type: 'admin', tv: 1 }),
    { userId: 8, userType: 'admin', tokenVersion: 1 }
  );
});

test('rejects password reset and email verification tokens as sessions', () => {
  assert.throws(
    () =>
      getSessionTokenIdentity({
        userId: 7,
        purpose: 'password-reset',
        tv: 1,
      }),
    /not a session token/
  );
  assert.throws(
    () =>
      getSessionTokenIdentity({
        userId: 7,
        email: 'user@example.com',
        purpose: 'email-verification',
      }),
    /not a session token/
  );
});

test('rejects incomplete session claims and validates dedicated purposes', () => {
  assert.throws(
    () => getSessionTokenIdentity({ userId: 7, userType: 'tenant' }),
    /Invalid session token claims/
  );
  assert.equal(
    hasTokenPurpose({ purpose: 'password-reset' }, 'password-reset'),
    true
  );
  assert.equal(hasTokenPurpose({}, 'password-reset'), false);
});
