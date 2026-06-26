const db = require('../config/middleware/database');
const { sendEmail } = require('../config/utils/mailer');
const {
  ensureAgentSystemSchema,
  getActiveAgentAssignmentByLandlordId,
  getPendingAgentInviteByLandlordId,
  inviteAgentForLandlord,
} = require('../config/utils/agentSystem');
const {
  sendAgentInviteEmail,
  sendAgentAssignmentNoticeEmail,
} = require('../config/utils/emailService');
const { notifyAlertsForProperty } = require('../config/utils/propertyAlertService');
const bcrypt = require('bcryptjs');

let verificationAuditSchemaReady = false;
let lawyerScopeSchemaReady = false;
let adminRoleSchemaReady = false;
let propertyOperationSchemaReady = false;
let applicationOperationSchemaReady = false;
let userAccountOperationSchemaReady = false;
const VERIFICATION_TARGET_USER_TYPES = "('tenant', 'landlord', 'agent', 'lawyer')";
const USER_VERIFICATION_STATUS_EXPR = `
  COALESCE(
    identity_verification_status,
    CASE
      WHEN identity_verified = TRUE THEN 'verified'
      WHEN passport_photo_url IS NOT NULL
        AND (nin IS NOT NULL OR international_passport_number IS NOT NULL)
      THEN 'pending'
      ELSE 'not_submitted'
    END
  )
`;

const ensureVerificationAuditSchema = async () => {
  if (verificationAuditSchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS identity_verified_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS identity_verification_status VARCHAR(20);

    CREATE INDEX IF NOT EXISTS idx_users_identity_verified_by
      ON users(identity_verified_by);

    CREATE INDEX IF NOT EXISTS idx_users_identity_verification_status
      ON users(identity_verification_status);
  `);

  verificationAuditSchemaReady = true;
};

const ensureLawyerScopeSchema = async () => {
  if (lawyerScopeSchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS lawyer_client_scope VARCHAR(20);

    CREATE INDEX IF NOT EXISTS idx_users_lawyer_client_scope
      ON users(lawyer_client_scope);
  `);

  lawyerScopeSchemaReady = true;
};

const ensureAdminRoleSchema = async () => {
  if (adminRoleSchemaReady) return;

  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS nin VARCHAR(11),
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS assigned_state VARCHAR(100),
      ADD COLUMN IF NOT EXISTS assigned_city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS lawyer_client_scope VARCHAR(20),
      ADD COLUMN IF NOT EXISTS is_recruitment_admin BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS account_suspended_reason TEXT,
      ADD COLUMN IF NOT EXISTS account_suspended_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS account_suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    DO $$
    DECLARE
      existing_check_name TEXT;
      current_len INTEGER;
      col_has_views INTEGER;
    BEGIN
      SELECT COALESCE(character_maximum_length, 0)
      INTO current_len
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name = 'user_type';

      IF current_len < 50 THEN
        SELECT COUNT(*)
        INTO col_has_views
        FROM pg_depend d
        JOIN pg_rewrite r ON r.oid = d.objid
        JOIN pg_class v ON v.oid = r.ev_class
        JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
        WHERE d.refclassid = 'pg_class'::regclass
          AND d.classid = 'pg_rewrite'::regclass
          AND d.refobjsubid > 0
          AND a.attrelid = 'users'::regclass
          AND v.relkind = 'v'
          AND a.attname = 'user_type';

        IF col_has_views > 0 THEN
          DROP VIEW IF EXISTS financial_admin_dashboard CASCADE;
          DROP VIEW IF EXISTS lga_admin_hierarchy CASCADE;
          DROP VIEW IF EXISTS state_admin_earnings CASCADE;
          DROP VIEW IF EXISTS state_admin_transportation_view CASCADE;
          DROP VIEW IF EXISTS super_admin_transportation_oversight_view CASCADE;
          DROP VIEW IF EXISTS transportation_system_health_view CASCADE;
        END IF;

        ALTER TABLE users ALTER COLUMN user_type TYPE VARCHAR(50);
      END IF;

      SELECT c.conname
      INTO existing_check_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'users'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%user_type%';

      IF existing_check_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', existing_check_name);
      END IF;
    END $$;

    ALTER TABLE users
      ADD CONSTRAINT users_user_type_check
      CHECK (
        user_type IN (
          'tenant',
          'landlord',
          'lawyer',
          'state_lawyer',
          'super_lawyer',
          'admin',
          'lga_admin',
          'lga_support_admin',
          'state_admin',
          'lga_financial_admin',
          'lga_transportation_admin',
          'state_transportation_admin',
          'super_transportation_admin',
          'lga_fumigation_admin',
          'state_fumigation_admin',
          'super_fumigation_admin',
          'state_financial_admin',
          'state_support_admin',
          'super_admin',
          'financial_admin',
          'super_financial_admin',
          'super_support_admin',
          'recruitment_admin',
          'agent',
          'fumigation_admin',
          'transportation_admin'
        )
      );
  `);

  adminRoleSchemaReady = true;
};

const ensurePropertyOperationSchema = async () => {
  if (propertyOperationSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS property_operations (
      id SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_property_operations_property
      ON property_operations(property_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_property_operations_created
      ON property_operations(created_at DESC);
  `);

  propertyOperationSchemaReady = true;
};

const getOperationActorName = (user = {}) =>
  user.full_name || user.name || user.email || user.username || `Admin #${user.id || 'unknown'}`;

const requireOperationNote = (body, message) => {
  const note = String(body?.reason || body?.note || body?.governance_note || '').trim();
  if (!note) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return note;
};

