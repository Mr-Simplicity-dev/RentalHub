let redis = null;

const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

if (REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('Redis connection error (falling back to in-memory):', err.message);
      redis = null;
    });

    // Attempt connection in background
    redis.connect().catch(() => {
      redis = null;
    });
  } catch (err) {
    console.error('Failed to initialize Redis (falling back to in-memory):', err.message);
    redis = null;
  }
}

module.exports = redis;
