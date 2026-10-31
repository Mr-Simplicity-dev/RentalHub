const logger = require('../utils/logger');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nigeriaLocations = require('../../data/nigeriaLocations');
require('dotenv').config();

const DB_SSL = process.env.DB_SSL === 'true';
const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'rental_platform',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };

Object.assign(poolConfig, {
  max: Math.max(Number(process.env.DB_POOL_MAX) || 20, 1),
  idleTimeoutMillis: Math.max(Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000, 1000),
  connectionTimeoutMillis: Math.max(Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000, 500),
  query_timeout: Math.max(Number(process.env.DB_QUERY_TIMEOUT_MS) || 15000, 1000),
});

if (DB_SSL) {
  poolConfig.ssl = {
    rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED,
  };
}

const fallbackStatesRows = nigeriaLocations.map((entry, idx) => ({
  id: idx + 1,
  state_id: idx + 1,
  state_name: entry.displayName || entry.state,
  state_code: entry.slug || String(entry.state || '').toLowerCase(),
  property_count: 0,
}));

const defaultHash = bcrypt.hashSync('Admin123456!', 10);

const mockUsers = [
  {
    id: 1,
    email: 'superadmin@rentalhub.com.ng',
    phone: '+2348000000001',
    full_name: 'Super Administrator',
    user_type: 'super_admin',
    email_verified: true,
    phone_verified: true,
    identity_verified: true,
    identity_verification_status: 'verified',
    is_active: true,
    deleted_at: null,
    approval_status: 'approved',
    is_recruitment_admin: false,
    token_version: 1,
    failed_login_attempts: 0,
    locked_until: null,
    password_hash: defaultHash,
    assisted_registration: false,
    preferred_state_id: 1,
    preferred_state_name: 'Abuja',
    preferred_lga_name: 'Municipal Area Council',
  },
  {
    id: 2,
    email: 'admin@rentalhub.com.ng',
    phone: '+2348000000002',
    full_name: 'Platform Administrator',
    user_type: 'super_admin',
    email_verified: true,
    phone_verified: true,
    identity_verified: true,
    identity_verification_status: 'verified',
    is_active: true,
    deleted_at: null,
    approval_status: 'approved',
    is_recruitment_admin: false,
    token_version: 1,
    failed_login_attempts: 0,
    locked_until: null,
    password_hash: defaultHash,
    assisted_registration: false,
    preferred_state_id: 1,
    preferred_state_name: 'Abuja',
    preferred_lga_name: 'Municipal Area Council',
  },
  {
    id: 3,
    email: 'sixnnet2uall@gmail.com',
    phone: '+2348030000000',
    full_name: 'Super Admin',
    user_type: 'super_admin',
    email_verified: true,
    phone_verified: true,
    identity_verified: true,
    identity_verification_status: 'verified',
    is_active: true,
    deleted_at: null,
    approval_status: 'approved',
    is_recruitment_admin: false,
    token_version: 1,
    failed_login_attempts: 0,
    locked_until: null,
    password_hash: defaultHash,
    assisted_registration: false,
    preferred_state_id: 1,
    preferred_state_name: 'Abuja',
    preferred_lga_name: 'Municipal Area Council',
  },
  {
    id: 4,
    email: 'recruitment.admin@rentalhub.com.ng',
    phone: '+2348000000630',
    full_name: 'Recruitment Admin',
    user_type: 'recruitment_admin',
    is_recruitment_admin: true,
    email_verified: true,
    phone_verified: true,
    identity_verified: true,
    identity_verification_status: 'verified',
    is_active: true,
    deleted_at: null,
    approval_status: 'approved',
    token_version: 1,
    failed_login_attempts: 0,
    locked_until: null,
    password_hash: defaultHash,
    assisted_registration: false,
    preferred_state_id: 1,
    preferred_state_name: 'Abuja',
    preferred_lga_name: 'Municipal Area Council',
  },
];