const recordPropertyOperation = async ({
  propertyId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO property_operations (
       property_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      propertyId,
      actor?.id || null,
      getOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const ensureApplicationOperationSchema = async () => {
  if (applicationOperationSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS rental_application_operations (
      id SERIAL PRIMARY KEY,
      application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      previous_status VARCHAR(40),
      new_status VARCHAR(40),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_rental_application_ops_application
      ON rental_application_operations(application_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_rental_application_ops_created
      ON rental_application_operations(created_at DESC);
  `);

  applicationOperationSchemaReady = true;
};

const recordApplicationOperation = async ({
  applicationId,
  actor,
  eventType,
  note,
  previousStatus,
  newStatus,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO rental_application_operations (
       application_id, actor_id, actor_name, event_type, note,
       previous_status, new_status, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      applicationId,
      actor?.id || null,
      getOperationActorName(actor),
      eventType,
      note || null,
      previousStatus || null,
      newStatus || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const ensureUserAccountOperationSchema = async () => {
  if (userAccountOperationSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_account_operations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_user_account_operations_user
      ON user_account_operations(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_user_account_operations_created
      ON user_account_operations(created_at DESC);
  `);

  userAccountOperationSchemaReady = true;
};

const recordUserAccountOperation = async ({
  userId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO user_account_operations (
       user_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      userId,
      actor?.id || null,
      getOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const buildDeletedEmail = (userId) => `deleted+u${userId}.${Date.now()}@deleted.local`;

const buildDeletedUniqueValue = (prefix, userId) => `${prefix}${userId}${Date.now().toString().slice(-8)}`;

const releaseDeletedUserIdentityConflicts = async ({ email, phone, nin }) => {
  const filters = [];
  const params = [];

  if (String(email || '').trim()) {
    params.push(String(email).trim().toLowerCase());
    filters.push(`LOWER(email) = $${params.length}`);
  }

  if (String(phone || '').trim()) {
    params.push(String(phone).trim());
    filters.push(`phone = $${params.length}`);
  }

  if (String(nin || '').trim()) {
    params.push(String(nin).trim());
    filters.push(`nin = $${params.length}`);
  }

  if (!filters.length) return;

  const result = await db.query(
    `SELECT id, email, phone, nin
     FROM users
     WHERE deleted_at IS NOT NULL
       AND (${filters.join(' OR ')})`,
    params
  );

  for (const row of result.rows) {
    const nextEmail = row.email && String(email || '').trim() && String(row.email).trim().toLowerCase() === String(email).trim().toLowerCase()
      ? buildDeletedEmail(row.id)
      : row.email;
    const nextPhone = row.phone && String(phone || '').trim() && String(row.phone).trim() === String(phone).trim()
      ? buildDeletedUniqueValue('DELP', row.id)
      : row.phone;
    const nextNin = row.nin && String(nin || '').trim() && String(row.nin).trim() === String(nin).trim()
      ? buildDeletedUniqueValue('DELN', row.id)
      : row.nin;

    await db.query(
      `UPDATE users
       SET email = $2,
           phone = $3,
           nin = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, nextEmail, nextPhone, nextNin]
    );
  }
};

const STATE_ADMIN_ROLES = new Set(['state_admin', 'state_financial_admin']);
const LGA_ADMIN_ROLES = new Set(['admin', 'lga_admin']);
const isLgaAdminRole = (role) => LGA_ADMIN_ROLES.has(String(role || '').trim().toLowerCase());

const getRequesterStateScope = async (user) => {
  const requesterRole = user?.user_type || user?.userType;
  if (!STATE_ADMIN_ROLES.has(requesterRole)) {
    return null;
  }

  const result = await db.query(
    `SELECT assigned_state
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [user.id]
  );

  const assignedState = String(result.rows?.[0]?.assigned_state || '').trim();
  return assignedState || null;
};

// Returns { assignedState, assignedCity } for all scoped roles.
// - admin / lga_admin roles: scoped by both assigned_state (state) AND assigned_city (LGA)
// - state_admin / state_financial_admin: scoped by assigned_state only
// - all other roles: no scope restriction (both null)
const getRequesterScope = async (user) => {
  const role = user?.user_type || user?.userType;

  if (isLgaAdminRole(role)) {
    const result = await db.query(
      `SELECT assigned_state, assigned_city
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [user.id]
    );
    const row = result.rows[0] || {};
    return {
      assignedState: String(row.assigned_state || '').trim() || null,
      assignedCity: String(row.assigned_city || '').trim() || null,
    };
  }

  // Reuse existing function for state-scoped roles
  const assignedState = await getRequesterStateScope(user);
  return { assignedState, assignedCity: null };
};

// GET /api/admin/stats
exports.getStats = async (req, res) => {
  try {
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    let totalUsers;
    let totalProperties;
    let applications;
    let pendingVerifications;

    if (assignedState) {
      const scopeParams = [assignedState];
      if (assignedCity) scopeParams.push(assignedCity);

      // State filter: $1; LGA filter (admin only): $2
      const stateSql = `LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($1))`;
      const lgaSql = assignedCity
        ? ` AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($2))`
        : '';
      const propLgaSql = assignedCity
        ? ` AND LOWER(TRIM(COALESCE(lga_name, ''))) = LOWER(TRIM($2))`
        : '';
      const joinedLgaSql = assignedCity
        ? ` AND LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($2))`
        : '';

      totalUsers = await db.query(
        `SELECT COUNT(*)
         FROM users u
         WHERE u.deleted_at IS NULL
           AND u.user_type IN ${VERIFICATION_TARGET_USER_TYPES}
           AND (
             EXISTS (
               SELECT 1
               FROM properties sp
               JOIN states sp_st ON sp_st.id = sp.state_id
               WHERE (sp.user_id = u.id OR sp.landlord_id = u.id)
                 AND ${stateSql}${lgaSql}
             )
             OR EXISTS (
               SELECT 1
               FROM applications sa
               JOIN properties sp ON sp.id = sa.property_id
               JOIN states sp_st ON sp_st.id = sp.state_id
               WHERE sa.tenant_id = u.id
                 AND ${stateSql}${lgaSql}
             )
           )`,
        scopeParams
      );

      totalProperties = await db.query(
        `SELECT COUNT(*)
         FROM properties p
         JOIN states s ON s.id = p.state_id
         WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))${propLgaSql}`,
        scopeParams
      );

      applications = await db.query(
        `SELECT COUNT(*)
         FROM applications a
         JOIN properties p ON p.id = a.property_id
         JOIN states s ON s.id = p.state_id
         WHERE LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))${joinedLgaSql}`,
        scopeParams
      );

      pendingVerifications = await db.query(
        `SELECT COUNT(*)
         FROM users u
         WHERE u.deleted_at IS NULL
           AND u.user_type IN ${VERIFICATION_TARGET_USER_TYPES}
           AND ${USER_VERIFICATION_STATUS_EXPR} = 'pending'
           AND (
             EXISTS (
               SELECT 1
               FROM properties sp
               JOIN states sp_st ON sp_st.id = sp.state_id
               WHERE (sp.user_id = u.id OR sp.landlord_id = u.id)
                 AND ${stateSql}${lgaSql}
             )
             OR EXISTS (
               SELECT 1
               FROM applications sa
               JOIN properties sp ON sp.id = sa.property_id
               JOIN states sp_st ON sp_st.id = sp.state_id
               WHERE sa.tenant_id = u.id
                 AND ${stateSql}${lgaSql}
             )
           )`,
        scopeParams
      );
    } else {
      totalUsers = await db.query(
        `SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`
      );
      totalProperties = await db.query(
        `SELECT COUNT(*) FROM properties`
      );
      applications = await db.query(
        `SELECT COUNT(*) FROM applications`
      );
      pendingVerifications = await db.query(
        `SELECT COUNT(*) FROM users
         WHERE deleted_at IS NULL
           AND identity_verified = FALSE
           AND user_type IN ${VERIFICATION_TARGET_USER_TYPES}`
      );
    }

    res.json({
      success: true,
      data: {
        totalUsers: Number(totalUsers.rows[0].count),
        totalProperties: Number(totalProperties.rows[0].count),
        applications: Number(applications.rows[0].count),
        pendingVerifications: Number(pendingVerifications.rows[0].count),
        scope: {
          assignedState: assignedState || null,
          assignedCity: assignedCity || null,
        },
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load admin stats'
    });
  }
};

// GET /api/admin/users
// GET /api/admin/users?search=&role=&page=&limit=
exports.getAllUsers = async (req, res) => {
  try {
    const {
      search = '',
      state = '',
      role = 'all',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const where = [];
    const params = [];
    let i = 1;

    // Base condition
    where.push(`u.deleted_at IS NULL`);
    where.push(`u.user_type IN ('tenant', 'landlord')`);

    // Role filter
    if (role && role !== 'all') {
      where.push(`u.user_type = $${i++}`);
      params.push(role);
    }

    // Search filter (name, email, phone)
    if (search) {
      where.push(`(
        u.full_name ILIKE $${i} OR
        u.email ILIKE $${i} OR
        u.phone ILIKE $${i} OR
        ls.state ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    // State filter (landlord's latest property state)
    if (state) {
      where.push(`ls.state ILIKE $${i++}`);
      params.push(`%${state}%`);
    }

    if (assignedState) {
      where.push(`(
        LOWER(TRIM(ls.state)) = LOWER(TRIM($${i}))
        OR EXISTS (
          SELECT 1
          FROM applications sa
          JOIN properties sp ON sp.id = sa.property_id
          JOIN states sp_st ON sp_st.id = sp.state_id
          WHERE sa.tenant_id = u.id
            AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${i}))
        )
      )`);
      params.push(assignedState);
      i++;
    }

    if (assignedCity) {
      where.push(`(
        LOWER(TRIM(COALESCE(ls.lga_name, ''))) = LOWER(TRIM($${i}))
        OR EXISTS (
          SELECT 1
          FROM applications sa
          JOIN properties sp ON sp.id = sa.property_id
          WHERE sa.tenant_id = u.id
            AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${i}))
        )
      )`);
      params.push(assignedCity);
      i++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const fromClause = `
        FROM users u
        LEFT JOIN LATERAL (
          SELECT s.state_name AS state, p.lga_name
          FROM properties p
          LEFT JOIN states s ON s.id = p.state_id
          WHERE p.landlord_id = u.id
          ORDER BY p.created_at DESC
          LIMIT 1
        ) ls ON TRUE
      `;

    // Total count
    const countQuery = `
      SELECT COUNT(*) 
      ${fromClause}
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    // Data query
    const dataQuery = `
      SELECT u.id, u.full_name, u.email, u.phone, u.user_type,
             u.email_verified, u.phone_verified, u.identity_verified,
             u.created_at, ls.state
      ${fromClause}
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const dataParams = [...params, pageSize, offset];
    const result = await db.query(dataQuery, dataParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load users',
    });
  }
};


// GET /api/admin/verifications/pending
exports.getPendingVerifications = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const {
      search = '',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const where = [
      `deleted_at IS NULL`,
      `email_verified = TRUE`,
      `phone_verified = TRUE`,
      `${USER_VERIFICATION_STATUS_EXPR} = 'pending'`,
      `user_type IN ${VERIFICATION_TARGET_USER_TYPES}`,
    ];

    const params = [];
    let i = 1;

    if (search) {
      where.push(`(
        full_name ILIKE $${i} OR
        email ILIKE $${i} OR
        nin ILIKE $${i} OR
        international_passport_number ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    if (assignedState) {
      where.push(`(
        EXISTS (
          SELECT 1
          FROM properties sp
          JOIN states sp_st ON sp_st.id = sp.state_id
          WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
            AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${i}))
        )
        OR EXISTS (
          SELECT 1
          FROM applications sa
          JOIN properties sp ON sp.id = sa.property_id
          JOIN states sp_st ON sp_st.id = sp.state_id
          WHERE sa.tenant_id = users.id
            AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${i}))
        )
      )`);
      params.push(assignedState);
      i++;
    }

    if (assignedCity) {
      where.push(`(
        EXISTS (
          SELECT 1
          FROM properties sp
          WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
            AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${i}))
        )
        OR EXISTS (
          SELECT 1
          FROM applications sa
          JOIN properties sp ON sp.id = sa.property_id
          WHERE sa.tenant_id = users.id
            AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${i}))
        )
      )`);
      params.push(assignedCity);
      i++;
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*)
      FROM users
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    const dataQuery = `
      SELECT id, full_name, email, nin, identity_document_type,
             international_passport_number, nationality,
             passport_photo_url, user_type, created_at
      FROM users
      ${whereClause}
      ORDER BY created_at ASC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const result = await db.query(dataQuery, [...params, pageSize, offset]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Pending verifications error:', err);
    res.status(500).json({ success: false, message: 'Failed to load verifications' });
  }
};


// POST /api/admin/verifications/:id/approve
exports.approveVerification = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const userId = req.params.id;
    const adminId = req.user.id;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [userId, adminId];
    let stateScopeClause = '';

    if (assignedState) {
      const stateIdx = queryParams.length + 1;
      queryParams.push(assignedState);
      stateScopeClause += `
         AND (
           EXISTS (
             SELECT 1
             FROM properties sp
             JOIN states sp_st ON sp_st.id = sp.state_id
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${stateIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             JOIN states sp_st ON sp_st.id = sp.state_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${stateIdx}))
           )
         )`;
    }

    if (assignedCity) {
      const cityIdx = queryParams.length + 1;
      queryParams.push(assignedCity);
      stateScopeClause += `
         AND (
           EXISTS (
             SELECT 1
             FROM properties sp
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${cityIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${cityIdx}))
           )
         )`;
    }

    const result = await db.query(
      `UPDATE users
       SET identity_verified = TRUE,
           identity_verification_status = 'verified',
           identity_verified_by = $2,
           identity_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type IN ${VERIFICATION_TARGET_USER_TYPES}
         AND passport_photo_url IS NOT NULL
         AND (nin IS NOT NULL OR international_passport_number IS NOT NULL)
         ${stateScopeClause}
       RETURNING id`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not eligible for admin verification',
      });
    }

    res.json({ success: true, message: 'User verified successfully' });
  } catch (err) {
    console.error('Approve verification error:', err);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
};

