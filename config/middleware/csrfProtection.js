const crypto = require('crypto');
const {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parseCookies,
} = require('../utils/authCookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/recruitment/payments/webhook',
]);

const maybeCookieAuth = (cookies) => {
  return Boolean(
    cookies[AUTH_COOKIE_NAME] ||
    cookies.auth_token ||
    cookies.access_token ||
    cookies.session ||
    cookies.jwt ||
    cookies.token
  );
};

const csrfProtection = (req, res, next) => {
  if (
    CSRF_EXEMPT_PATHS.has(req.path) ||
    req.path.startsWith('/api/prembly/webhook/')
  ) {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);

  if (!maybeCookieAuth(cookies)) {
    return next();
  }

  const existingCsrfCookie = cookies[CSRF_COOKIE_NAME];

  if (!existingCsrfCookie) {
    const token = crypto.randomBytes(24).toString('hex');
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.append('Set-Cookie', `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Lax${secureFlag}`);

    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'CSRF token required',
    });
  }

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfHeader || !existingCsrfCookie) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
    });
  }

  // Timing-safe comparison to prevent timing attacks
  const buf1 = Buffer.from(String(csrfHeader));
  const buf2 = Buffer.from(String(existingCsrfCookie));
  if (buf1.length !== buf2.length || !crypto.timingSafeEqual(buf1, buf2)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
    });
  }

  return next();
};

module.exports = csrfProtection;
