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
};

if (DB_SSL) {
  poolConfig.ssl = {
    rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED,
  };
}

if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('FATAL: Missing required database environment variables (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)');
  process.exit(1);
}

const pool = new Pool(poolConfig);

let hasLoggedConnection = false;

pool.on('connect', () => {
  if (!hasLoggedConnection) {
    console.log('Database connected successfully');
    hasLoggedConnection = true;
  }
});

pool.on('error', (err) => {
  console.error('Database pool error (attempting recovery):', err.message);
});

module.exports = pool;