// POST /api/admin/verifications/:id/reject
exports.rejectVerification = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const userId = req.params.id;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [userId];
    let stateScopeClause = '';

    if (assignedState) {
      const stateIdx = queryParams.length + 1;
      queryParams.push(assignedState);
      stateScopeClause += `
         AND (
           EXISTS (
             SELECT 1
             FROM properties sp
             JOIN states sp_st ON sp_st.id = sp.state_id
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${stateIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             JOIN states sp_st ON sp_st.id = sp.state_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${stateIdx}))
           )
         )`;
    }

    if (assignedCity) {
      const cityIdx = queryParams.length + 1;
      queryParams.push(assignedCity);
      stateScopeClause += `
         AND (
           EXISTS (
             SELECT 1
             FROM properties sp
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${cityIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${cityIdx}))
           )
         )`;
    }

    const result = await db.query(
      `UPDATE users
       SET identity_verified = FALSE,
           identity_verification_status = 'rejected',
           identity_verified_by = NULL,
           identity_verified_at = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type IN ${VERIFICATION_TARGET_USER_TYPES}
         ${stateScopeClause}
       RETURNING id`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not eligible for admin rejection',
      });
    }

    res.json({ success: true, message: 'Verification rejected' });
  } catch (err) {
    console.error('Reject verification error:', err);
    res.status(500).json({ success: false, message: 'Rejection failed' });
  }
};

// GET /api/admin/properties
exports.getAllProperties = async (req, res) => {
  try {
    const {
      search = '',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const where = [];
    const params = [];
    let i = 1;

    if (search) {
      where.push(`(
        p.title ILIKE $${i} OR
        u.full_name ILIKE $${i} OR
        p.city ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    if (assignedState) {
      where.push(`LOWER(TRIM(s.state_name)) = LOWER(TRIM($${i++}))`);
      params.push(assignedState);
    }

    if (assignedCity) {
      where.push(`LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${i++}))`);
      params.push(assignedCity);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN states s ON s.id = p.state_id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    const dataQuery = `
      SELECT 
        p.id,
        p.title,
        p.rent_amount,
        p.status,
        p.is_available,
        p.featured,
        p.created_at,
        p.city,
        s.state_name AS state,
        u.full_name AS landlord_name
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN states s ON s.id = p.state_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const result = await db.query(dataQuery, [...params, pageSize, offset]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Admin properties error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load properties',
    });
  }
};

// GET /api/admin/properties/pending
exports.getPendingProperties = async (req, res) => {
  try {
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const params = [];
    let i = 1;
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($${i++}))`);
      params.push(assignedState);
    }

    if (assignedCity) {
      extraClauses.push(`AND LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${i++}))`);
      params.push(assignedCity);
    }

    const stateClause = extraClauses.join(' ');

    const result = await db.query(
      `SELECT 
         p.*, 
         u.full_name AS landlord_name,
         u.email AS landlord_email
       FROM properties p
       LEFT JOIN users u ON p.landlord_id = u.id
       WHERE p.is_verified = FALSE
         AND p.deleted_at IS NULL
         ${stateClause}
       ORDER BY p.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error('Pending properties error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load pending properties',
    });
  }
};

// PATCH /api/admin/properties/:id/approve
exports.approveProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [id, adminId];
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND state_id IN (
        SELECT id FROM states WHERE LOWER(TRIM(state_name)) = LOWER(TRIM($${queryParams.length + 1}))
      )`);
      queryParams.push(assignedState);
    }

    if (assignedCity) {
      extraClauses.push(`AND LOWER(TRIM(COALESCE(lga_name, ''))) = LOWER(TRIM($${queryParams.length + 1}))`);
      queryParams.push(assignedCity);
    }

    const stateClause = extraClauses.join(' ');

          const result = await db.query(
        `
        UPDATE properties
        SET is_verified = TRUE,
            status = 'available',
            verified_by = $2,
            verified_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
          ${stateClause}
        RETURNING id, title, landlord_id, property_type, state_id, city, area, rent_amount, bedrooms, bathrooms
        `,
        queryParams
      );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const property = result.rows[0];

    // 🔔 Notify landlord by email
    const landlordResult = await db.query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [property.landlord_id]
    );

    if (landlordResult.rows.length) {
      const landlord = landlordResult.rows[0];

      try {
        await sendEmail({
        to: landlord.email,
        subject: 'Your property has been approved 🎉',
        html: `
          <p>Hello ${landlord.full_name},</p>
          <p>Your property <strong>${property.title}</strong> has been approved and is now live.</p>
          <p>You can manage it from your dashboard.</p>
        `,
        });
      } catch (mailError) {
        console.error('Failed to send approval email:', mailError.message);
      }
    }

    notifyAlertsForProperty(property).catch((err) => {
      console.error('Tenant alert notification failed:', err);
    });

    res.json({
      success: true,
      message: 'Property approved successfully',
      data: property,
    });
  } catch (err) {
    console.error('Approve property error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to approve property',
    });
  }
};


// PATCH /api/admin/properties/:id/reject
exports.rejectProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [id, assignedState ? 'Rejected by state admin review' : 'Rejected by admin review'];
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND state_id IN (
        SELECT id FROM states WHERE LOWER(TRIM(state_name)) = LOWER(TRIM($${queryParams.length + 1}))
      )`);
      queryParams.push(assignedState);
    }

    if (assignedCity) {
      extraClauses.push(`AND LOWER(TRIM(COALESCE(lga_name, ''))) = LOWER(TRIM($${queryParams.length + 1}))`);
      queryParams.push(assignedCity);
    }

    const stateClause = extraClauses.join(' ');

        const result = await db.query(
      `
      UPDATE properties
      SET status = 'rejected',
    is_verified = FALSE,
    rejection_reason = $2
      WHERE id = $1
        AND deleted_at IS NULL
        ${stateClause}
      RETURNING id, title, landlord_id
      `,
      queryParams
    );


    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const property = result.rows[0];

