// Per-account login rate limiter — Redis-backed (shared across PM2 instances)
// with an in-memory fallback when Redis is unavailable. Uses a hashed key so the
// raw email never lands in Redis.
const crypto = require('crypto');
const redis = require('../utils/redis');

const ATTEMPT_WINDOW_MS = Number(process.env.LOGIN_ATTEMPT_WINDOW_MS) || 15 * 60 * 1000;
const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 10;
const WINDOW_SECONDS = Math.max(1, Math.ceil(ATTEMPT_WINDOW_MS / 1000));

const keyFor = (email) =>
  `login:${crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex')}`;

const fallback = new Map();

const getLoginAttempts = async (email) => {
  const key = keyFor(email);

  if (redis) {
    try {
      const raw = await redis.get(key);
      const count = Number(raw || 0);
      return { key, count, blocked: count >= MAX_ATTEMPTS };
    } catch (error) {
      // fall through to memory
    }
  }

  const entry = fallback.get(key);
  if (!entry || Date.now() - entry.start > ATTEMPT_WINDOW_MS) {
    return { key, count: 0, blocked: false };
  }
  return { key, count: entry.count, blocked: entry.count >= MAX_ATTEMPTS };
};

const recordFailedLogin = async (email) => {
  const key = keyFor(email);

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, WINDOW_SECONDS);
      return;
    } catch (error) {
      // fall through to memory
    }
  }

  const entry = fallback.get(key);
  if (!entry || Date.now() - entry.start > ATTEMPT_WINDOW_MS) {
    fallback.set(key, { start: Date.now(), count: 1 });
  } else {
    entry.count += 1;
  }
};

const clearLoginAttempts = async (email) => {
  const key = keyFor(email);

  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (error) {
      // fall through to memory
    }
  }

  fallback.delete(key);
};

const checkLoginRateLimit = async (req, res, next) => {
  const email = req.body?.email;
  if (!email) return next();

  try {
    const { blocked } = await getLoginAttempts(email);
    if (blocked) {
      res.set('Retry-After', String(WINDOW_SECONDS));
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again later.',
      });
    }
  } catch (error) {
    // never block login on limiter failure
  }

  next();
};

module.exports = { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts };
