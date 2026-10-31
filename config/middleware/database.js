const logger = require('../utils/logger');
const { Pool } = require('pg');
const nigeriaLocations = require('../../data/nigeriaLocations');
require('dotenv').config();

const DB_SSL = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production';
const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

Object.assign(poolConfig, {
  max: Math.max(Number(process.env.DB_POOL_MAX) || 20, 1),
  idleTimeoutMillis: Math.max(Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000, 1000),
  connectionTimeoutMillis: Math.max(Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 2000, 500),
  query_timeout: Math.max(Number(process.env.DB_QUERY_TIMEOUT_MS) || 15000, 1000),
});

if (DB_SSL) {
  poolConfig.ssl = {
    rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED,
  };
}

const fallbackStatesRows = nigeriaLocations.map((entry, idx) => ({
  id: idx + 1,
  state_name: entry.displayName || entry.state,
  state_code: entry.slug || String(entry.state || '').toLowerCase(),
}));

const mockQuery = async (sql = '') => {
  const normalized = String(sql).trim();
  if (/FROM\s+states\b/i.test(normalized) && /^SELECT\b/i.test(normalized)) {
    return { rows: fallbackStatesRows, rowCount: fallbackStatesRows.length };
  }
  if (/SELECT\s+COUNT\s*\(/i.test(normalized)) {
    return { rows: [{ count: '0', total: '0' }], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
};

let realPool = null;
let useMock = !process.env.DATABASE_URL && (!process.env.DB_HOST || process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1');

if (!useMock) {
  try {
    realPool = new Pool(poolConfig);
    realPool.on('error', (err) => {
      logger.warn('Database pool error (falling back to mock):', err.message);
      useMock = true;
    });
  } catch (err) {
    logger.warn('DB not connected — mock active:', err.message);
    useMock = true;
  }
} else {
  logger.warn('DB not connected — mock active');
}

const db = {
  query: async (text, params) => {
    if (!useMock && realPool) {
      try {
        return await realPool.query(text, params);
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.message?.includes('Connection terminated')) {
          logger.warn('Database unreachable, activating in-memory mock:', err.message);
          useMock = true;
          return mockQuery(text, params);
        }
        throw err;
      }
    }
    return mockQuery(text, params);
  },
  connect: async () => {
    if (!useMock && realPool) {
      try {
        return await realPool.connect();
      } catch (err) {
        logger.warn('Database connect failed, using mock client:', err.message);
        useMock = true;
      }
    }
    return {
      query: (text, params) => mockQuery(text, params),
      release: () => {},
    };
  },
  end: async () => {
    if (realPool) {
      await realPool.end().catch(() => {});
    }
  },
  on: (event, handler) => {
    if (realPool) {
      realPool.on(event, handler);
    }
  },
};

module.exports = db;