const landlord = await db.query(
  'SELECT email, full_name FROM users WHERE id = $1',
  [property.landlord_id]
);

    if (landlord.rows.length) {
      await sendEmail({
        to: landlord.rows[0].email,
        subject: 'Your property needs changes',
        html: `
          <p>Hello ${landlord.rows[0].full_name},</p>
          <p>Your property <b>${property.title}</b> was not approved.</p>
          <p>Please review it and resubmit.</p>
        `,
      });
    }


    res.json({
      success: true,
      message: 'Property rejected successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Reject property error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reject property',
    });
  }
};


// GET /api/admin/applications
exports.getAllApplications = async (req, res) => {
  try {
    const {
      search = '',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const where = [];
    const params = [];
    let i = 1;

    if (search) {
      where.push(`(
        t.full_name ILIKE $${i} OR
        p.title ILIKE $${i} OR
        l.full_name ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    if (assignedState) {
      where.push(`LOWER(TRIM(s.state_name)) = LOWER(TRIM($${i++}))`);
      params.push(assignedState);
    }

    if (assignedCity) {
      where.push(`LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${i++}))`);
      params.push(assignedCity);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)
      FROM applications a
      JOIN users t ON a.tenant_id = t.id
      JOIN properties p ON a.property_id = p.id
      LEFT JOIN users l ON p.user_id = l.id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    const dataQuery = `
      SELECT 
        a.id,
        a.status,
        a.created_at,
        t.full_name AS tenant_name,
        p.title AS property_title,
        l.full_name AS landlord_name
      FROM applications a
      JOIN users t ON a.tenant_id = t.id
      JOIN properties p ON a.property_id = p.id
      LEFT JOIN users l ON p.user_id = l.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const result = await db.query(dataQuery, [...params, pageSize, offset]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Admin applications error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load applications',
    });
  }
};

// DELETE (soft) /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    await ensureAdminRoleSchema();
    await ensureUserAccountOperationSchema();

    const { id } = req.params;
    const reason = requireOperationNote(req.body, 'A disable reason is required');

    // Prevent deleting yourself
    const currentUserId = req.user.userId || req.user.id;
    if (Number(id) === Number(currentUserId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }

    const targetResult = await db.query(
      `SELECT id, full_name, email, user_type
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (!targetResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const targetUser = targetResult.rows[0];
    const targetType = targetUser.user_type;
    if (!['tenant', 'landlord'].includes(targetType)) {
      return res.status(403).json({
        success: false,
        message: 'Admin can only manage tenant and landlord accounts',
      });
    }

    await db.query(
      `UPDATE users
       SET deleted_at = NOW(),
           is_active = FALSE,
           account_suspended_reason = $2,
           account_suspended_at = NOW(),
           account_suspended_by = $3,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, reason, currentUserId]
    );

    await recordUserAccountOperation({
      userId: targetUser.id,
      actor: req.user,
      eventType: 'user_disabled',
      note: reason,
      metadata: {
        target_name: targetUser.full_name,
        target_email: targetUser.email,
        target_type: targetUser.user_type,
      },
    });

    res.json({
      success: true,
      message: 'User disabled successfully',
    });
  } catch (err) {
    console.error('Soft delete user error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : 'Failed to disable user',
    });
  }
};

// PATCH /api/admin/users/:id/verify
exports.verifyUser = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();
    await ensureUserAccountOperationSchema();

    const { id } = req.params;
    const adminId = req.user.id;
    const note = requireOperationNote(req.body, 'A verification note is required');

    const result = await db.query(
      `UPDATE users
       SET identity_verified = TRUE,
           identity_verification_status = 'verified',
           identity_verified_by = $2,
           identity_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type IN ${VERIFICATION_TARGET_USER_TYPES}
         AND passport_photo_url IS NOT NULL
         AND (nin IS NOT NULL OR international_passport_number IS NOT NULL)
       RETURNING id, full_name, email, user_type`,
      [id, adminId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not eligible for manual verification',
      });
    }

    const verifiedUser = result.rows[0];
    await recordUserAccountOperation({
      userId: verifiedUser.id,
      actor: req.user,
      eventType: 'user_identity_verified',
      note,
      metadata: {
        target_name: verifiedUser.full_name,
        target_email: verifiedUser.email,
        target_type: verifiedUser.user_type,
      },
    });

    res.json({
      success: true,
      message: 'User verified successfully',
    });
  } catch (err) {
    console.error('Manual verify user error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : 'Failed to verify user',
    });
  }
};


