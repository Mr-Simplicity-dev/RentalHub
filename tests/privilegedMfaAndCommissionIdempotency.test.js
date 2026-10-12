const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/middleware/database');
const twoFactor = require('../config/utils/twoFactor');
const commissionService = require('../services/commissionService');

test('requirePrivilegedMfa verifies a fresh TOTP challenge before allowing privileged access', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('ALTER TABLE users')) return { rows: [] };
    if (sql.includes('FROM users WHERE id = $1')) {
      return {
        rows: [{
          totp_secret: 'JBSWY3DPEHPK3PXP',
          totp_enabled: true,
          totp_failed_attempts: 0,
          totp_locked_until: null,
          totp_recovery_codes: '[]',
          mfa_grace_until: null,
          mfa_last_verified_at: null,
        }],
      };
    }
    return { rows: [] };
  };

  const calls = [];
  const req = {
    user: { id: 42, user_type: 'super_admin' },
    body: { totp_code: '123456' },
    headers: {},
  };
  const res = {
    status(code) {
      calls.push(['status', code]);
      return { json(payload) { calls.push(['json', payload]); return payload; } };
    },
  };

  const originalVerify = twoFactor.verifyTotpCode;
  twoFactor.verifyTotpCode = async ({ userId, code }) => {
    calls.push(['verifyTotpCode', userId, code]);
    assert.equal(userId, 42);
    assert.equal(code, '123456');
    return true;
  };

  await twoFactor.requirePrivilegedMfa(req, res, () => {
    calls.push(['next']);
  });

  db.query = originalQuery;
  twoFactor.verifyTotpCode = originalVerify;

  assert.deepEqual(calls.filter((item) => item[0] === 'verifyTotpCode').length, 1);
  assert.ok(calls.some((item) => item[0] === 'next'));
});

test('ensureCommissionIdempotency creates a unique payment-admin index for commission rows', async () => {
  const calls = [];
  const fakeExecutor = {
    query: async (sql) => {
      calls.push(sql);
      return { rows: [] };
    },
  };

  await commissionService.ensureCommissionIdempotency(fakeExecutor);

  const combinedSql = calls.join('\n');
  assert.match(combinedSql, /idx_admin_commissions_payment_admin_once/i);
  assert.match(combinedSql, /payment_id.*admin_id/i);
});