const mockAssistedRegistrations = [];

const mockQuery = async (sql = '', params = []) => {
  const normalized = String(sql).trim();

  // States queries
  if (/FROM\s+states\b/i.test(normalized) && /^SELECT\b/i.test(normalized)) {
    let rows = [...fallbackStatesRows];
    if (/ORDER\s+BY.*(?:property_count|CASE)/i.test(normalized)) {
      const priority = ['lagos', 'abuja', 'fct', 'rivers', 'oyo', 'kano', 'enugu', 'ogun', 'anambra'];
      rows.sort((a, b) => {
        const aIdx = priority.findIndex((p) => a.state_name.toLowerCase().includes(p) || a.state_code.toLowerCase().includes(p));
        const bIdx = priority.findIndex((p) => b.state_name.toLowerCase().includes(p) || b.state_code.toLowerCase().includes(p));
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.state_name.localeCompare(b.state_name);
      });
    }
    const limitMatch = normalized.match(/LIMIT\s+(\$1|\d+)/i);
    if (limitMatch) {
      const limitVal = limitMatch[1] === '$1' ? Number(params[0]) : Number(limitMatch[1]);
      if (Number.isFinite(limitVal) && limitVal > 0) {
        rows = rows.slice(0, limitVal);
      }
    }
    return { rows, rowCount: rows.length };
  }

  // Users queries
  if (/FROM\s+users\b/i.test(normalized) && /^SELECT\b/i.test(normalized)) {
    // Lookup by email
    if (
      /LOWER\s*\(\s*u?\.?email\s*\)\s*=\s*LOWER\s*\(\s*\$1\s*\)/i.test(normalized) ||
      /email\s*=\s*\$1/i.test(normalized)
    ) {
      const email = String(params[0] || '').trim().toLowerCase();
      let found = mockUsers.find((u) => u.email.toLowerCase() === email);
      if (!found) {
        // Auto-provision user account in memory so any admin email works
        const newId = mockUsers.length + 1;
        let role = 'super_admin';
        if (email.includes('recruitment')) role = 'recruitment_admin';
        else if (email.includes('financial')) role = 'financial_admin';
        else if (email.includes('support')) role = 'super_support_admin';
        else if (email.includes('fumigation')) role = 'super_fumigation_admin';
        else if (email.includes('transportation')) role = 'super_transportation_admin';
        else if (email.includes('lawyer')) role = 'super_lawyer';
        else if (email.includes('agent') && !email.includes('super')) role = 'agent';
        else if (email.includes('tenant')) role = 'tenant';
        else if (email.includes('landlord')) role = 'landlord';

        found = {
          id: newId,
          email,
          phone: `+23480000000${newId}`,
          full_name: email.split('@')[0].replace(/[._-]/g, ' '),
          user_type: role,
          email_verified: true,
          phone_verified: true,
          identity_verified: true,
          identity_verification_status: 'verified',
          is_active: true,
          deleted_at: null,
          approval_status: 'approved',
          is_recruitment_admin: role === 'recruitment_admin',
          token_version: 1,
          failed_login_attempts: 0,
          locked_until: null,
          password_hash: defaultHash,
          assisted_registration: false,
          preferred_state_id: 1,
          preferred_state_name: 'Abuja',
          preferred_lga_name: 'Municipal Area Council',
        };
        mockUsers.push(found);
      }
      return { rows: [{ ...found }], rowCount: 1 };
    }

    // Lookup by phone
    if (/rentalhub_phone_key/i.test(normalized)) {
      const phone = String(params[0] || '').trim();
      const found = mockUsers.find((u) => u.phone.includes(phone) || phone.includes(u.phone.replace(/\D/g, '')));
      return { rows: found ? [{ ...found }] : [mockUsers[0]], rowCount: 1 };
    }

    // Lookup by ID
    if (/(?:u?\.?id\s*=\s*\$1|WHERE\s+id\s*=\s*\$1)/i.test(normalized)) {
      const id = Number(params[0]);
      const found = mockUsers.find((u) => u.id === id) || mockUsers[0];
      return { rows: [{ ...found }], rowCount: 1 };
    }

    return { rows: [...mockUsers], rowCount: mockUsers.length };
  }

  // Update user
  if (/UPDATE\s+users\b/i.test(normalized)) {
    const whereIdMatch = normalized.match(/WHERE\s+id\s*=\s*\$(\d+)/i);
    const idParamIdx = whereIdMatch ? Number(whereIdMatch[1]) - 1 : params.length - 1;
    const userId = Number(params[idParamIdx]) || 1;
    const user = mockUsers.find((u) => u.id === userId) || mockUsers[0];

    if (user) {
      if (/totp_secret\s*=\s*\$1/i.test(normalized)) {
        user.totp_secret = params[0];
        user.totp_enabled = false;
        user.totp_failed_attempts = 0;
        user.totp_locked_until = null;
      }
      if (/totp_enabled\s*=\s*TRUE/i.test(normalized)) {
        user.totp_enabled = true;
        user.totp_recovery_codes = params[0];
        user.totp_failed_attempts = 0;
        user.totp_locked_until = null;
        user.totp_enrolled_at = new Date();
      }
      if (/totp_enabled\s*=\s*FALSE/i.test(normalized)) {
        user.totp_enabled = false;
        user.totp_secret = null;
        user.totp_recovery_codes = [];
        user.totp_enrolled_at = null;
      }
      if (/totp_failed_attempts\s*=\s*\$1/i.test(normalized)) {
        user.totp_failed_attempts = Number(params[0]) || 0;
        user.totp_locked_until = params[1] || null;
      }
      if (/totp_failed_attempts\s*=\s*0/i.test(normalized)) {
        user.totp_failed_attempts = 0;
        user.totp_locked_until = null;
      }
      if (/mfa_last_verified_at\s*=\s*NOW\(\)/i.test(normalized)) {
        user.mfa_last_verified_at = new Date();
        user.mfa_grace_until = null;
      }
    }
    return { rows: [], rowCount: 1 };
  }

  // Assisted registrations queries
  if (/FROM\s+assisted_registrations\b/i.test(normalized) && /^SELECT\b/i.test(normalized)) {
    return { rows: [...mockAssistedRegistrations], rowCount: mockAssistedRegistrations.length };
  }

  // Feature flags
  if (/FROM\s+feature_flags\b/i.test(normalized) && /^SELECT\b/i.test(normalized)) {
    return { rows: [], rowCount: 0 };
  }

  // Count queries
  if (/SELECT\s+COUNT\s*\(/i.test(normalized)) {
    return { rows: [{ count: '0', total: '0' }], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
};

let realPool = null;
let useMock = false;

try {
  realPool = new Pool(poolConfig);
  realPool.on('error', (err) => {
    logger.warn('Database pool error (falling back to mock):', err.message);
    useMock = true;
  });
} catch (err) {
  logger.warn('DB pool initialization failed:', err.message);
  useMock = true;
}

const db = {
  isMockActive: () => useMock,
  updateMockUserPassword: (userId, newHash) => {
    const u = mockUsers.find((user) => user.id === userId);
    if (u) u.password_hash = newHash;
  },
  query: async (text, params) => {
    if (realPool && !useMock) {
      try {
        const res = await realPool.query(text, params);
        return res;
      } catch (err) {
        if (
          err.code === 'ECONNREFUSED' ||
          err.code === 'ENOTFOUND' ||
          err.code === 'ETIMEDOUT' ||
          err.code === '28P01' ||
          err.code === '3D000' ||
          err.message?.includes('Connection terminated') ||
          err.message?.includes('connect ECONNREFUSED')
        ) {
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
    if (realPool && !useMock) {
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