// GET /api/admin/users/:id
exports.getUserById = async (req, res) => {
  try {
    await ensureUserAccountOperationSchema();

    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({ success: false, message: 'State admin account is missing assigned_state' });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({ success: false, message: 'Admin account is missing assigned state or local government' });
    }

    const queryParams = [id];
    let stateClause = '';

    if (assignedState) {
      const stateIdx = queryParams.length + 1;
      queryParams.push(assignedState);
      stateClause += `
         AND (
           EXISTS (
             SELECT 1
             FROM properties sp
             JOIN states sp_st ON sp_st.id = sp.state_id
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${stateIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             JOIN states sp_st ON sp_st.id = sp.state_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(sp_st.state_name)) = LOWER(TRIM($${stateIdx}))
           )
         )`;
    }

    if (assignedCity) {
      const cityIdx = queryParams.length + 1;
      queryParams.push(assignedCity);
      stateClause += `
         AND (
           EXISTS (
             SELECT 1
             FROM properties sp
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${cityIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(COALESCE(sp.lga_name, ''))) = LOWER(TRIM($${cityIdx}))
           )
         )`;
    }

    const result = await db.query(
      `SELECT id, full_name, email, phone, user_type,
              email_verified, phone_verified, identity_verified,
              created_at,
              COALESCE(account_ops.operations, '[]'::json) AS account_operations
       FROM users
       LEFT JOIN LATERAL (
         SELECT json_agg(account_operation_row ORDER BY account_operation_row.created_at DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM user_account_operations
           WHERE user_id = users.id
           ORDER BY created_at DESC
           LIMIT 8
         ) account_operation_row
       ) account_ops ON TRUE
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type IN ('tenant', 'landlord')
         ${stateClause}`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (user.user_type === 'landlord') {
      await ensureAgentSystemSchema();
      const [activeAssignment, pendingInvite] = await Promise.all([
        getActiveAgentAssignmentByLandlordId(user.id),
        getPendingAgentInviteByLandlordId(user.id),
      ]);

      user.active_agent_assignment = activeAssignment
        ? {
            id: activeAssignment.id,
            agent_user_id: activeAssignment.agent_user_id,
            agent_name: activeAssignment.agent_name,
            agent_email: activeAssignment.agent_email,
            agent_phone: activeAssignment.agent_phone,
            status: activeAssignment.status,
            assigned_at: activeAssignment.created_at,
          }
        : null;

      user.pending_agent_invite = pendingInvite
        ? {
            id: pendingInvite.id,
            agent_full_name: pendingInvite.agent_full_name,
            agent_email: pendingInvite.agent_email,
            agent_phone: pendingInvite.agent_phone,
            status: pendingInvite.status,
            expires_at: pendingInvite.expires_at,
          }
        : null;
    }


    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load user' });
  }
};

// POST /api/admin/users/:id/assign-agent
exports.assignAgentToLandlord = async (req, res) => {
  try {
    await ensureAgentSystemSchema();

    const { id } = req.params;
    const agentFullName = String(req.body.agent_full_name || '').trim();
    const agentEmail = String(req.body.agent_email || '').trim().toLowerCase();
    const agentPhone = String(req.body.agent_phone || '').replace(/\s+/g, '');

    if (!agentFullName || !agentEmail || !agentPhone) {
      return res.status(400).json({
        success: false,
        message: 'Agent full name, email, and phone are required',
      });
    }

    const landlordResult = await db.query(
      `SELECT id, full_name, email, phone, user_type
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    );

    if (!landlordResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Landlord not found',
      });
    }

    const landlord = landlordResult.rows[0];

    if (landlord.user_type !== 'landlord') {
      return res.status(400).json({
        success: false,
        message: 'Agents can only be assigned to landlord accounts',
      });
    }

    if (agentEmail === String(landlord.email || '').trim().toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: 'Agent email must be different from landlord email',
      });
    }

    if (agentPhone === String(landlord.phone || '').replace(/\s+/g, '')) {
      return res.status(400).json({
        success: false,
        message: 'Agent phone must be different from landlord phone',
      });
    }

    const inviteResult = await inviteAgentForLandlord({
      landlordUserId: landlord.id,
      assignedByUserId: req.user.id,
      landlordName: landlord.full_name,
      agentFullName,
      agentEmail,
      agentPhone,
      sendAgentInviteEmail,
      sendAgentAssignmentNoticeEmail,
    });

    res.json({
      success: true,
      message:
        inviteResult.mode === 'existing_agent_assigned'
          ? 'Existing agent assigned successfully'
          : 'Agent invite sent successfully',
      data: inviteResult,
    });
  } catch (err) {
    console.error('Assign agent to landlord error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to assign agent to landlord',
    });
  }
};

// GET /api/admin/properties/:id
exports.getPropertyById = async (req, res) => {
  try {
    await ensurePropertyOperationSchema();
    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({ success: false, message: 'State admin account is missing assigned_state' });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({ success: false, message: 'Admin account is missing assigned state or local government' });
    }

    const queryParams = [id];
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($${queryParams.length + 1}))`);
      queryParams.push(assignedState);
    }

    if (assignedCity) {
      extraClauses.push(`AND LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${queryParams.length + 1}))`);
      queryParams.push(assignedCity);
    }

    const stateClause = extraClauses.join(' ');

    const result = await db.query(
      `SELECT p.*, u.full_name AS landlord_name, u.email AS landlord_email,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM properties p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN states s ON s.id = p.state_id
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM property_operations
           WHERE property_id = p.id
           ORDER BY created_at DESC, id DESC
           LIMIT 5
         ) operation_rows
       ) ops ON TRUE
       WHERE p.id = $1
         ${stateClause}`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load property' });
  }
};

