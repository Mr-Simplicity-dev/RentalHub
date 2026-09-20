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
  logger.error(
    'Database environment variables are missing (DB_HOST/DB_NAME/DB_USER/DB_PASSWORD). Database calls will fail until they are set.'
  );
}

// Single real PostgreSQL pool. There is deliberately NO in-memory mock
// fallback: a silent mock used to serve an empty database in production
// (no users, no listings, login always failed). If the database is
// unreachable the app must fail loudly, not pretend to work.
const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.warn('Database pool error:', err.message);
});

module.exports = pool;
