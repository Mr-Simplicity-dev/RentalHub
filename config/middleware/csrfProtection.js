const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const parseCookies = (cookieHeader = '') => {
  return String(cookieHeader || '')
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
};

const maybeCookieAuth = (cookies) => {
  return Boolean(
    cookies.auth_token ||
    cookies.access_token ||
    cookies.session ||
    cookies.jwt ||
    cookies.token
  );
};

const csrfProtection = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);

  if (!maybeCookieAuth(cookies)) {
    return next();
  }

  const existingCsrfCookie = cookies.csrf_token;

  if (!existingCsrfCookie) {
    const token = crypto.randomBytes(24).toString('hex');
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.append('Set-Cookie', `csrf_token=${token}; Path=/; SameSite=Lax; HttpOnly=false${secureFlag}`);

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
  if (!csrfHeader || csrfHeader !== existingCsrfCookie) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
    });
  }

  return next();
};

module.exports = csrfProtection;