// GET /api/admin/applications/:id
exports.getApplicationById = async (req, res) => {
  try {
    await ensureApplicationOperationSchema();
    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [id];
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($${queryParams.length + 1}))`);
      queryParams.push(assignedState);
    }

    if (assignedCity) {
      extraClauses.push(`AND LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${queryParams.length + 1}))`);
      queryParams.push(assignedCity);
    }

    const stateClause = extraClauses.join(' ');

    const result = await db.query(
      `SELECT 
         a.id, a.status, a.created_at,
         t.full_name AS tenant_name, t.email AS tenant_email,
         p.title AS property_title,
         l.full_name AS landlord_name,
         COALESCE(ops.operations, '[]'::json) AS operations
       FROM applications a
       JOIN users t ON a.tenant_id = t.id
       JOIN properties p ON a.property_id = p.id
       LEFT JOIN states s ON s.id = p.state_id
       LEFT JOIN users l ON p.user_id = l.id
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, previous_status, new_status, metadata, created_at
           FROM rental_application_operations
           WHERE application_id = a.id
           ORDER BY created_at DESC, id DESC
           LIMIT 5
         ) operation_rows
       ) ops ON TRUE
       WHERE a.id = $1
         ${stateClause}`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load application' });
  }
};

// POST /api/admin/applications/:id/approve
exports.approveApplication = async (req, res) => {
  try {
    await ensureApplicationOperationSchema();
    const { id } = req.params;
    const note = requireOperationNote(req.body, 'An approval note is required');
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [id];
    let stateCheck = '';

    if (assignedState) {
      const stateIdx = queryParams.length + 1;
      queryParams.push(assignedState);
      stateCheck += `AND EXISTS (
           SELECT 1
           FROM properties p
           WHERE p.id = applications.property_id
             AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($${stateIdx}))
         )`;
    }

    if (assignedCity) {
      const cityIdx = queryParams.length + 1;
      queryParams.push(assignedCity);
      stateCheck += ` AND EXISTS (
           SELECT 1
           FROM properties p
           WHERE p.id = applications.property_id
             AND LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${cityIdx}))
         )`;
    }

    const result = await db.query(
      `UPDATE applications
       SET status = 'approved', updated_at = NOW()
       WHERE id = $1
         ${stateCheck}
       RETURNING id, status, property_id`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    await recordApplicationOperation({
      applicationId: Number(id),
      actor: req.user,
      eventType: 'application_approved',
      note,
      previousStatus: 'pending',
      newStatus: result.rows[0].status,
      metadata: {
        property_id: result.rows[0].property_id,
      },
    });

    res.json({
      success: true,
      message: 'Application approved',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Approve application error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to approve application',
    });
  }
};

// POST /api/admin/applications/:id/reject
exports.rejectApplication = async (req, res) => {
  try {
    await ensureApplicationOperationSchema();
    const { id } = req.params;
    const note = requireOperationNote(req.body, 'A rejection reason is required');
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [id];
    let stateCheck = '';

    if (assignedState) {
      const stateIdx = queryParams.length + 1;
      queryParams.push(assignedState);
      stateCheck += `AND EXISTS (
           SELECT 1
           FROM properties p
           WHERE p.id = applications.property_id
             AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($${stateIdx}))
         )`;
    }

    if (assignedCity) {
      const cityIdx = queryParams.length + 1;
      queryParams.push(assignedCity);
      stateCheck += ` AND EXISTS (
           SELECT 1
           FROM properties p
           WHERE p.id = applications.property_id
             AND LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${cityIdx}))
         )`;
    }

    const result = await db.query(
      `UPDATE applications
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1
         ${stateCheck}
       RETURNING id, status, property_id`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    await recordApplicationOperation({
      applicationId: Number(id),
      actor: req.user,
      eventType: 'application_rejected',
      note,
      previousStatus: 'pending',
      newStatus: result.rows[0].status,
      metadata: {
        property_id: result.rows[0].property_id,
      },
    });

    res.json({
      success: true,
      message: 'Application rejected',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Reject application error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to reject application',
    });
  }
};


exports.verifyLedgerIntegrity = async (req, res) => {
  try {
    const logs = await db.query(
      `SELECT * FROM audit_logs ORDER BY id ASC`
    );

    let previousHash = 'GENESIS';

    for (const log of logs.rows) {
      const dataString =
        log.actor_id +
        log.action +
        log.target_type +
        log.target_id +
        log.created_at.toISOString() +
        previousHash;

      const recalculated = require('crypto')
        .createHash('sha256')
        .update(dataString)
        .digest('hex');

      if (recalculated !== log.current_hash) {
        return res.json({
          success: false,
          compromisedAt: log.id
        });
      }

      previousHash = log.current_hash;
    }

    res.json({
      success: true,
      message: 'Ledger integrity intact'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Ledger verification failed'
    });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    await ensureAdminRoleSchema();
    await ensureLawyerScopeSchema();

    const {
      email,
      phone,
      full_name,
      nin,
      password,
      user_type,
      assigned_state,
      assigned_city,
      lawyer_client_scope,
    } = req.body;

    const allowedCreateRoles = [
      'admin',
      'lga_admin',
      'lga_support_admin',
      'state_admin',
      'lga_financial_admin',
      'lga_transportation_admin',
      'state_transportation_admin',
      'super_transportation_admin',
      'lga_fumigation_admin',
      'state_fumigation_admin',
      'super_fumigation_admin',
      'state_financial_admin',
      'state_support_admin',
      'super_financial_admin',
      'super_support_admin',
      'recruitment_admin',
      'lawyer',
      'state_lawyer',
      'super_lawyer',
      'fumigation_admin',
      'transportation_admin',
    ];

    const fallbackStates = [
      'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta',
      'Ebonyi','Edo','Ekiti','Enugu','FCT','Federal Capital Territory','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi',
      'Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
      'Taraba','Yobe','Zamfara'
    ];

    const stateBoundRoles = new Set([
      'admin',
      'lga_admin',
      'lga_support_admin',
      'lga_financial_admin',
      'lga_transportation_admin',
      'lga_fumigation_admin',
      'state_admin',
      'state_financial_admin',
      'state_support_admin',
      'state_lawyer',
      'state_transportation_admin',
      'state_fumigation_admin',
      'lawyer',
    ]);
    const lawyerRoles = new Set([
      'lawyer',
      'state_lawyer',
      'super_lawyer',
    ]);

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();
    const normalizedFullName = String(full_name || '').trim();
    const normalizedNin = String(nin || '').trim();
    const normalizedPassword = String(password || '');

    if (!normalizedFullName || !normalizedEmail || !normalizedPhone || !normalizedPassword) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, phone and password are required',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email address',
      });
    }

    if (!allowedCreateRoles.includes(user_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected',
      });
    }

    const normalizedState = String(assigned_state || '').trim();
    const normalizedCity = String(assigned_city || '').trim();
    let canonicalAssignedState = normalizedState;

    if (stateBoundRoles.has(user_type)) {
      if (!normalizedState) {
        return res.status(400).json({
          success: false,
          message: 'Assigned state is required for this role',
        });
      }

      const normalizeStateValue = (value) => String(value || '').trim().toLowerCase();
      const normalizedStateInput = normalizeStateValue(normalizedState);
      let stateMatched = false;

      try {
        const stateRows = await db.query('SELECT state_name, state_code FROM states ORDER BY state_name ASC');
        const match = stateRows.rows.find((row) => {
          const stateName = normalizeStateValue(row.state_name);
          const stateCode = normalizeStateValue(row.state_code);
          return (
            stateName === normalizedStateInput ||
            stateCode === normalizedStateInput ||
            (normalizedStateInput === 'fct' && stateName === 'federal capital territory')
          );
        });

        if (match) {
          canonicalAssignedState = match.state_name;
          stateMatched = true;
        }
      } catch (stateLookupError) {
        console.warn('Create admin state lookup failed, using fallback states:', stateLookupError.message);
      }

      if (!stateMatched) {
        stateMatched = fallbackStates.some((state) => normalizeStateValue(state) === normalizedStateInput);
        if (normalizedStateInput === 'fct') {
          canonicalAssignedState = 'Federal Capital Territory';
          stateMatched = true;
        }
      }

      if (!stateMatched) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assigned state selected',
        });
      }
    }

    if (['admin', 'lga_admin', 'lga_support_admin', 'lga_financial_admin', 'lawyer', 'lga_transportation_admin', 'lga_fumigation_admin'].includes(user_type) && !normalizedCity) {
      return res.status(400).json({
        success: false,
        message: 'Assigned local government is required for this LGA role',
      });
    }

    let normalizedLawyerScope = null;
    if (lawyerRoles.has(user_type)) {
      normalizedLawyerScope = String(lawyer_client_scope || '').trim().toLowerCase();
      if (!['tenant', 'landlord'].includes(normalizedLawyerScope)) {
        return res.status(400).json({
          success: false,
          message: 'Lawyer must be assigned to tenant or landlord client type',
        });
      }
    }

    await releaseDeletedUserIdentityConflicts({
      email: normalizedEmail,
      phone: normalizedPhone,
      nin: normalizedNin,
    });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(normalizedPassword, salt);

    // Roles that require super-admin approval before the account is active
    const requiresApprovalRoles = new Set([
      'admin',
      'lga_admin',
      'lga_support_admin',
      'lga_financial_admin',
      'lga_transportation_admin',
      'state_transportation_admin',
      'super_transportation_admin',
      'lga_fumigation_admin',
      'state_fumigation_admin',
      'super_fumigation_admin',
      'state_admin',
      'financial_admin',
      'super_financial_admin',
      'state_financial_admin',
      'state_support_admin',
      'super_support_admin',
      'recruitment_admin',
      'super_lawyer',
      'state_lawyer',
      'lawyer',
      'agent',
      'fumigation_admin',
      'transportation_admin',
    ]);

    const pendingApproval = requiresApprovalRoles.has(user_type);

    const result = await db.query(
      `INSERT INTO users (
        user_type, email, phone, password_hash,
        full_name, nin, assigned_state, assigned_city, lawyer_client_scope,
        email_verified, phone_verified, identity_verified, approval_status,
        is_recruitment_admin, is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,TRUE,TRUE,$10,$11,TRUE)
      RETURNING id, email, user_type, assigned_state, assigned_city, lawyer_client_scope, approval_status, is_recruitment_admin`,
      [
        user_type,
        normalizedEmail,
        normalizedPhone,
        passwordHash,
        normalizedFullName,
        normalizedNin || null,
        canonicalAssignedState || null,
        ['admin', 'lga_admin', 'lga_support_admin', 'lga_financial_admin', 'lawyer', 'lga_transportation_admin', 'lga_fumigation_admin'].includes(user_type) ? normalizedCity : null,
        normalizedLawyerScope,
        pendingApproval ? 'pending' : 'approved',
        user_type === 'recruitment_admin',
      ]
    );

    const createdRoleLabel = String(user_type || '')
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    const statusNote = pendingApproval
      ? ' — awaiting Super Admin approval'
      : '';

    res.json({
      message: `${createdRoleLabel} created successfully${statusNote}`,
      admin: result.rows[0],
      pending_approval: pendingApproval,
    });

  } catch (err) {
    console.error(err);

    if (err.code === '23505') {
      const detail = String(err.detail || 'A user with one of those details already exists.');
      return res.status(409).json({ message: detail });
    }

    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/admin/properties/:id/unlist
exports.unlistProperty = async (req, res) => {
  try {
    await ensurePropertyOperationSchema();
    const { id } = req.params;
    const note = requireOperationNote(req.body, 'An unlist reason is required');

    const result = await db.query(
      `
      UPDATE properties
      SET is_available = FALSE,
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id, title, is_available
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    await db.query(
      'DELETE FROM saved_properties WHERE property_id = $1',
      [id]
    );

    await recordPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_unlisted',
      note,
      metadata: {
        title: result.rows[0].title,
      },
    });

    res.json({
      success: true,
      message: 'Property unlisted successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Admin unlist property error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to unlist property',
    });
  }
};

