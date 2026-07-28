const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateGuestAccessToken,
  hashGuestAccessToken,
  verifyGuestAccessToken,
  isGuestAccessTokenFormatValid,
  canUseLegacyGuestEmailAccess,
} = require('../config/utils/guestSupportAccess');
const supportRoutes = require('../routes/support');

test('guest support access tokens are high-entropy, URL-safe, and unique', () => {
  const first = generateGuestAccessToken();
  const second = generateGuestAccessToken();

  assert.match(first, /^rhg_[A-Za-z0-9_-]{43}$/);
  assert.equal(isGuestAccessTokenFormatValid(first), true);
  assert.notEqual(first, second);
});

test('guest support stores and compares only token hashes', () => {
  const token = generateGuestAccessToken();
  const hash = hashGuestAccessToken(token);
  const changedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash.includes(token), false);
  assert.equal(verifyGuestAccessToken(token, hash), true);
  assert.equal(verifyGuestAccessToken(changedToken, hash), false);
  assert.equal(verifyGuestAccessToken('not-a-valid-token', hash), false);
});

test('legacy email proof is disabled by default and expires when explicitly enabled', () => {
  const originalSetting = process.env.GUEST_SUPPORT_ALLOW_LEGACY_EMAIL_ACCESS;
  const ticket = {
    contact_email: 'guest@example.com',
    guest_access_token_hash: null,
    guest_access_token_revoked_at: null,
    guest_legacy_access_expires_at: '2026-08-10T00:00:00.000Z',
  };

  try {
    delete process.env.GUEST_SUPPORT_ALLOW_LEGACY_EMAIL_ACCESS;
    assert.equal(
      canUseLegacyGuestEmailAccess(ticket, 'guest@example.com', new Date('2026-08-01T00:00:00.000Z')),
      false
    );

    process.env.GUEST_SUPPORT_ALLOW_LEGACY_EMAIL_ACCESS = 'true';
    assert.equal(
      canUseLegacyGuestEmailAccess(ticket, ' Guest@Example.com ', new Date('2026-08-01T00:00:00.000Z')),
      true
    );
    assert.equal(
      canUseLegacyGuestEmailAccess(ticket, 'other@example.com', new Date('2026-08-01T00:00:00.000Z')),
      false
    );
    assert.equal(
      canUseLegacyGuestEmailAccess(ticket, 'guest@example.com', new Date('2026-08-11T00:00:00.000Z')),
      false
    );
    assert.equal(
      canUseLegacyGuestEmailAccess(
        { ...ticket, guest_access_token_hash: 'a'.repeat(64) },
        'guest@example.com',
        new Date('2026-08-01T00:00:00.000Z')
      ),
      false
    );
  } finally {
    if (originalSetting === undefined) {
      delete process.env.GUEST_SUPPORT_ALLOW_LEGACY_EMAIL_ACCESS;
    } else {
      process.env.GUEST_SUPPORT_ALLOW_LEGACY_EMAIL_ACCESS = originalSetting;
    }
  }
});

test('support ticket payloads never expose guest credential metadata', () => {
  const { toClientSupportTicket, getGuestAccessTokenFromRequest } =
    supportRoutes._supportScopeForTest;
  const safeTicket = toClientSupportTicket({
    id: 17,
    subject: 'Help',
    guest_access_token_hash: 'a'.repeat(64),
    guest_access_token_created_at: new Date(),
    guest_access_token_last_used_at: new Date(),
    guest_access_token_revoked_at: null,
    guest_legacy_access_expires_at: new Date(),
  });

  assert.deepEqual(safeTicket, { id: 17, subject: 'Help' });
  assert.equal(
    getGuestAccessTokenFromRequest({
      get: (name) => name === 'x-guest-access-token' ? 'rhg_header' : undefined,
      body: { guestAccessToken: 'rhg_body' },
    }),
    'rhg_header'
  );
});
