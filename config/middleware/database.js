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

let pool;
// Only use the in-memory mock when EXPLICITLY requested, or when no database is
// configured at all. Previously `DB_HOST === 'localhost'` forced the mock even
// on production servers whose real PostgreSQL runs on localhost, which silently
// served an empty database (no users, no properties, login always failed).
const useMock = process.env.USE_MOCK_DB === 'true'
  || (!process.env.DB_HOST && !process.env.DATABASE_URL);

if (useMock) {
  logger.info('[AI Studio] PostgreSQL live server not detected — using in-memory MockPool');
  pool = new MockPool();
} else {
  pool = new Pool(poolConfig);
  pool.on('error', (err) => {
    logger.warn('Database pool error:', err.message);
  });
}

module.exports = pool;