// PATCH /api/admin/properties/:id/relist
exports.relistProperty = async (req, res) => {
  try {
    await ensurePropertyOperationSchema();
    const { id } = req.params;
    const note = requireOperationNote(req.body, 'A relist reason is required');

    const result = await db.query(
      `
      UPDATE properties
      SET is_available = TRUE,
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id, title, is_available
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    await recordPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_relisted',
      note,
      metadata: {
        title: result.rows[0].title,
      },
    });

    res.json({
      success: true,
      message: 'Property relisted successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Admin relist property error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to relist property',
    });
  }
};

// PATCH /api/admin/properties/:id/feature
exports.featureProperty = async (req, res) => {
  try {
    await ensurePropertyOperationSchema();
    const { id } = req.params;
    const note = requireOperationNote(req.body, 'A feature reason is required');

    const result = await db.query(
      `
      UPDATE properties
      SET featured = TRUE,
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id, title, featured
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    await recordPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_featured',
      note,
      metadata: {
        title: result.rows[0].title,
      },
    });

    res.json({
      success: true,
      message: 'Property marked as featured',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Admin feature property error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to feature property',
    });
  }
};

// PATCH /api/admin/properties/:id/unfeature
exports.unfeatureProperty = async (req, res) => {
  try {
    await ensurePropertyOperationSchema();
    const { id } = req.params;
    const note = requireOperationNote(req.body, 'An unfeature reason is required');

    const result = await db.query(
      `
      UPDATE properties
      SET featured = FALSE,
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id, title, featured
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    await recordPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_unfeatured',
      note,
      metadata: {
        title: result.rows[0].title,
      },
    });

    res.json({
      success: true,
      message: 'Property removed from featured',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Admin unfeature property error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to unfeature property',
    });
  }
};
