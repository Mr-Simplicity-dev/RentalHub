const logger = require('../utils/logger');
const { Pool } = require('pg');
require('dotenv').config();

const DB_SSL = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production';
const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

const poolConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: Math.max(Number(process.env.DB_POOL_MAX) || 20, 1),
  idleTimeoutMillis: Math.max(Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000, 1000),
  connectionTimeoutMillis: Math.max(Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 10000, 1000),
  query_timeout: Math.max(Number(process.env.DB_QUERY_TIMEOUT_MS) || 15000, 1000),
};

if (DB_SSL) {
  poolConfig.ssl = {
    rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED,
  };
}

if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  logger.warn('Database environment variables missing, running in mock/fallback mode');
}

const EventEmitter = require('events');

const mockStates = [
  { id: 1, state_name: 'Lagos', slug: 'lagos' },
  { id: 2, state_name: 'Abuja (FCT)', slug: 'abuja' },
  { id: 3, state_name: 'Oyo', slug: 'oyo' },
  { id: 4, state_name: 'Rivers', slug: 'rivers' },
  { id: 5, state_name: 'Ogun', slug: 'ogun' },
  { id: 6, state_name: 'Enugu', slug: 'enugu' },
  { id: 7, state_name: 'Kano', slug: 'kano' },
];

const handleMockQuery = (text) => {
  const sql = String(text || '').toLowerCase();
  if (sql.includes('from states') || sql.includes('states order by')) {
    return { rows: [...mockStates], rowCount: mockStates.length, fields: [] };
  }
  return { rows: [], rowCount: 0, fields: [] };
};

class MockPool extends EventEmitter {
  constructor() {
    super();
    this.totalCount = 0;
    this.idleCount = 0;
    this.waitingCount = 0;
  }

  query(text, values, callback) {
    let cb = callback;
    let params = values;
    if (typeof values === 'function') {
      cb = values;
      params = undefined;
    }

    const result = handleMockQuery(text);
    if (typeof cb === 'function') {
      process.nextTick(() => cb(null, result));
      return;
    }
    return Promise.resolve(result);
  }

  connect(callback) {
    const client = new EventEmitter();
    client.query = (text, values, cb) => {
      let callbackFn = cb;
      if (typeof values === 'function') {
        callbackFn = values;
      }
      const res = handleMockQuery(text);
      if (typeof callbackFn === 'function') {
        process.nextTick(() => callbackFn(null, res));
        return;
      }
      return Promise.resolve(res);
    };
    client.release = () => {};

    if (typeof callback === 'function') {
      process.nextTick(() => callback(null, client, () => {}));
      return;
    }
    return Promise.resolve(client);
  }

  end() {
    return Promise.resolve();
  }
}

class ResilientPool extends EventEmitter {
  constructor(realPool, mockPool) {
    super();
    this.realPool = realPool;
    this.mockPool = mockPool;
    this.usingMock = false;

    this.realPool.on('error', (err) => {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
        if (!this.usingMock) {
          this.usingMock = true;
          logger.info('[AI Studio] PostgreSQL live server not detected — using in-memory MockPool');
        }
      } else {
        logger.warn('Database pool error:', err.message);
      }
    });
  }

  get totalCount() { return this.usingMock ? this.mockPool.totalCount : (this.realPool.totalCount || 0); }
  get idleCount() { return this.usingMock ? this.mockPool.idleCount : (this.realPool.idleCount || 0); }
  get waitingCount() { return this.usingMock ? this.mockPool.waitingCount : (this.realPool.waitingCount || 0); }

  async query(text, values, callback) {
    let cb = callback;
    let params = values;
    if (typeof values === 'function') {
      cb = values;
      params = undefined;
    }

    if (this.usingMock) {
      return this.mockPool.query(text, params, cb);
    }

    if (typeof cb === 'function') {
      return this.realPool.query(text, params, (err, res) => {
        if (err && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT')) {
          if (!this.usingMock) {
            this.usingMock = true;
            logger.info('[AI Studio] PostgreSQL live server not detected — using in-memory MockPool');
          }
          return this.mockPool.query(text, params, cb);
        }
        return cb(err, res);
      });
    }

    try {
      return await this.realPool.query(text, params);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
        if (!this.usingMock) {
          this.usingMock = true;
          logger.info('[AI Studio] PostgreSQL live server not detected — using in-memory MockPool');
        }
        return this.mockPool.query(text, params);
      }
      throw err;
    }
  }

  async connect(callback) {
    if (this.usingMock) {
      return this.mockPool.connect(callback);
    }

    try {
      const client = await this.realPool.connect();
      if (typeof callback === 'function') {
        return callback(null, client, client.release.bind(client));
      }
      return client;
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
        if (!this.usingMock) {
          this.usingMock = true;
          logger.info('[AI Studio] PostgreSQL live server not detected — using in-memory MockPool');
        }
        return this.mockPool.connect(callback);
      }
      if (typeof callback === 'function') {
        return callback(err);
      }
      throw err;
    }
  }

  end() {
    return Promise.all([
      this.realPool?.end?.().catch(() => {}),
      this.mockPool?.end?.().catch(() => {}),
    ]);
  }
}

let pool;
const useMock = process.env.USE_MOCK_DB === 'true'
  || (!process.env.DB_HOST && !process.env.DATABASE_URL);

if (useMock) {
  logger.info('[AI Studio] PostgreSQL live server not detected — using in-memory MockPool');
  pool = new MockPool();
} else {
  const realPool = new Pool(poolConfig);
  const mockPool = new MockPool();
  pool = new ResilientPool(realPool, mockPool);
}

module.exports = pool;
