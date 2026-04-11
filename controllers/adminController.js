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
// - admin role: scoped by both assigned_state (state) AND assigned_city (LGA)
// - state_admin / state_financial_admin: scoped by assigned_state only
// - all other roles: no scope restriction (both null)
const getRequesterScope = async (user) => {
  const role = user?.user_type || user?.userType;

  if (role === 'admin') {
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
      const stateSql = `LOWER(TRIM(sp.state)) = LOWER(TRIM($1))`;
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
               WHERE (sp.user_id = u.id OR sp.landlord_id = u.id)
                 AND ${stateSql}${lgaSql}
             )
             OR EXISTS (
               SELECT 1
               FROM applications sa
               JOIN properties sp ON sp.id = sa.property_id
               WHERE sa.tenant_id = u.id
                 AND ${stateSql}${lgaSql}
             )
           )`,
        scopeParams
      );

      totalProperties = await db.query(
        `SELECT COUNT(*)
         FROM properties
         WHERE LOWER(TRIM(state)) = LOWER(TRIM($1))${propLgaSql}`,
        scopeParams
      );

      applications = await db.query(
        `SELECT COUNT(*)
         FROM applications a
         JOIN properties p ON p.id = a.property_id
         WHERE LOWER(TRIM(p.state)) = LOWER(TRIM($1))${joinedLgaSql}`,
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
               WHERE (sp.user_id = u.id OR sp.landlord_id = u.id)
                 AND ${stateSql}${lgaSql}
             )
             OR EXISTS (
               SELECT 1
               FROM applications sa
               JOIN properties sp ON sp.id = sa.property_id
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
          WHERE sa.tenant_id = u.id
            AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${i}))
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
        SELECT p.state
        FROM properties p
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
          WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
            AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${i}))
        )
        OR EXISTS (
          SELECT 1
          FROM applications sa
          JOIN properties sp ON sp.id = sa.property_id
          WHERE sa.tenant_id = users.id
            AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${i}))
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${stateIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${stateIdx}))
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${stateIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${stateIdx}))
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
      where.push(`LOWER(TRIM(p.state)) = LOWER(TRIM($${i++}))`);
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
        p.state,
        u.full_name AS landlord_name
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const params = [];
    let i = 1;
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND LOWER(TRIM(p.state)) = LOWER(TRIM($${i++}))`);
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [id, adminId];
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND LOWER(TRIM(state)) = LOWER(TRIM($${queryParams.length + 1}))`);
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [id, assignedState ? 'Rejected by state admin review' : 'Rejected by admin review'];
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND LOWER(TRIM(state)) = LOWER(TRIM($${queryParams.length + 1}))`);
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

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
      where.push(`LOWER(TRIM(p.state)) = LOWER(TRIM($${i++}))`);
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
    const { id } = req.params;

    // Prevent deleting yourself
    const currentUserId = req.user.userId || req.user.id;
    if (Number(id) === Number(currentUserId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }

    const targetResult = await db.query(
      'SELECT user_type FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (!targetResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const targetType = targetResult.rows[0].user_type;
    if (!['tenant', 'landlord'].includes(targetType)) {
      return res.status(403).json({
        success: false,
        message: 'Admin can only manage tenant and landlord accounts',
      });
    }

    await db.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    res.json({
      success: true,
      message: 'User disabled successfully',
    });
  } catch (err) {
    console.error('Soft delete user error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to disable user',
    });
  }
};

// PATCH /api/admin/users/:id/verify
exports.verifyUser = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const { id } = req.params;
    const adminId = req.user.id;

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
       RETURNING id`,
      [id, adminId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not eligible for manual verification',
      });
    }

    res.json({
      success: true,
      message: 'User verified successfully',
    });
  } catch (err) {
    console.error('Manual verify user error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to verify user',
    });
  }
};


// GET /api/admin/users/:id
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({ success: false, message: 'State admin account is missing assigned_state' });
    }

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
             WHERE (sp.user_id = users.id OR sp.landlord_id = users.id)
               AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${stateIdx}))
           )
           OR EXISTS (
             SELECT 1
             FROM applications sa
             JOIN properties sp ON sp.id = sa.property_id
             WHERE sa.tenant_id = users.id
               AND LOWER(TRIM(sp.state)) = LOWER(TRIM($${stateIdx}))
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
              created_at
       FROM users
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
    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({ success: false, message: 'State admin account is missing assigned_state' });
    }

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
      return res.status(403).json({ success: false, message: 'Admin account is missing assigned state or local government' });
    }

    const queryParams = [id];
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND LOWER(TRIM(p.state)) = LOWER(TRIM($${queryParams.length + 1}))`);
      queryParams.push(assignedState);
    }

    if (assignedCity) {
      extraClauses.push(`AND LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${queryParams.length + 1}))`);
      queryParams.push(assignedCity);
    }

    const stateClause = extraClauses.join(' ');

    const result = await db.query(
      `SELECT p.*, u.full_name AS landlord_name, u.email AS landlord_email
       FROM properties p
       LEFT JOIN users u ON p.user_id = u.id
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
    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const queryParams = [id];
    const extraClauses = [];

    if (assignedState) {
      extraClauses.push(`AND LOWER(TRIM(p.state)) = LOWER(TRIM($${queryParams.length + 1}))`);
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
         l.full_name AS landlord_name
       FROM applications a
       JOIN users t ON a.tenant_id = t.id
       JOIN properties p ON a.property_id = p.id
       LEFT JOIN users l ON p.user_id = l.id
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
    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
             AND LOWER(TRIM(p.state)) = LOWER(TRIM($${stateIdx}))
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
       RETURNING id, status`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    res.json({
      success: true,
      message: 'Application approved',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Approve application error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to approve application',
    });
  }
};

// POST /api/admin/applications/:id/reject
exports.rejectApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (req.user?.user_type === 'admin' && (!assignedState || !assignedCity)) {
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
             AND LOWER(TRIM(p.state)) = LOWER(TRIM($${stateIdx}))
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
       RETURNING id, status`,
      queryParams
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    res.json({
      success: true,
      message: 'Application rejected',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Reject application error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reject application',
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
      'state_admin',
      'state_financial_admin',
      'state_support_admin',
      'super_financial_admin',
      'super_support_admin',
      'lawyer',
      'state_lawyer',
      'super_lawyer',
    ];

    const states = [
      'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta',
      'Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi',
      'Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
      'Taraba','Yobe','Zamfara'
    ];

    const stateBoundRoles = new Set([
      'admin',
      'state_admin',
      'state_financial_admin',
      'state_support_admin',
      'state_lawyer',
      'lawyer',
    ]);
    const lawyerRoles = new Set([
      'lawyer',
      'state_lawyer',
      'super_lawyer',
    ]);

    if (!allowedCreateRoles.includes(user_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected',
      });
    }

    const normalizedState = String(assigned_state || '').trim();
    const normalizedCity = String(assigned_city || '').trim();
    if (stateBoundRoles.has(user_type)) {
      if (!normalizedState) {
        return res.status(400).json({
          success: false,
          message: 'Assigned state is required for this role',
        });
      }

      if (!states.includes(normalizedState)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assigned state selected',
        });
      }
    }

    if (user_type === 'admin' && !normalizedCity) {
      return res.status(400).json({
        success: false,
        message: 'Assigned local government is required for admin role',
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
      email,
      phone,
      nin,
    });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (
        user_type, email, phone, password_hash,
        full_name, nin, assigned_state, assigned_city, lawyer_client_scope,
        email_verified, phone_verified, identity_verified
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,TRUE,TRUE)
      RETURNING id, email, user_type, assigned_state, assigned_city, lawyer_client_scope`,
      [
        user_type,
        email,
        phone,
        passwordHash,
        full_name,
        nin,
        normalizedState || null,
        user_type === 'admin' ? normalizedCity : null,
        normalizedLawyerScope,
      ]
    );

    res.json({
      message: 'Account created successfully',
      admin: result.rows[0]
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
    const { id } = req.params;

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

    res.json({
      success: true,
      message: 'Property unlisted successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Admin unlist property error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to unlist property',
    });
  }
};

// PATCH /api/admin/properties/:id/relist
exports.relistProperty = async (req, res) => {
  try {
    const { id } = req.params;

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

    res.json({
      success: true,
      message: 'Property relisted successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Admin relist property error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to relist property',
    });
  }
};

// PATCH /api/admin/properties/:id/feature
exports.featureProperty = async (req, res) => {
  try {
    const { id } = req.params;

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

    res.json({
      success: true,
      message: 'Property marked as featured',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Admin feature property error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to feature property',
    });
  }
};

// PATCH /api/admin/properties/:id/unfeature
exports.unfeatureProperty = async (req, res) => {
  try {
    const { id } = req.params;

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

    res.json({
      success: true,
      message: 'Property removed from featured',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Admin unfeature property error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to unfeature property',
    });
  }
};
