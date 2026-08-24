const crypto = require('crypto');

const GUEST_ACCESS_TOKEN_PREFIX = 'rhg_';
const GUEST_ACCESS_TOKEN_BYTES = 32;
const GUEST_ACCESS_TOKEN_PATTERN = /^rhg_[A-Za-z0-9_-]{43}$/;

const normalizeGuestEmail = (value) => String(value || '').trim().toLowerCase();

const generateGuestAccessToken = () =>
  `${GUEST_ACCESS_TOKEN_PREFIX}${crypto.randomBytes(GUEST_ACCESS_TOKEN_BYTES).toString('base64url')}`;

const isGuestAccessTokenFormatValid = (token) =>
  GUEST_ACCESS_TOKEN_PATTERN.test(String(token || '').trim());

const hashGuestAccessToken = (token) => {
  const normalizedToken = String(token || '').trim();
  if (!isGuestAccessTokenFormatValid(normalizedToken)) return null;
  return crypto.createHash('sha256').update(normalizedToken, 'utf8').digest('hex');
};

const verifyGuestAccessToken = (token, expectedHash) => {
  const actualHash = hashGuestAccessToken(token);
  const normalizedExpectedHash = String(expectedHash || '').trim().toLowerCase();

  if (!actualHash || !/^[a-f0-9]{64}$/.test(normalizedExpectedHash)) return false;

  return crypto.timingSafeEqual(
    Buffer.from(actualHash, 'hex'),
    Buffer.from(normalizedExpectedHash, 'hex')
  );
};

const isLegacyGuestEmailAccessEnabled = () =>
  String(process.env.GUEST_SUPPORT_ALLOW_LEGACY_EMAIL_ACCESS || '').trim().toLowerCase() === 'true';

const canUseLegacyGuestEmailAccess = (ticket, email, now = new Date()) => {
  if (!isLegacyGuestEmailAccessEnabled()) return false;
  if (!ticket || ticket.guest_access_token_hash || ticket.guest_access_token_revoked_at) return false;

  const normalizedEmail = normalizeGuestEmail(email);
  if (!normalizedEmail || normalizeGuestEmail(ticket.contact_email) !== normalizedEmail) return false;

  const expiresAt = new Date(ticket.guest_legacy_access_expires_at);
  if (Number.isNaN(expiresAt.getTime())) return false;

  return expiresAt.getTime() > new Date(now).getTime();
};

module.exports = {
  GUEST_ACCESS_TOKEN_PREFIX,
  generateGuestAccessToken,
  hashGuestAccessToken,
  verifyGuestAccessToken,
  isGuestAccessTokenFormatValid,
  normalizeGuestEmail,
  isLegacyGuestEmailAccessEnabled,
  canUseLegacyGuestEmailAccess,
};
