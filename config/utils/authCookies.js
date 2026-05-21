const crypto = require('crypto');

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_token';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'csrf_token';
const AUTH_COOKIE_MAX_AGE_MS =
  Number(process.env.AUTH_COOKIE_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000;

const parseCookies = (cookieHeader = '') =>
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf('=');
      if (index === -1) return acc;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value || '');
      return acc;
    }, {});

const getCookieDomain = () => {
  const domain = String(process.env.AUTH_COOKIE_DOMAIN || '').trim();
  return domain || undefined;
};

const getSameSite = () => {
  const configured = String(process.env.AUTH_COOKIE_SAMESITE || '').trim().toLowerCase();
  if (['strict', 'lax', 'none'].includes(configured)) return configured;
  return 'lax';
};

const getBaseCookieOptions = () => ({
  secure: process.env.NODE_ENV === 'production',
  sameSite: getSameSite(),
  path: '/',
  domain: getCookieDomain(),
});

const shouldReturnTokenInBody = () =>
  process.env.RETURN_AUTH_TOKEN_IN_BODY !== 'false' &&
  process.env.COOKIE_AUTH_STRICT !== 'true';

const createCsrfToken = () => crypto.randomBytes(24).toString('hex');

const setAuthCookies = (res, token, options = {}) => {
  const maxAge = options.maxAge || AUTH_COOKIE_MAX_AGE_MS;
  const csrfToken = options.csrfToken || createCsrfToken();
  const baseOptions = getBaseCookieOptions();

  res.cookie(AUTH_COOKIE_NAME, token, {
    ...baseOptions,
    httpOnly: true,
    maxAge,
  });

  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...baseOptions,
    httpOnly: false,
    maxAge,
  });

  return csrfToken;
};

const clearAuthCookies = (res) => {
  const baseOptions = getBaseCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...baseOptions,
    httpOnly: true,
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    ...baseOptions,
    httpOnly: false,
  });
};

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
};

const getAuthTokenFromRequest = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[AUTH_COOKIE_NAME] || getBearerToken(req);
};

const getSocketAuthToken = (socket) => {
  const cookies = parseCookies(socket.handshake?.headers?.cookie);
  return (
    socket.handshake?.auth?.token ||
    cookies[AUTH_COOKIE_NAME] ||
    String(socket.handshake?.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  );
};

module.exports = {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parseCookies,
  shouldReturnTokenInBody,
  setAuthCookies,
  clearAuthCookies,
  getAuthTokenFromRequest,
  getSocketAuthToken,
};
