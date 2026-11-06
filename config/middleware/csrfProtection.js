const crypto = require('crypto');
const {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parseCookies,
} = require('../utils/authCookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/register/payment',
  '/api/auth/register/tenant-payment',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/send-phone-otp',
  '/api/auth/verify-phone',
  '/api/auth/google',
  '/api/auth/google/start',
  '/api/auth/google/mobile/exchange',
  '/api/auth/refresh-token',
  '/api/recruitment/payments/webhook',
  '/api/whatsapp/webhook',
  '/api/paystack/webhook',
  '/api/monnify/webhook',
  '/api/palmpay/webhook',
  '/api/mobile/diagnostics/crash',
  '/api/mobile/analytics/events',
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
  // 1. Safe methods (GET, HEAD, OPTIONS) never mutate state and are always exempt
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // 2. Native mobile clients cannot be CSRF attacked (mobile apps run outside web browser sandbox)
  const clientHeader = String(req.headers['x-rentalhub-client'] || req.headers['x-client-platform'] || '').toLowerCase();
  if (clientHeader === 'native' || clientHeader === 'mobile' || clientHeader === 'android' || clientHeader === 'ios') {
    return next();
  }

  // 3. Requests explicitly authenticated via Bearer token are API calls, not ambient cookie requests
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ') && authHeader.length > 7) {
    return next();
  }

  // 4. Exact path exemptions
  const path = req.path || '';
  if (CSRF_EXEMPT_PATHS.has(path)) {
    return next();
  }

  // 5. Prefix exemptions: all registration payment flows, webhooks, and public onboarding
  if (
    path.startsWith('/api/auth/register') ||
    path.startsWith('/api/auth/lawyer/accept') ||
    path.startsWith('/api/auth/agent/accept') ||
    path.startsWith('/api/assisted-registration') ||
    path.startsWith('/api/virtual-accounts') ||
    path.startsWith('/api/prembly/webhook/') ||
    path.includes('/webhook')
  ) {
    return next();
  }

  // 6. Only enforce CSRF if ambient session cookies are present (browser session).
  const cookies = parseCookies(req.headers.cookie);

  if (!maybeCookieAuth(cookies)) {
    return next();
  }

  const existingCsrfCookie = cookies[CSRF_COOKIE_NAME];

  if (!existingCsrfCookie) {
    const token = crypto.randomBytes(24).toString('hex');
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.append('Set-Cookie', `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Lax${secureFlag}`);

    return res.status(403).json({
      success: false,
      message: 'CSRF token required',
    });
  }

  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfHeader) {
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
