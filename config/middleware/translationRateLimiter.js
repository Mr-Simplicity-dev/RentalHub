const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const logger = require('../utils/logger');

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 60;
const INCREMENT_SCRIPT = `
local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local current = redis.call('INCR', key)
if current == 1 then redis.call('PEXPIRE', key, window_ms) end
local ttl = redis.call('PTTL', key)
if ttl < 0 then redis.call('PEXPIRE', key, window_ms); ttl = window_ms end
return { current, ttl }
`;

const hashKey = (key) => crypto.createHash('sha256').update(`translation:${key}`).digest('hex');
const isValidRedisUrl = (value) => {
  try {
    const parsed = new URL(String(value));
    return ['redis:', 'rediss:'].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};
const resolvePositiveNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const unavailableResponse = (res) => res.status(503).json({
  success: false,
  code: 'TRANSLATION_LIMITER_UNAVAILABLE',
  message: 'Translation is temporarily unavailable.',
});

class RedisTranslationStore {
  constructor({ client, now = Date.now, readyPromise = Promise.resolve() } = {}) {
    this.client = client;
    this.now = now;
    this.readyPromise = readyPromise;
    this.prefix = 'translation:shared:';
    this.windowMs = DEFAULT_WINDOW_MS;
    readyPromise.catch(() => {});
  }

  init(options = {}) {
    const windowMs = Number(options.windowMs);
    if (Number.isFinite(windowMs) && windowMs > 0) this.windowMs = windowMs;
  }

  async increment(key) {
    await this.readyPromise;
    const result = await this.client.eval(
      INCREMENT_SCRIPT,
      1,
      `translation:rl:${hashKey(key)}`,
      String(this.windowMs)
    );
    return {
      totalHits: Number(Array.isArray(result) ? result[0] : result),
      resetTime: new Date(this.now() + Math.max(0, Number(Array.isArray(result) ? result[1] : this.windowMs))),
    };
  }

  async decrement(key) {
    await this.readyPromise;
    await this.client.decr(`translation:rl:${hashKey(key)}`);
  }

  async resetKey(key) {
    await this.readyPromise;
    await this.client.del(`translation:rl:${hashKey(key)}`);
  }
}

const adaptInjectedStore = (store) => ({
  prefix: 'translation:injected:',
  init(options = {}) {
    const windowMs = Number(options.windowMs);
    this.windowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS;
    if (typeof store.init === 'function') store.init(options);
  },
  async increment(key) {
    return store.increment(key, this.windowMs);
  },
  async decrement(key) {
    if (typeof store.decrement === 'function') await store.decrement(key);
  },
  async resetKey(key) {
    if (typeof store.resetKey === 'function') await store.resetKey(key);
  },
});

const createTranslationLimiter = ({
  env = process.env,
  sharedStore = null,
  redisFactory = (url, options) => new Redis(url, options),
  logger: log = logger,
  now = Date.now,
  windowMs = env.TRANSLATION_WINDOW_MS,
  max = env.TRANSLATION_MAX,
} = {}) => {
  let store = null;
  let redisClient = null;
  let unavailable = null;

  const resolvedWindowMs = resolvePositiveNumber(windowMs, DEFAULT_WINDOW_MS);
  const resolvedMax = resolvePositiveNumber(max, DEFAULT_MAX);
  if (!resolvedWindowMs || !Number.isInteger(resolvedMax)) {
    unavailable = 'SHARED_STORE_CONFIG_INVALID';
    log.error('Translation rate limit configuration invalid', { code: 'SHARED_STORE_CONFIG_INVALID' });
  }

  if (sharedStore && typeof sharedStore.increment === 'function') {
    store = adaptInjectedStore(sharedStore);
  } else if (!unavailable) {
    // REDIS_URL is not trusted here: the existing health check uses a memory shim.
    const url = env.TRANSLATION_RATE_LIMIT_REDIS_URL;
    if (!url) {
      unavailable = 'SHARED_STORE_NOT_CONFIGURED';
    } else if (!isValidRedisUrl(url)) {
      unavailable = 'SHARED_STORE_CONFIG_INVALID';
      log.error('Translation rate limit configuration invalid', { code: 'SHARED_STORE_CONFIG_INVALID' });
    } else {
      try {
        const client = redisFactory(url, {
          lazyConnect: true,
          enableOfflineQueue: false,
          connectTimeout: 1500,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        });
        client.on('error', () => {
          unavailable = 'SHARED_STORE_UNAVAILABLE';
          log.error('Translation rate limit store unavailable', { code: 'SHARED_STORE_UNAVAILABLE' });
        });
        const readyPromise = (async () => {
          await client.connect();
          await client.ping();
        })();
        redisClient = client;
        store = new RedisTranslationStore({ client, now, readyPromise });
        readyPromise.catch(() => {
          unavailable = 'SHARED_STORE_UNAVAILABLE';
          log.error('Translation rate limit store unavailable', { code: 'SHARED_STORE_UNAVAILABLE' });
        });
      } catch {
        unavailable = 'SHARED_STORE_UNAVAILABLE';
        log.error('Translation rate limit store unavailable', { code: 'SHARED_STORE_UNAVAILABLE' });
      }
    }
  }

  const unavailableStore = {
    prefix: 'translation:unavailable:',
    init() {},
    async increment() {
      throw Object.assign(new Error('shared limiter unavailable'), {
        code: unavailable || 'SHARED_STORE_UNAVAILABLE',
      });
    },
    async decrement() {},
    async resetKey() {},
  };

  const limiter = rateLimit({
    store: store || unavailableStore,
    windowMs: resolvedWindowMs || DEFAULT_WINDOW_MS,
    max: Number.isInteger(resolvedMax) ? resolvedMax : DEFAULT_MAX,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id
      ? `user:${req.user.id}`
      : `anon:${req.ip || req.socket?.remoteAddress || 'unknown'}`),
    handler: (_req, res) => res.status(429).json({
      success: false,
      code: 'TRANSLATION_RATE_LIMITED',
      message: 'Too many translation requests. Please try again later.',
    }),
  });

  const applied = Symbol('translationRateLimiter');
  const middleware = (req, res, next) => {
    if (req[applied]) return next();
    req[applied] = true;

    const failClosed = (error) => {
      unavailable = error?.code || 'SHARED_STORE_UNAVAILABLE';
      log.error('Translation rate limit store unavailable', { code: 'SHARED_STORE_UNAVAILABLE' });
      return unavailableResponse(res);
    };

    if (unavailable) return failClosed({ code: unavailable });
    try {
      return limiter(req, res, (error) => (error ? failClosed(error) : next()));
    } catch (error) {
      return failClosed(error);
    }
  };

  middleware.close = async () => {
    if (!redisClient) return;
    const client = redisClient;
    redisClient = null;
    try {
      await client.quit();
    } catch {
      try { client.disconnect(); } catch {}
    }
  };

  return middleware;
};

module.exports = {
  createTranslationLimiter,
  RedisTranslationStore,
  INCREMENT_SCRIPT,
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX,
};
