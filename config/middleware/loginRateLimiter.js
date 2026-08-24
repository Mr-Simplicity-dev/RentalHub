// Per-account login rate limiter — prevents credential stuffing even from
// distributed IPs by tracking failed attempts per email address.
const ATTEMPT_WINDOW_MS = Number(process.env.LOGIN_ATTEMPT_WINDOW_MS) || 15 * 60 * 1000;
const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 10;

const attempts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now - entry.start > ATTEMPT_WINDOW_MS * 2) attempts.delete(key);
  }
}, 60_000);

const getLoginAttempts = (email) => {
  const key = String(email).trim().toLowerCase();
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.start > ATTEMPT_WINDOW_MS) {
    return { key, count: 0, blocked: false };
  }

  return { key, count: entry.count, blocked: entry.count >= MAX_ATTEMPTS };
};

const recordFailedLogin = (email) => {
  const key = String(email).trim().toLowerCase();
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.start > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { start: now, count: 1 });
  } else {
    entry.count += 1;
  }
};

const clearLoginAttempts = (email) => {
  const key = String(email).trim().toLowerCase();
  attempts.delete(key);
};

const checkLoginRateLimit = (req, res, next) => {
  const email = req.body?.email;
  if (!email) return next();

  const { blocked, count } = getLoginAttempts(email);
  if (blocked) {
    const remainingMs = ATTEMPT_WINDOW_MS;
    res.set('Retry-After', String(Math.ceil(remainingMs / 1000)));
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again later.',
    });
  }

  next();
};

module.exports = { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts };
