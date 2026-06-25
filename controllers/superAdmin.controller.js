const db = require('../config/middleware/database');
const jwt = require('jsonwebtoken');
const { decryptNIN } = require('../config/utils/ninEncryption');
const {
  DEFAULT_FEATURE_FLAGS,
  ensureFeatureFlagsTable,
  syncDefaultFeatureFlags,
} = require('../config/middleware/featureFlags');
const { getLocationOptions } = require('../config/utils/locationDirectory');
const {
  createLocationPricingRule,
  deleteLocationPricingRule,
  getPricingTargets,
  listLocationPricingRules,
  updateLocationPricingRule,
} = require('../config/utils/locationPricing');
const {
  createRegistrationAccessRule,
  deleteRegistrationAccessRule,
  getRegistrationAccessTargets,
  listRegistrationAccessRules,
  updateRegistrationAccessRule,
} = require('../config/utils/registrationAccess');
const {
  PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE,
  PLATFORM_LAWYER_INVITE_EXPIRY_HOURS,
  createPlatformLawyerInvite,
  ensurePlatformLawyerSchema,
} = require('../config/utils/platformLawyerProgram');
const {
  ensurePlatformAgentSchema,
} = require('../config/utils/platformAgentProgram');
const {
  sendPlatformLawyerInviteEmail,
} = require('../config/utils/emailService');
const {
  ensureLawyerCaseNotesSchema,
} = require('../config/utils/legalSchema');
const {
  setAuthCookies,
  shouldReturnTokenInBody,
} = require('../config/utils/authCookies');

let verificationAuditSchemaReady = false;
let userSuspensionSchemaReady = false;
let adminAccountOperationSchemaReady = false;
let identityVerificationOperationSchemaReady = false;
const USER_VERIFICATION_STATUS_EXPR = `
  COALESCE(
    u.identity_verification_status,
    CASE
      WHEN u.identity_verified = TRUE THEN 'verified'
      WHEN u.passport_photo_url IS NOT NULL
        AND (u.nin IS NOT NULL OR u.international_passport_number IS NOT NULL)
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
    ADD COLUMN IF NOT EXISTS identity_verification_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

    CREATE INDEX IF NOT EXISTS idx_users_identity_verified_by
      ON users(identity_verified_by);

    CREATE INDEX IF NOT EXISTS idx_users_identity_verification_status
      ON users(identity_verification_status);
  `);

  verificationAuditSchemaReady = true;
};

const ensureUserSuspensionSchema = async () => {
  if (userSuspensionSchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_suspended_reason TEXT,
    ADD COLUMN IF NOT EXISTS account_suspended_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS account_suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `);

  userSuspensionSchemaReady = true;
};

const ensureAdminAccountOperationSchema = async () => {
  if (adminAccountOperationSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_account_operations (
      id SERIAL PRIMARY KEY,
      admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      admin_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_account_operations_admin
      ON admin_account_operations(admin_user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_admin_account_operations_created
      ON admin_account_operations(created_at DESC);
  `);

  adminAccountOperationSchemaReady = true;
};

const ensureIdentityVerificationOperationSchema = async () => {
  if (identityVerificationOperationSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS identity_verification_operations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      user_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_identity_verification_operations_user
      ON identity_verification_operations(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_identity_verification_operations_created
      ON identity_verification_operations(created_at DESC);
  `);

  identityVerificationOperationSchemaReady = true;
};

const getAdminOperationActorName = (user = {}) =>
  user.full_name || user.name || user.email || `Admin #${user.id || 'unknown'}`;

const createAdminAccountOperation = async ({
  adminUserId,
  actorId,
  actorName,
  eventType,
  note = null,
  adminSnapshot = {},
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO admin_account_operations (
       admin_user_id,
       actor_id,
       actor_name,
       event_type,
       note,
       admin_snapshot,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      adminUserId || null,
      actorId || null,
      actorName || null,
      eventType,
      note || null,
      JSON.stringify(adminSnapshot || {}),
      JSON.stringify(metadata || {}),
    ]
  );
};

const createIdentityVerificationOperation = async ({
  userId,
  actorId,
  actorName,
  eventType,
  note = null,
  userSnapshot = {},
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO identity_verification_operations (
       user_id,
       actor_id,
       actor_name,
       event_type,
       note,
       user_snapshot,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      userId || null,
      actorId || null,
      getAdminOperationActorName({ id: actorId, full_name: actorName }) || null,
      eventType,
      note || null,
      JSON.stringify(userSnapshot || {}),
      JSON.stringify(metadata || {}),
    ]
  );
};

const buildDeletedEmail = (userId) => `deleted+u${userId}.${Date.now()}@deleted.local`;

const buildDeletedUniqueValue = (prefix, userId) => `${prefix}${userId}${Date.now().toString().slice(-8)}`;

// ---- Audit Helper ----
const logAction = async (actorId, action, targetType = null, targetId = null) => {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id)
     VALUES ($1, $2, $3, $4)`,
    [actorId, action, targetType, targetId]
  );
};

const getDashboardPathForRole = (userType) => {
  switch (String(userType || '').toLowerCase()) {
    case 'super_admin':
      return '/super-admin?tab=overview';
    case 'super_financial_admin':
      return '/admin/super-financial-dashboard?panel=overview';
    case 'financial_admin':
    case 'lga_financial_admin':
      return '/admin/financial-dashboard';
    case 'lga_support_admin':
      return '/admin?tab=property_requests';
    case 'state_admin':
    case 'state_financial_admin':
    case 'admin':
    case 'lga_admin':
      return '/admin';
    case 'super_support_admin':
      return '/admin/super-support-dashboard?tab=overview';
    case 'recruitment_admin':
      return '/admin/recruitment';
    case 'state_support_admin':
      return '/admin/state-support-dashboard';
    case 'fumigation_admin':
    case 'lga_fumigation_admin':
    case 'state_fumigation_admin':
    case 'super_fumigation_admin':
      return '/admin/fumigation-cleaning';
    case 'transportation_admin':
    case 'lga_transportation_admin':
    case 'state_transportation_admin':
    case 'super_transportation_admin':
      return '/admin/transportation';
    case 'super_lawyer':
      return '/lawyer/super';
    case 'state_lawyer':
      return '/lawyer/state';
    case 'lawyer':
      return '/lawyer';
    default:
      return '/dashboard';
  }
};

// ================= USERS =================

// GET /api/super/users
const getAllUsers = async (req, res) => {
    try {
      await ensureVerificationAuditSchema();
      await ensureAdminAccountOperationSchema();

      const { rows } = await db.query(
        `SELECT
           u.id,
           u.full_name,
           u.email,
           u.user_type,
           u.identity_verified,
           u.identity_verified_at,
           u.is_active,
           u.created_at,
           u.email_verified,
           u.phone_verified,
           u.nin_verified,
           u.nin,
           u.passport_photo_url,
           u.identity_document_type,
           u.international_passport_number,
           u.identity_verification_status,
           u.approval_status,
           ${USER_VERIFICATION_STATUS_EXPR} AS identity_verification_status,
           v.full_name AS identity_verified_by_name,
           COALESCE(vc.total_verified, 0)::INT AS credentials_verified_count,
           COALESCE(ops.operations, '[]'::json) AS account_operations
         FROM users u
         LEFT JOIN users v ON v.id = u.identity_verified_by
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS total_verified
           FROM users uv
           WHERE uv.identity_verified_by = u.id
         ) vc ON TRUE
         LEFT JOIN LATERAL (
           SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
           FROM (
             SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
             FROM admin_account_operations
             WHERE admin_user_id = u.id
             ORDER BY created_at DESC, id DESC
             LIMIT 3
           ) operation_rows
         ) ops ON TRUE
         WHERE u.deleted_at IS NULL
           AND u.user_type IN ('tenant', 'landlord', 'agent')
         ORDER BY u.created_at DESC`
      );

      // Decrypt NIN for each user before returning
      for (const row of rows) {
        if (row.nin) {
          row.nin = decryptNIN(row.nin);
        }
      }

      res.json({ success: true, users: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to load users' });
    }
  };

const impersonateAdmin = async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid admin id' });
    }

    const { rows } = await db.query(
      `SELECT id, email, full_name, user_type, assigned_state, assigned_city,
              email_verified, phone_verified, identity_verified,
              identity_verification_status, subscription_active, subscription_expires_at,
              is_active, deleted_at, COALESCE(approval_status, 'approved') AS approval_status
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [targetId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const target = rows[0];
    const allowedRoles = new Set([
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
      'state_financial_admin',
      'financial_admin',
      'super_financial_admin',
      'state_support_admin',
      'super_support_admin',
      'recruitment_admin',
      'fumigation_admin',
      'transportation_admin',
      'lawyer',
      'state_lawyer',
      'super_lawyer',
      'super_admin',
    ]);

    if (!allowedRoles.has(String(target.user_type || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Impersonation is not allowed for this role' });
    }

    if (target.deleted_at) {
      return res.status(403).json({ success: false, message: 'Cannot impersonate a deleted account' });
    }

    if (target.is_active === false) {
      return res.status(403).json({ success: false, message: 'Cannot impersonate a suspended account' });
    }

    if (target.approval_status === 'pending') {
      return res.status(403).json({ success: false, message: 'Cannot impersonate an account pending approval' });
    }

    const impersonationToken = jwt.sign(
      {
        userId: target.id,
        userType: target.user_type,
        impersonation: true,
        impersonatedBy: req.user.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    await logAction(req.user.id, `IMPERSONATE_ADMIN_${String(target.user_type || '').toUpperCase()}`, 'user', target.id);

    const csrfToken = setAuthCookies(res, impersonationToken, {
      maxAge: 2 * 60 * 60 * 1000,
    });
    const responseData = {
      user: {
        id: target.id,
        email: target.email,
        full_name: target.full_name,
        user_type: target.user_type,
        assigned_state: target.assigned_state,
        assigned_city: target.assigned_city,
        email_verified: target.email_verified,
        phone_verified: target.phone_verified,
        identity_verified: target.identity_verified,
        identity_verification_status: target.identity_verification_status,
        subscription_active: target.subscription_active,
        subscription_expires_at: target.subscription_expires_at,
      },
      csrf_token: csrfToken,
      redirect_path: getDashboardPathForRole(target.user_type),
    };

    if (shouldReturnTokenInBody()) {
      responseData.token = impersonationToken;
    }

    return res.json({
      success: true,
      message: `Now impersonating ${target.full_name}`,
      data: responseData,
    });
  } catch (error) {
    console.error('Impersonation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to impersonate admin' });
  }
};

// PATCH /api/super/users/:id/ban
const banUser = async (req, res) => {
  const { id } = req.params;

  try {
    await ensureUserSuspensionSchema();
    await ensureAdminAccountOperationSchema();

    const reason = String(req.body?.reason || '').trim();

    if (!reason) {
      return res.status(400).json({ message: 'A suspension reason is required' });
    }

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT id, full_name, email, user_type, assigned_state, assigned_city,
              is_active, account_suspended_reason, account_suspended_at
       FROM users
       WHERE id = $1
         AND user_type <> 'super_admin'
         AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found or cannot be suspended' });
    }

    const existing = existingResult.rows[0];

    const updateResult = await db.query(
      `UPDATE users
       SET is_active = FALSE,
           account_suspended_reason = $2,
           account_suspended_at = NOW(),
           account_suspended_by = $3,
           updated_at = NOW()
       WHERE id = $1 AND user_type <> 'super_admin'`,
      [id, reason, req.user.id]
    );

    if (!updateResult.rowCount) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found or cannot be suspended' });
    }

    await createAdminAccountOperation({
      adminUserId: Number(id),
      actorId: req.user.id,
      actorName: getAdminOperationActorName(req.user),
      eventType: 'admin_suspended',
      note: reason,
      adminSnapshot: existing,
      metadata: {
        old_is_active: existing.is_active,
        new_is_active: false,
      },
    });

    await db.query('COMMIT');
    await logAction(req.user.id, 'BAN_USER', 'user', id);

    res.json({ success: true, message: 'User banned' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Failed to ban user' });
  }
};

// PATCH /api/super/users/:id/unban
const unbanUser = async (req, res) => {
  const { id } = req.params;

  try {
    await ensureVerificationAuditSchema();
    await ensureIdentityVerificationOperationSchema();
    await ensureUserSuspensionSchema();
    await ensureAdminAccountOperationSchema();

    const reason = String(req.body?.reason || req.body?.note || '').trim() || null;

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT id, full_name, email, user_type, assigned_state, assigned_city,
              is_active, account_suspended_reason, account_suspended_at
       FROM users
       WHERE id = $1
         AND user_type <> 'super_admin'
         AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found or cannot be unbanned' });
    }

    const existing = existingResult.rows[0];

    const result = await db.query(
      `UPDATE users
       SET is_active = TRUE,
           account_suspended_reason = NULL,
           account_suspended_at = NULL,
           account_suspended_by = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND user_type <> 'super_admin'
         AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found or cannot be unbanned' });
    }

    await createAdminAccountOperation({
      adminUserId: Number(id),
      actorId: req.user.id,
      actorName: getAdminOperationActorName(req.user),
      eventType: 'admin_unsuspended',
      note: reason,
      adminSnapshot: existing,
      metadata: {
        old_is_active: existing.is_active,
        new_is_active: true,
        previous_suspension_reason: existing.account_suspended_reason,
      },
    });

    await db.query('COMMIT');
    await logAction(req.user.id, 'UNBAN_USER', 'user', id);

    res.json({ success: true, message: 'User unbanned' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Failed to unban user' });
  }
};

// DELETE /api/super/users/:id
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    await ensureVerificationAuditSchema();
    await ensureUserSuspensionSchema();
    await ensureAdminAccountOperationSchema();

    const reason = String(req.body?.reason || req.body?.delete_reason || '').trim();

    if (!reason) {
      return res.status(400).json({ message: 'A deletion reason is required' });
    }

    const existingResult = await db.query(
      `SELECT id, full_name, user_type, email, phone, nin, assigned_state, assigned_city,
              is_active, account_suspended_reason, account_suspended_at, created_at
       FROM users
       WHERE id = $1
         AND user_type <> 'super_admin'
         AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    );

    if (!existingResult.rows.length) {
      return res.status(404).json({ message: 'User not found or cannot be deleted' });
    }

    const existingUser = existingResult.rows[0];

    try {
      const hardDeleteResult = await db.query(
        `DELETE FROM users
         WHERE id = $1
           AND user_type <> 'super_admin'
         RETURNING id`,
        [id]
      );

      if (!hardDeleteResult.rows.length) {
        return res.status(404).json({ message: 'User not found or cannot be deleted' });
      }

      await createAdminAccountOperation({
        adminUserId: null,
        actorId: req.user.id,
        actorName: getAdminOperationActorName(req.user),
        eventType: 'admin_deleted',
        note: reason,
        adminSnapshot: existingUser,
        metadata: {
          delete_mode: 'hard_delete',
          deleted_user_id: Number(id),
        },
      });

      await logAction(req.user.id, 'DELETE_USER', 'user', id);

      return res.json({
        success: true,
        message: 'User deleted permanently',
      });
    } catch (deleteError) {
      if (deleteError.code !== '23503') {
        throw deleteError;
      }
    }

    const result = await db.query(
      `UPDATE users
       SET deleted_at = NOW(),
           is_active = FALSE,
           email = $2,
           phone = $3,
           nin = $4,
           account_suspended_reason = NULL,
           account_suspended_at = NULL,
           account_suspended_by = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND user_type <> 'super_admin'
         AND deleted_at IS NULL
       RETURNING id`,
      [
        id,
        existingUser.email ? buildDeletedEmail(existingUser.id) : null,
        existingUser.phone ? buildDeletedUniqueValue('DELP', existingUser.id) : null,
        existingUser.nin ? buildDeletedUniqueValue('DELN', existingUser.id) : null,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'User not found or cannot be deleted' });
    }

    await createAdminAccountOperation({
      adminUserId: Number(id),
      actorId: req.user.id,
      actorName: getAdminOperationActorName(req.user),
      eventType: 'admin_deleted',
      note: reason,
      adminSnapshot: existingUser,
      metadata: {
        delete_mode: 'soft_delete',
      },
    });

    await logAction(req.user.id, 'DELETE_USER', 'user', id);

    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete user' });
  }
};

// PATCH /api/super/users/:id/promote
const promoteToAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `UPDATE users
       SET user_type = 'admin', updated_at = NOW()
       WHERE id = $1 AND user_type <> 'super_admin'
       RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'User not found or cannot be promoted' });
    }

    await logAction(req.user.id, 'PROMOTE_TO_ADMIN', 'user', id);

    res.json({ success: true, message: 'User promoted to admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to promote user' });
  }
};

// ================= IDENTITY VERIFICATIONS =================

// GET /api/super/verifications
const getIdentityVerifications = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const {
      search = '',
      status = 'pending',
      user_type: userType = 'all',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;

    const where = [
      `u.deleted_at IS NULL`,
      `u.user_type <> 'super_admin'`,
      `${USER_VERIFICATION_STATUS_EXPR} <> 'not_submitted'`,
    ];
    const params = [];
    let i = 1;

    if (status === 'pending') {
      where.push(`${USER_VERIFICATION_STATUS_EXPR} = 'pending'`);
    } else if (status === 'verified') {
      where.push(`${USER_VERIFICATION_STATUS_EXPR} = 'verified'`);
    } else if (status === 'rejected') {
      where.push(`${USER_VERIFICATION_STATUS_EXPR} = 'rejected'`);
    }

    if (userType && userType !== 'all') {
      where.push(`u.user_type = $${i++}`);
      params.push(userType);
    }

    if (search) {
      where.push(`(
        u.full_name ILIKE $${i} OR
        u.email ILIKE $${i} OR
        u.nin ILIKE $${i} OR
        u.international_passport_number ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*)
      FROM users u
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    const dataQuery = `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.user_type,
        u.identity_document_type,
        u.nin,
        u.international_passport_number,
        u.nationality,
        u.passport_photo_url,
        u.identity_verified,
        ${USER_VERIFICATION_STATUS_EXPR} AS identity_verification_status,
        u.identity_verified_at,
        u.identity_verified_by,
        v.full_name AS identity_verified_by_name,
        u.created_at,
        COALESCE(ops.operations, '[]'::json) AS verification_operations
      FROM users u
      LEFT JOIN users v ON v.id = u.identity_verified_by
      LEFT JOIN LATERAL (
        SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
        FROM (
          SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
          FROM identity_verification_operations
          WHERE user_id = u.id
          ORDER BY created_at DESC, id DESC
          LIMIT 3
        ) operation_rows
      ) ops ON TRUE
      ${whereClause}
      ORDER BY
        CASE ${USER_VERIFICATION_STATUS_EXPR}
          WHEN 'pending' THEN 0
          WHEN 'rejected' THEN 1
          WHEN 'verified' THEN 2
          ELSE 3
        END,
        u.created_at ASC
      LIMIT $${i++} OFFSET $${i++}
    `;
    const dataResult = await db.query(dataQuery, [...params, pageSize, offset]);

    // Decrypt NIN before returning
    for (const row of dataResult.rows) {
      if (row.nin) {
        row.nin = decryptNIN(row.nin);
      }
    }

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load identity verifications' });
  }
};

// PATCH /api/super/verifications/:userId/approve
const approveIdentityVerification = async (req, res) => {
  const { userId } = req.params;

  try {
    await ensureVerificationAuditSchema();
    await ensureIdentityVerificationOperationSchema();

    const reviewNote = String(req.body?.review_note || req.body?.note || '').trim() || null;

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT id, full_name, email, user_type, identity_document_type, nationality,
              identity_verified, identity_verification_status, passport_photo_url,
              identity_verified_at, identity_verified_by
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type <> 'super_admin'
       FOR UPDATE`,
      [userId]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found or not eligible for verification' });
    }

    const existingUser = existingResult.rows[0];

    const result = await db.query(
      `UPDATE users
       SET identity_verified = TRUE,
           identity_verification_status = 'verified',
           identity_verified_by = $2,
           identity_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type <> 'super_admin'
         AND passport_photo_url IS NOT NULL
         AND (nin IS NOT NULL OR international_passport_number IS NOT NULL)
       RETURNING id`,
      [userId, req.user.id]
    );

    if (!result.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found or not eligible for verification' });
    }

    await createIdentityVerificationOperation({
      userId: Number(userId),
      actorId: req.user.id,
      actorName: getAdminOperationActorName(req.user),
      eventType: 'identity_verified',
      note: reviewNote,
      userSnapshot: existingUser,
      metadata: {
        old_status: existingUser.identity_verification_status,
        new_status: 'verified',
      },
    });

    await db.query('COMMIT');
    await logAction(req.user.id, 'VERIFY_USER', 'user', userId);

    res.json({ success: true, message: 'User verified' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Failed to verify user' });
  }
};

// PATCH /api/super/verifications/:userId/reject
const rejectIdentityVerification = async (req, res) => {
  const { userId } = req.params;

  try {
    await ensureVerificationAuditSchema();
    await ensureIdentityVerificationOperationSchema();

    const reviewNote = String(req.body?.review_note || req.body?.reason || req.body?.note || '').trim();

    if (!reviewNote) {
      return res.status(400).json({ message: 'A rejection reason is required' });
    }

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT id, full_name, email, user_type, identity_document_type, nationality,
              identity_verified, identity_verification_status, passport_photo_url,
              identity_verified_at, identity_verified_by
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type <> 'super_admin'
       FOR UPDATE`,
      [userId]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found or cannot be rejected' });
    }

    const existingUser = existingResult.rows[0];

    const result = await db.query(
      `UPDATE users
       SET identity_verified = FALSE,
           identity_verification_status = 'rejected',
           identity_verified_by = NULL,
           identity_verified_at = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type <> 'super_admin'
       RETURNING id`,
      [userId]
    );

    if (!result.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found or cannot be rejected' });
    }

    await createIdentityVerificationOperation({
      userId: Number(userId),
      actorId: req.user.id,
      actorName: getAdminOperationActorName(req.user),
      eventType: 'identity_rejected',
      note: reviewNote,
      userSnapshot: existingUser,
      metadata: {
        old_status: existingUser.identity_verification_status,
        new_status: 'rejected',
      },
    });

    await db.query('COMMIT');
    await logAction(req.user.id, 'REJECT_USER_VERIFICATION', 'user', userId);

    res.json({ success: true, message: 'User verification rejected' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Failed to reject verification' });
  }
};

// DELETE /api/super/verifications/:userId
const deleteRejectedVerification = async (req, res) => {
  const { userId } = req.params;

  try {
    await ensureVerificationAuditSchema();
    await ensureIdentityVerificationOperationSchema();

    const deleteReason = String(req.body?.delete_reason || req.body?.reason || req.body?.note || '').trim();

    if (!deleteReason) {
      return res.status(400).json({ message: 'A delete reason is required' });
    }

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT id, full_name, email, user_type, identity_document_type, nationality,
              identity_verified, identity_verification_status, passport_photo_url,
              identity_verified_at, identity_verified_by
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type <> 'super_admin'
         AND identity_verification_status = 'rejected'
       FOR UPDATE`,
      [userId]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Rejected verification record not found' });
    }

    const existingUser = existingResult.rows[0];

    const result = await db.query(
      `UPDATE users
       SET passport_photo_url = NULL,
           identity_verified = FALSE,
           identity_verification_status = NULL,
           identity_verified_by = NULL,
           identity_verified_at = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type <> 'super_admin'
         AND identity_verification_status = 'rejected'
       RETURNING id`,
      [userId]
    );

    if (!result.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Rejected verification record not found' });
    }

    await createIdentityVerificationOperation({
      userId: Number(userId),
      actorId: req.user.id,
      actorName: getAdminOperationActorName(req.user),
      eventType: 'identity_rejected_record_deleted',
      note: deleteReason,
      userSnapshot: existingUser,
      metadata: {
        old_status: existingUser.identity_verification_status,
        new_status: null,
      },
    });

    await db.query('COMMIT');
    await logAction(req.user.id, 'DELETE_REJECTED_VERIFICATION', 'user', userId);

    res.json({ success: true, message: 'Rejected verification deleted' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Failed to delete rejected verification' });
  }
};

// Backward-compatible route handler
// PATCH /api/super/verify/:userId
const verifyUser = approveIdentityVerification;

// GET /api/super/admins/performance
const getAdminPerformance = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();
    await ensureAdminAccountOperationSchema();

    const { rows } = await db.query(
      `SELECT
         a.id,
         a.full_name,
         a.email,
         a.user_type,
         a.assigned_state,
         a.assigned_city,
         a.is_active,
         a.account_suspended_reason,
         a.created_at,
         COUNT(v.id)::INT AS credentials_verified_count,
         MAX(v.identity_verified_at) AS last_verification_at,
         COALESCE(al7d.action_count, 0)::INT AS actions_7d,
         COALESCE(al30d.action_count, 0)::INT AS actions_30d,
         COALESCE(al7d.properties_approved, 0)::INT AS properties_approved_7d,
         COALESCE(al30d.properties_approved, 0)::INT AS properties_approved_30d,
         COALESCE(al7d.applications_processed, 0)::INT AS applications_processed_7d,
         COALESCE(al30d.applications_processed, 0)::INT AS applications_processed_30d,
         COALESCE(al7d.reports_resolved, 0)::INT AS reports_resolved_7d,
         COALESCE(al30d.reports_resolved, 0)::INT AS reports_resolved_30d,
         al7d.last_action_at,
         COALESCE(ops.operations, '[]'::json) AS account_operations
       FROM users a
       LEFT JOIN users v
         ON v.identity_verified_by = a.id
         AND v.identity_verified = TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::INT AS action_count,
           COUNT(*) FILTER (WHERE action IN ('UNLIST_PROPERTY','FEATURE_PROPERTY','UNFEATURE_PROPERTY','APPROVE_PROPERTY','REJECT_PROPERTY','RELIST_PROPERTY'))::INT AS properties_approved,
           COUNT(*) FILTER (WHERE action IN ('APPROVE_APPLICATION','REJECT_APPLICATION'))::INT AS applications_processed,
           COUNT(*) FILTER (WHERE action IN ('RESOLVE_REPORT','REPORT_RESOLVED'))::INT AS reports_resolved,
           MAX(created_at) AS last_action_at
         FROM audit_logs
         WHERE actor_id = a.id
           AND created_at >= CURRENT_DATE - INTERVAL '7 days'
       ) al7d ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::INT AS action_count,
           COUNT(*) FILTER (WHERE action IN ('UNLIST_PROPERTY','FEATURE_PROPERTY','UNFEATURE_PROPERTY','APPROVE_PROPERTY','REJECT_PROPERTY','RELIST_PROPERTY'))::INT AS properties_approved,
           COUNT(*) FILTER (WHERE action IN ('APPROVE_APPLICATION','REJECT_APPLICATION'))::INT AS applications_processed,
           COUNT(*) FILTER (WHERE action IN ('RESOLVE_REPORT','REPORT_RESOLVED'))::INT AS reports_resolved
         FROM audit_logs
         WHERE actor_id = a.id
           AND created_at >= CURRENT_DATE - INTERVAL '30 days'
       ) al30d ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM admin_account_operations
           WHERE admin_user_id = a.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       WHERE (
         a.user_type IN ('super_admin', 'admin', 'lga_admin', 'lga_support_admin', 'lga_financial_admin', 'lga_transportation_admin',
                         'state_transportation_admin', 'super_transportation_admin',
                         'lga_fumigation_admin', 'state_fumigation_admin', 'super_fumigation_admin',
                         'state_admin', 'financial_admin', 'lawyer',
                         'state_financial_admin', 'state_support_admin', 'super_financial_admin', 'super_support_admin',
                         'state_lawyer', 'super_lawyer', 'recruitment_admin', 'fumigation_admin', 'transportation_admin')
         OR a.user_type LIKE 'state_%'
         OR a.user_type LIKE 'super_%'
       )
         AND a.deleted_at IS NULL
       GROUP BY a.id, a.full_name, a.email, a.user_type, a.assigned_state, a.assigned_city, a.is_active, a.account_suspended_reason, a.created_at, al7d.action_count, al7d.properties_approved, al7d.applications_processed, al7d.reports_resolved, al7d.last_action_at, al30d.action_count, al30d.properties_approved, al30d.applications_processed, al30d.reports_resolved, ops.operations
       ORDER BY COALESCE(al7d.action_count, 0) DESC, a.created_at DESC`
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load admin performance' });
  }
};

// GET /api/super/admins/:adminId/state-users
const getAdminStateUsers = async (req, res) => {
  const { adminId } = req.params;

  try {
    const adminResult = await db.query(
      `SELECT id, full_name, email, user_type, assigned_state
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type LIKE 'state_%'
       LIMIT 1`,
      [adminId]
    );

    if (!adminResult.rows.length) {
      return res.status(404).json({ success: false, message: 'State admin not found' });
    }

    const admin = adminResult.rows[0];
    const assignedState = String(admin.assigned_state || '').trim();

    if (!assignedState) {
      return res.status(400).json({ success: false, message: 'Selected state admin has no assigned state' });
    }

    const usersResult = await db.query(
      `SELECT DISTINCT
         u.id,
         u.full_name,
         u.email,
         u.phone,
         u.user_type,
         u.created_at
       FROM users u
       WHERE u.deleted_at IS NULL
         AND u.user_type IN ('tenant', 'landlord')
         AND (
           (
             u.user_type = 'landlord'
             AND EXISTS (
               SELECT 1
               FROM properties p
               LEFT JOIN states s ON s.id = p.state_id
               WHERE (p.user_id = u.id OR p.landlord_id = u.id)
                 AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
             )
           )
           OR
           (
             u.user_type = 'tenant'
             AND EXISTS (
               SELECT 1
               FROM applications a
               JOIN properties p ON p.id = a.property_id
               LEFT JOIN states s ON s.id = p.state_id
               WHERE a.tenant_id = u.id
                 AND LOWER(TRIM(s.state_name)) = LOWER(TRIM($1))
             )
           )
         )
       ORDER BY u.user_type ASC, u.full_name ASC`,
      [assignedState]
    );

    const users = usersResult.rows;
    const summary = {
      total: users.length,
      tenants: users.filter((u) => u.user_type === 'tenant').length,
      landlords: users.filter((u) => u.user_type === 'landlord').length,
    };

    res.json({
      success: true,
      data: {
        admin,
        assigned_state: assignedState,
        summary,
        users,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load state users' });
  }
};

const updateAdminJurisdiction = async (req, res) => {
  try {
    await ensureAdminAccountOperationSchema();

    const adminId = req.params.id;
    const normalizedState = String(req.body?.assigned_state || '').trim();
    const normalizedCity = String(req.body?.assigned_city || '').trim();
    const reason = String(req.body?.reason || req.body?.note || '').trim();

    if (!reason) {
      return res.status(400).json({ success: false, message: 'A jurisdiction change reason is required' });
    }

    const targetResult = await db.query(
      `SELECT id, full_name, email, user_type, assigned_state, assigned_city, is_active
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [adminId]
    );

    if (!targetResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const targetAdmin = targetResult.rows[0];
    const targetRole = String(targetAdmin.user_type || '');

    if (targetRole === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Super admin jurisdiction cannot be edited' });
    }

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

    if (stateBoundRoles.has(targetRole) && !normalizedState) {
      return res.status(400).json({
        success: false,
        message: 'Assigned state is required for this admin role',
      });
    }

    if (['admin', 'lga_admin', 'lga_support_admin', 'lga_financial_admin', 'lawyer', 'lga_transportation_admin', 'lga_fumigation_admin'].includes(targetRole) && !normalizedCity) {
      return res.status(400).json({
        success: false,
        message: 'Assigned local government is required for this LGA role',
      });
    }

    const updateResult = await db.query(
      `UPDATE users
       SET assigned_state = $2,
           assigned_city = $3,
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING id, full_name, email, user_type, assigned_state, assigned_city`,
      [
        adminId,
        normalizedState || null,
        ['admin', 'lga_admin', 'lga_support_admin', 'lga_financial_admin', 'lawyer', 'lga_transportation_admin', 'lga_fumigation_admin'].includes(targetRole) ? normalizedCity : null,
      ]
    );

    await logAction(req.user.id, 'UPDATE_ADMIN_JURISDICTION', 'user', adminId);

    await createAdminAccountOperation({
      adminUserId: Number(adminId),
      actorId: req.user.id,
      actorName: getAdminOperationActorName(req.user),
      eventType: 'admin_jurisdiction_updated',
      note: reason,
      adminSnapshot: targetAdmin,
      metadata: {
        old_assigned_state: targetAdmin.assigned_state,
        old_assigned_city: targetAdmin.assigned_city,
        new_assigned_state: updateResult.rows[0].assigned_state,
        new_assigned_city: updateResult.rows[0].assigned_city,
      },
    });

    res.json({
      success: true,
      message: 'Admin jurisdiction updated successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    console.error('Update admin jurisdiction error:', err);
    res.status(500).json({ success: false, message: 'Failed to update admin jurisdiction' });
  }
};

// ================= PROPERTIES =================

const ensurePropertyOperationSchema = async () => {
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
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_property_operations_property
      ON property_operations(property_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_property_operations_created
      ON property_operations(created_at DESC)
  `);
};

const createPropertyOperation = async ({
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
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

// GET /api/super/properties
const getAllProperties = async (req, res) => {
  try {
    await ensurePropertyOperationSchema();

    const { rows } = await db.query(
      `SELECT p.*, u.full_name AS landlord_name,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM properties p
       LEFT JOIN users u ON u.id = COALESCE(p.landlord_id, p.user_id)
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM property_operations
           WHERE property_id = p.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       ORDER BY p.created_at DESC`
    );

    res.json({ success: true, properties: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load properties' });
  }
};

// PATCH /api/super/properties/:id/unlist
const unlistProperty = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensurePropertyOperationSchema();

    if (!reason) {
      return res.status(400).json({ message: 'An unlist reason is required' });
    }

    const result = await db.query(
      `UPDATE properties
       SET is_available = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, landlord_id, user_id, is_available, featured`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Property not found' });
    }

    await db.query(
      'DELETE FROM saved_properties WHERE property_id = $1',
      [id]
    );

    await createPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_unlisted',
      note: reason,
      metadata: result.rows[0],
    });

    await logAction(req.user.id, 'UNLIST_PROPERTY', 'property', id);

    res.json({ success: true, message: 'Property unlisted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to unlist property' });
  }
};

// PATCH /api/super/properties/:id/feature
const featureProperty = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensurePropertyOperationSchema();

    if (!reason) {
      return res.status(400).json({ message: 'A feature reason is required' });
    }

    const result = await db.query(
      `UPDATE properties
       SET featured = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, landlord_id, user_id, is_available, featured`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Property not found' });
    }

    await createPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_featured',
      note: reason,
      metadata: result.rows[0],
    });

    await logAction(req.user.id, 'FEATURE_PROPERTY', 'property', id);

    res.json({ success: true, message: 'Property marked as featured' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to feature property' });
  }
};

// PATCH /api/super/properties/:id/unfeature
const unfeatureProperty = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensurePropertyOperationSchema();

    if (!reason) {
      return res.status(400).json({ message: 'An unfeature reason is required' });
    }

    const result = await db.query(
      `UPDATE properties
       SET featured = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, landlord_id, user_id, is_available, featured`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Property not found' });
    }

    await createPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_unfeatured',
      note: reason,
      metadata: result.rows[0],
    });

    await logAction(req.user.id, 'UNFEATURE_PROPERTY', 'property', id);

    res.json({ success: true, message: 'Property removed from featured' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to unfeature property' });
  }
};

// ================= AUDIT LOGS =================

// GET /api/super/logs
const getAuditLogs = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT l.*, u.full_name AS actor_name
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       ORDER BY l.created_at DESC
       LIMIT 500`
    );

    res.json({ success: true, logs: rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load logs' });
  }
};

// GET /api/super/admin-monitor
// Returns recent admin actions from audit_logs with full actor details,
// specifically filtering to show actions performed by admin users.
const getAdminMonitor = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    // Admin user types we want to monitor
    const adminTypes = [
      'admin', 'lga_admin', 'super_admin',
      'financial_admin', 'lga_financial_admin', 'super_financial_admin',
      'state_admin', 'state_financial_admin',
      'lga_support_admin', 'state_support_admin', 'super_support_admin',
      'recruitment_admin',
      'fumigation_admin', 'lga_fumigation_admin', 'state_fumigation_admin', 'super_fumigation_admin',
      'transportation_admin', 'lga_transportation_admin', 'state_transportation_admin', 'super_transportation_admin',
    ];

    const { rows } = await db.query(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.metadata, l.ip_address, l.created_at,
              u.id AS actor_id, u.full_name AS actor_name, u.email AS actor_email, u.user_type AS actor_role
       FROM audit_logs l
       INNER JOIN users u ON u.id = l.actor_id
       WHERE u.user_type = ANY($1::text[])
       ORDER BY l.created_at DESC
       LIMIT $2 OFFSET $3`,
      [adminTypes, limit, offset]
    );

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs l
       INNER JOIN users u ON u.id = l.actor_id
       WHERE u.user_type = ANY($1::text[])`,
      [adminTypes]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(countResult.rows[0].total) || 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error('Get admin monitor error:', err);
    res.status(500).json({ message: 'Failed to load admin activity' });
  }
};

// ================= ANALYTICS =================

// GET /api/super/analytics
const getAnalytics = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const [users, properties, apps, verified, byState, userGrowth] = await Promise.all([
      db.query(
        `SELECT user_type AS role, COUNT(*)::INT AS count
         FROM users
         WHERE deleted_at IS NULL
         GROUP BY user_type`
      ),
      db.query(`SELECT COUNT(*) FROM properties`),
      db.query(`SELECT COUNT(*) FROM applications`),
      db.query(
        `SELECT COUNT(*)
         FROM users
         WHERE identity_verified = TRUE
           AND deleted_at IS NULL`
      ),
      db.query(
        `SELECT
           COALESCE(s.state_name, 'Unknown') AS state,
           COUNT(*)::INT AS count
         FROM properties p
         LEFT JOIN states s ON s.id = p.state_id
         GROUP BY COALESCE(s.state_name, 'Unknown')
         ORDER BY COUNT(*) DESC`
      ),
      db.query(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
             date_trunc('month', CURRENT_DATE),
             INTERVAL '1 month'
           ) AS month_start
         )
         SELECT
           TO_CHAR(m.month_start, 'Mon YYYY') AS month,
           COALESCE(COUNT(u.id), 0)::INT AS users
         FROM months m
         LEFT JOIN users u
           ON date_trunc('month', u.created_at) = m.month_start
          AND u.deleted_at IS NULL
         GROUP BY m.month_start
         ORDER BY m.month_start`
      )
    ]);

    res.json({
      success: true,
      data: {
        usersByRole: users.rows,
        totalProperties: Number(properties.rows[0].count),
        totalApplications: Number(apps.rows[0].count),
        verifiedUsers: Number(verified.rows[0].count),
        propertiesByState: byState.rows,
        userGrowth: userGrowth.rows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
};

// ================= REPORTS =================

const ensureReportOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS report_operations (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      previous_status VARCHAR(50),
      new_status VARCHAR(50),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_report_operations_report
      ON report_operations(report_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_report_operations_created
      ON report_operations(created_at DESC)
  `);
};

const createReportOperation = async ({
  reportId,
  actor,
  eventType,
  note,
  previousStatus,
  newStatus,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO report_operations (
       report_id, actor_id, actor_name, event_type, note, previous_status, new_status, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      reportId,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      previousStatus || null,
      newStatus || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

// GET /api/super/reports
const getReports = async (req, res) => {
  try {
    await ensureReportOperationSchema();

    const { rows } = await db.query(
      `SELECT r.*, u.full_name AS reporter_name,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, previous_status, new_status, metadata, created_at
           FROM report_operations
           WHERE report_id = r.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       ORDER BY r.created_at DESC`
    );

    res.json({ success: true, reports: rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load reports' });
  }
};

// PATCH /api/super/reports/:id
const updateReportStatus = async (req, res) => {
  const { id } = req.params;
  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = String(req.body?.note || req.body?.reason || '').trim();

  try {
    await ensureReportOperationSchema();

    if (!['pending', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid report status' });
    }

    if ((status === 'resolved' || status === 'dismissed') && !note) {
      return res.status(400).json({ message: 'An investigation note is required' });
    }

    const existing = await db.query(`SELECT * FROM reports WHERE id = $1`, [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const previousStatus = existing.rows[0].status;

    await db.query(`UPDATE reports SET status = $1 WHERE id = $2`, [status, id]);

    await createReportOperation({
      reportId: Number(id),
      actor: req.user,
      eventType: status === 'resolved' ? 'report_resolved' : status === 'dismissed' ? 'report_dismissed' : 'report_reopened',
      note,
      previousStatus,
      newStatus: status,
      metadata: {
        target_type: existing.rows[0].target_type,
        target_id: existing.rows[0].target_id,
      },
    });

    await logAction(req.user.id, `REPORT_${status.toUpperCase()}`, 'report', id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update report' });
  }
};

// PATCH /api/super/reports/:reportId/resolve
const resolveReport = async (req, res) => {
  const { reportId } = req.params;
  const note = String(req.body?.note || req.body?.reason || '').trim();

  try {
    await ensureReportOperationSchema();

    if (!note) {
      return res.status(400).json({ message: 'An investigation note is required' });
    }

    const existing = await db.query(`SELECT * FROM reports WHERE id = $1`, [reportId]);
    if (!existing.rows.length) {
      return res.status(404).json({ message: 'Report not found' });
    }

    await db.query(`UPDATE reports SET status = 'resolved' WHERE id = $1`, [reportId]);

    await createReportOperation({
      reportId: Number(reportId),
      actor: req.user,
      eventType: 'report_resolved',
      note,
      previousStatus: existing.rows[0].status,
      newStatus: 'resolved',
      metadata: {
        target_type: existing.rows[0].target_type,
        target_id: existing.rows[0].target_id,
      },
    });

    await logAction(req.user.id, 'RESOLVE_REPORT', 'report', reportId);
    res.json({ success: true, message: 'Report resolved' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to resolve report' });
  }
};

// ================= BROADCAST =================

const getBroadcasts = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.*, u.full_name AS sender_name
       FROM broadcasts b
       LEFT JOIN users u ON u.id = b.sender_id
       ORDER BY b.created_at DESC`
    );

    res.json({ success: true, broadcasts: rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load broadcasts' });
  }
};

const createBroadcast = async (req, res) => {
  const { title, message, target_role } = req.body;

  try {
    await db.query(
      `INSERT INTO broadcasts (sender_id, target_role, title, message)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, target_role || null, title, message]
    );

    await logAction(req.user.id, 'CREATE_BROADCAST', 'broadcast', null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send broadcast' });
  }
};

// ================= PLATFORM LAWYERS =================

const getPlatformLawyerActorName = (user = {}) =>
  user.full_name || user.name || user.email || `Admin #${user.id || 'unknown'}`;

const createPlatformLawyerApplicationOperation = async ({
  applicationId,
  adminId,
  actorName,
  eventType,
  note = null,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO platform_lawyer_application_operations (
       application_id,
       admin_id,
       actor_name,
       event_type,
       note,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      applicationId,
      adminId || null,
      actorName || null,
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const getPlatformLawyerManagementData = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const [entriesResult, applicationsResult, broadcastsResult] = await Promise.all([
      db.query(
        `SELECT
           pl.*,
           COALESCE(NULLIF(u.full_name, ''), pl.full_name) AS display_name,
           COALESCE(NULLIF(u.email, ''), pl.email) AS display_email,
           COALESCE(NULLIF(u.phone, ''), pl.phone) AS display_phone,
           COALESCE(NULLIF(u.nationality, ''), pl.nationality, 'Nigeria') AS display_nationality,
           COALESCE(NULLIF(u.chamber_name, ''), pl.chamber_name) AS display_chamber_name,
           COALESCE(NULLIF(u.chamber_phone, ''), pl.chamber_phone) AS display_chamber_phone,
           COALESCE(u.identity_verified, FALSE) AS identity_verified,
           li.id AS latest_invite_id,
           li.status AS latest_invite_status,
           li.expires_at AS latest_invite_expires_at,
           li.accepted_at AS latest_invite_accepted_at,
           li.last_sent_at AS latest_invite_last_sent_at,
           li.resent_count AS latest_invite_resent_count
         FROM platform_lawyers pl
         LEFT JOIN users u ON u.id = pl.lawyer_user_id
         LEFT JOIN LATERAL (
           SELECT pli.id, pli.status, pli.expires_at, pli.accepted_at, pli.last_sent_at, pli.resent_count
           FROM platform_lawyer_invites pli
           WHERE pli.platform_lawyer_id = pl.id
           ORDER BY pli.created_at DESC
           LIMIT 1
         ) li ON TRUE
         ORDER BY pl.is_active DESC, pl.created_at DESC`
      ),
      db.query(
        `SELECT
           pla.*,
           u.full_name,
           u.email,
           u.phone,
           u.nationality,
           u.chamber_name,
           u.chamber_phone,
           COALESCE(u.identity_verified, FALSE) AS identity_verified,
           reviewer.full_name AS reviewed_by_name,
           b.title AS broadcast_title,
           pl.id AS platform_lawyer_id,
           pl.is_active AS directory_active
         FROM platform_lawyer_applications pla
         JOIN users u ON u.id = pla.lawyer_user_id
         LEFT JOIN users reviewer ON reviewer.id = pla.reviewed_by
         LEFT JOIN broadcasts b ON b.id = pla.broadcast_id
         LEFT JOIN platform_lawyers pl ON pl.application_id = pla.id
         ORDER BY
           CASE pla.status
             WHEN 'pending' THEN 0
             WHEN 'approved' THEN 1
             ELSE 2
           END,
           pla.applied_at DESC`
      ),
      db.query(
        `SELECT b.*, u.full_name AS sender_name
         FROM broadcasts b
         LEFT JOIN users u ON u.id = b.sender_id
         WHERE b.broadcast_type = $1
         ORDER BY b.created_at DESC
         LIMIT 20`,
        [PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE]
      ),
    ]);

    const applicationIds = applicationsResult.rows.map((application) => application.id);
    let operationsByApplication = {};

    if (applicationIds.length) {
      const operationsResult = await db.query(
        `SELECT
           id,
           application_id,
           admin_id,
           actor_name,
           event_type,
           note,
           metadata,
           created_at
         FROM platform_lawyer_application_operations
         WHERE application_id = ANY($1::int[])
         ORDER BY created_at DESC, id DESC`,
        [applicationIds]
      );

      operationsByApplication = operationsResult.rows.reduce((acc, operation) => {
        if (!acc[operation.application_id]) {
          acc[operation.application_id] = [];
        }
        acc[operation.application_id].push(operation);
        return acc;
      }, {});
    }

    res.json({
      success: true,
      data: {
        entries: entriesResult.rows,
        applications: applicationsResult.rows.map((application) => ({
          ...application,
          review_history: operationsByApplication[application.id] || [],
        })),
        recruitment_broadcasts: broadcastsResult.rows,
        invite_expiry_hours: PLATFORM_LAWYER_INVITE_EXPIRY_HOURS,
      },
    });
  } catch (error) {
    console.error('Get platform lawyer management data error:', error);
    res.status(500).json({ message: 'Failed to load platform lawyers' });
  }
};

const createManualPlatformLawyer = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const fullName = String(req.body.full_name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').replace(/\s+/g, '');
    const nationality = String(req.body.nationality || 'Nigeria').trim() || 'Nigeria';
    const chamberName = String(req.body.chamber_name || '').trim();
    const chamberPhone = String(req.body.chamber_phone || '').replace(/\s+/g, '');
    const isActive = req.body.is_active !== false;

    if (!fullName || !email || !phone || !chamberName || !chamberPhone) {
      return res.status(400).json({
        message: 'Full name, email, phone, chamber name, and chamber phone are required',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid lawyer email address' });
    }

    const duplicateEntry = await db.query(
      `SELECT id
       FROM platform_lawyers
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    if (duplicateEntry.rows.length) {
      return res.status(409).json({
        message: 'A platform lawyer record already exists for this email',
      });
    }

    const existingUserResult = await db.query(
      `SELECT id, user_type
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (
      existingUserResult.rows.length &&
      existingUserResult.rows[0].user_type !== 'lawyer'
    ) {
      return res.status(409).json({
        message: 'This email already belongs to a non-lawyer account',
      });
    }

    const lawyerUserId = existingUserResult.rows[0]?.id || null;

    const entryResult = await db.query(
      `INSERT INTO platform_lawyers (
         source_type,
         lawyer_user_id,
         full_name,
         email,
         phone,
         nationality,
         chamber_name,
         chamber_phone,
         is_active,
         created_by,
         updated_by
       )
       VALUES ('manual', $1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [
        lawyerUserId,
        fullName,
        email,
        phone,
        nationality,
        chamberName,
        chamberPhone,
        isActive,
        req.user.id,
      ]
    );

    const entry = entryResult.rows[0];
    const invite = await createPlatformLawyerInvite({
      platformLawyerId: entry.id,
      lawyerEmail: email,
      createdBy: req.user.id,
    });

    const emailResult = await sendPlatformLawyerInviteEmail({
      email,
      inviteUrl: invite.invite_url,
      expiresInHours: invite.expires_in_hours,
      assignedByName: req.user.full_name || 'RentalHub NG',
    });

    await logAction(req.user.id, 'CREATE_PLATFORM_LAWYER', 'platform_lawyer', entry.id);

    res.status(201).json({
      success: true,
      data: {
        entry,
        invite: {
          ...invite,
          email_sent: !!emailResult?.success,
          email_error: emailResult?.success ? null : emailResult?.error || 'Invite email failed',
        },
      },
    });
  } catch (error) {
    console.error('Create manual platform lawyer error:', error);
    res.status(500).json({ message: 'Failed to create platform lawyer record' });
  }
};

const resendManualPlatformLawyerInvite = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const entryResult = await db.query(
      `SELECT id, source_type, email
       FROM platform_lawyers
       WHERE id = $1
       LIMIT 1`,
      [req.params.lawyerId]
    );

    if (!entryResult.rows.length) {
      return res.status(404).json({ message: 'Platform lawyer record not found' });
    }

    const entry = entryResult.rows[0];

    if (entry.source_type !== 'manual') {
      return res.status(400).json({
        message: 'Only manually entered lawyers can receive setup invites from here',
      });
    }

    const invite = await createPlatformLawyerInvite({
      platformLawyerId: entry.id,
      lawyerEmail: entry.email,
      createdBy: req.user.id,
    });

    const emailResult = await sendPlatformLawyerInviteEmail({
      email: entry.email,
      inviteUrl: invite.invite_url,
      expiresInHours: invite.expires_in_hours,
      assignedByName: req.user.full_name || 'RentalHub NG',
    });

    await logAction(req.user.id, 'RESEND_PLATFORM_LAWYER_INVITE', 'platform_lawyer', entry.id);

    res.json({
      success: true,
      data: {
        invite: {
          ...invite,
          email_sent: !!emailResult?.success,
          email_error: emailResult?.success ? null : emailResult?.error || 'Invite email failed',
        },
      },
      message: emailResult?.success
        ? 'Platform lawyer invite resent'
        : 'Platform lawyer record updated, but the invite email failed to send',
    });
  } catch (error) {
    console.error('Resend manual platform lawyer invite error:', error);
    res.status(500).json({ message: 'Failed to resend platform lawyer invite' });
  }
};

const updatePlatformLawyer = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const entryResult = await db.query(
      `SELECT *
       FROM platform_lawyers
       WHERE id = $1
       LIMIT 1`,
      [req.params.lawyerId]
    );

    if (!entryResult.rows.length) {
      return res.status(404).json({ message: 'Platform lawyer record not found' });
    }

    const entry = entryResult.rows[0];
    const nextIsActive =
      typeof req.body.is_active === 'boolean' ? req.body.is_active : entry.is_active;

    if (entry.source_type !== 'manual') {
      const result = await db.query(
        `UPDATE platform_lawyers
         SET is_active = $2,
             updated_by = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [entry.id, nextIsActive, req.user.id]
      );

      await logAction(req.user.id, 'UPDATE_PLATFORM_LAWYER', 'platform_lawyer', entry.id);

      return res.json({ success: true, data: result.rows[0] });
    }

    const fullName = String(req.body.full_name || entry.full_name || '').trim();
    const email = String(req.body.email || entry.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || entry.phone || '').replace(/\s+/g, '');
    const nationality = String(req.body.nationality || entry.nationality || 'Nigeria').trim() || 'Nigeria';
    const chamberName = String(req.body.chamber_name || entry.chamber_name || '').trim();
    const chamberPhone = String(req.body.chamber_phone || entry.chamber_phone || '').replace(/\s+/g, '');

    if (!fullName || !email || !phone || !chamberName || !chamberPhone) {
      return res.status(400).json({
        message: 'Full name, email, phone, chamber name, and chamber phone are required',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid lawyer email address' });
    }

    const duplicateEntry = await db.query(
      `SELECT id
       FROM platform_lawyers
       WHERE LOWER(email) = LOWER($1)
         AND id <> $2
       LIMIT 1`,
      [email, entry.id]
    );

    if (duplicateEntry.rows.length) {
      return res.status(409).json({
        message: 'Another platform lawyer record already uses this email',
      });
    }

    const existingUserResult = await db.query(
      `SELECT id, user_type
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (
      existingUserResult.rows.length &&
      existingUserResult.rows[0].user_type !== 'lawyer'
    ) {
      return res.status(409).json({
        message: 'This email already belongs to a non-lawyer account',
      });
    }

    const lawyerUserId = existingUserResult.rows[0]?.id || entry.lawyer_user_id || null;

    const result = await db.query(
      `UPDATE platform_lawyers
       SET lawyer_user_id = $2,
           full_name = $3,
           email = $4,
           phone = $5,
           nationality = $6,
           chamber_name = $7,
           chamber_phone = $8,
           is_active = $9,
           updated_by = $10,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        entry.id,
        lawyerUserId,
        fullName,
        email,
        phone,
        nationality,
        chamberName,
        chamberPhone,
        nextIsActive,
        req.user.id,
      ]
    );

    await logAction(req.user.id, 'UPDATE_PLATFORM_LAWYER', 'platform_lawyer', entry.id);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update platform lawyer error:', error);
    res.status(500).json({ message: 'Failed to update platform lawyer' });
  }
};

const deletePlatformLawyer = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const result = await db.query(
      `DELETE FROM platform_lawyers
       WHERE id = $1
         AND source_type = 'manual'
       RETURNING id`,
      [req.params.lawyerId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: 'Manual platform lawyer record not found',
      });
    }

    await logAction(req.user.id, 'DELETE_PLATFORM_LAWYER', 'platform_lawyer', req.params.lawyerId);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete platform lawyer error:', error);
    res.status(500).json({ message: 'Failed to delete platform lawyer' });
  }
};

const createPlatformLawyerRecruitmentBroadcast = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();

    if (!title || !message) {
      return res.status(400).json({
        message: 'Title and message are required',
      });
    }

    const result = await db.query(
      `INSERT INTO broadcasts (sender_id, target_role, title, message, broadcast_type)
       VALUES ($1, 'lawyer', $2, $3, $4)
       RETURNING *`,
      [req.user.id, title, message, PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE]
    );

    await logAction(req.user.id, 'CREATE_PLATFORM_LAWYER_BROADCAST', 'broadcast', result.rows[0].id);

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create platform lawyer recruitment broadcast error:', error);
    res.status(500).json({ message: 'Failed to send lawyer recruitment broadcast' });
  }
};

const approvePlatformLawyerApplication = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const reviewNote = String(req.body.review_note || '').trim() || null;

    await db.query('BEGIN');

    const applicationResult = await db.query(
      `SELECT
         pla.*,
         u.full_name,
         u.email,
         u.phone,
         u.nationality,
         u.chamber_name,
         u.chamber_phone
       FROM platform_lawyer_applications pla
       JOIN users u ON u.id = pla.lawyer_user_id
       WHERE pla.id = $1
       FOR UPDATE`,
      [req.params.applicationId]
    );

    if (!applicationResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    const application = applicationResult.rows[0];
    const previousStatus = application.status;

    let platformLawyerResult = await db.query(
      `SELECT *
       FROM platform_lawyers
       WHERE lawyer_user_id = $1
          OR LOWER(email) = LOWER($2)
       ORDER BY CASE source_type WHEN 'manual' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [application.lawyer_user_id, application.email]
    );

    let platformLawyer;

    if (platformLawyerResult.rows.length) {
      platformLawyer = (
        await db.query(
          `UPDATE platform_lawyers
           SET lawyer_user_id = $2,
               application_id = $3,
               full_name = $4,
               email = $5,
               phone = $6,
               nationality = $7,
               chamber_name = $8,
               chamber_phone = $9,
               is_active = TRUE,
               updated_by = $10,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [
            platformLawyerResult.rows[0].id,
            application.lawyer_user_id,
            application.id,
            application.full_name,
            application.email,
            application.phone,
            application.nationality || 'Nigeria',
            application.chamber_name,
            application.chamber_phone,
            req.user.id,
          ]
        )
      ).rows[0];
    } else {
      platformLawyer = (
        await db.query(
          `INSERT INTO platform_lawyers (
             source_type,
             lawyer_user_id,
             application_id,
             full_name,
             email,
             phone,
             nationality,
             chamber_name,
             chamber_phone,
             is_active,
             created_by,
             updated_by
           )
           VALUES ('application', $1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $9)
           RETURNING *`,
          [
            application.lawyer_user_id,
            application.id,
            application.full_name,
            application.email,
            application.phone,
            application.nationality || 'Nigeria',
            application.chamber_name,
            application.chamber_phone,
            req.user.id,
          ]
        )
      ).rows[0];
    }

    await db.query(
      `UPDATE platform_lawyer_applications
       SET status = 'approved',
           review_note = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        application.id,
        reviewNote,
        req.user.id,
      ]
    );

    await createPlatformLawyerApplicationOperation({
      applicationId: application.id,
      adminId: req.user.id,
      actorName: getPlatformLawyerActorName(req.user),
      eventType: 'application_approved',
      note: reviewNote,
      metadata: {
        old_status: previousStatus,
        new_status: 'approved',
        platform_lawyer_id: platformLawyer.id,
      },
    });

    await db.query('COMMIT');
    await logAction(req.user.id, 'APPROVE_PLATFORM_LAWYER_APPLICATION', 'platform_lawyer_application', application.id);

    res.json({
      success: true,
      data: {
        application_id: application.id,
        platform_lawyer_id: platformLawyer.id,
      },
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Approve platform lawyer application error:', error);
    res.status(500).json({ message: 'Failed to approve lawyer application' });
  }
};

const rejectPlatformLawyerApplication = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const reviewNote = String(req.body.review_note || '').trim();

    if (!reviewNote) {
      return res.status(400).json({ message: 'A rejection reason is required' });
    }

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT id, status
       FROM platform_lawyer_applications
       WHERE id = $1
       FOR UPDATE`,
      [req.params.applicationId]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    const previousStatus = existingResult.rows[0].status;

    const applicationResult = await db.query(
      `UPDATE platform_lawyer_applications
       SET status = 'rejected',
           review_note = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [
        req.params.applicationId,
        reviewNote,
        req.user.id,
      ]
    );

    if (!applicationResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    await db.query(
      `UPDATE platform_lawyers
       SET is_active = FALSE,
           updated_by = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE application_id = $1
         AND source_type = 'application'`,
      [req.params.applicationId, req.user.id]
    );

    await createPlatformLawyerApplicationOperation({
      applicationId: Number(req.params.applicationId),
      adminId: req.user.id,
      actorName: getPlatformLawyerActorName(req.user),
      eventType: 'application_rejected',
      note: reviewNote,
      metadata: {
        old_status: previousStatus,
        new_status: 'rejected',
      },
    });

    await db.query('COMMIT');

    await logAction(req.user.id, 'REJECT_PLATFORM_LAWYER_APPLICATION', 'platform_lawyer_application', req.params.applicationId);

    res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Reject platform lawyer application error:', error);
    res.status(500).json({ message: 'Failed to reject lawyer application' });
  }
};

const getPlatformAgentManagementData = async (req, res) => {
  try {
    await ensurePlatformAgentSchema();

    const { rows } = await db.query(
      `SELECT
         pa.*,
         pa.agent_user_id AS linked_user_id,
         COALESCE(NULLIF(u.full_name, ''), pa.full_name) AS display_name,
         COALESCE(NULLIF(u.email, ''), pa.email) AS display_email,
         COALESCE(NULLIF(u.phone, ''), pa.phone) AS display_phone,
         COALESCE(NULLIF(u.nationality, ''), pa.nationality, 'Nigeria') AS display_nationality,
         creator.full_name AS created_by_name,
         updater.full_name AS updated_by_name
       FROM platform_agents pa
       LEFT JOIN users u ON u.id = pa.agent_user_id
       LEFT JOIN users creator ON creator.id = pa.created_by
       LEFT JOIN users updater ON updater.id = pa.updated_by
       ORDER BY pa.created_at DESC`
    );

    const agentIds = rows.map((entry) => entry.id);
    let operationsByAgent = {};

    if (agentIds.length) {
      const operationsResult = await db.query(
        `SELECT
           id,
           agent_id,
           admin_id,
           actor_name,
           event_type,
           note,
           agent_snapshot,
           metadata,
           created_at
         FROM platform_agent_operations
         WHERE agent_id = ANY($1::int[])
         ORDER BY created_at DESC, id DESC`,
        [agentIds]
      );

      operationsByAgent = operationsResult.rows.reduce((acc, operation) => {
        if (!acc[operation.agent_id]) {
          acc[operation.agent_id] = [];
        }
        acc[operation.agent_id].push(operation);
        return acc;
      }, {});
    }

    res.json({
      success: true,
      data: {
        entries: rows.map((entry) => ({
          ...entry,
          operations: operationsByAgent[entry.id] || [],
        })),
      },
    });
  } catch (error) {
    console.error('Get platform agent management data error:', error);
    res.status(500).json({ message: 'Failed to load platform agents' });
  }
};

const getPlatformAgentActorName = (user = {}) =>
  user.full_name || user.name || user.email || `Admin #${user.id || 'unknown'}`;

const createPlatformAgentOperation = async ({
  agentId = null,
  adminId,
  actorName,
  eventType,
  note = null,
  agentSnapshot = {},
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO platform_agent_operations (
       agent_id,
       admin_id,
       actor_name,
       event_type,
       note,
       agent_snapshot,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      agentId,
      adminId || null,
      actorName || null,
      eventType,
      note || null,
      JSON.stringify(agentSnapshot || {}),
      JSON.stringify(metadata || {}),
    ]
  );
};

const createManualPlatformAgent = async (req, res) => {
  try {
    await ensurePlatformAgentSchema();

    const fullName = String(req.body.full_name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const nationality = String(req.body.nationality || 'Nigeria').trim();
    const isActive = req.body.is_active !== false;

    if (!fullName || !email) {
      return res.status(400).json({ message: 'Full name and email are required' });
    }

    const userResult = await db.query(
      `SELECT id
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND user_type = 'agent'
         AND deleted_at IS NULL
       LIMIT 1`,
      [email]
    );
    const linkedUserId = userResult.rows[0]?.id || null;

    const duplicateResult = await db.query(
      `SELECT id
       FROM platform_agents
       WHERE LOWER(email) = LOWER($1)
          OR ($2::INTEGER IS NOT NULL AND agent_user_id = $2)
       LIMIT 1`,
      [email, linkedUserId]
    );

    if (duplicateResult.rows.length) {
      return res.status(409).json({ message: 'This platform agent already exists' });
    }

    const { rows } = await db.query(
      `INSERT INTO platform_agents (
         source_type, agent_user_id, full_name, email, phone, nationality,
         is_active, created_by, updated_by
       )
       VALUES ('manual', $1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [
        linkedUserId,
        fullName,
        email,
        phone || null,
        nationality || 'Nigeria',
        isActive,
        req.user.id,
      ]
    );

    await createPlatformAgentOperation({
      agentId: rows[0].id,
      adminId: req.user.id,
      actorName: getPlatformAgentActorName(req.user),
      eventType: 'agent_created',
      note: String(req.body.governance_note || '').trim() || null,
      agentSnapshot: rows[0],
      metadata: {
        source_type: rows[0].source_type,
        is_active: rows[0].is_active,
      },
    });

    await logAction(req.user.id, 'CREATE_PLATFORM_AGENT', 'platform_agent', rows[0].id);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Create platform agent error:', error);
    res.status(500).json({ message: 'Failed to create platform agent record' });
  }
};

const updatePlatformAgent = async (req, res) => {
  try {
    await ensurePlatformAgentSchema();

    const agentId = Number(req.params.agentId);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return res.status(400).json({ message: 'Invalid platform agent id' });
    }

    const nextActive = req.body.is_active !== false;
    const governanceNote = String(req.body.governance_note || '').trim();

    const existingResult = await db.query(
      `SELECT *
       FROM platform_agents
       WHERE id = $1`,
      [agentId]
    );

    if (!existingResult.rows.length) {
      return res.status(404).json({ message: 'Platform agent not found' });
    }

    const existing = existingResult.rows[0];

    if (existing.is_active && !nextActive && !governanceNote) {
      return res.status(400).json({ message: 'A deactivation reason is required' });
    }

    const result = await db.query(
      `UPDATE platform_agents
       SET is_active = $2,
           updated_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [agentId, nextActive, req.user.id]
    );

    const updated = result.rows[0];

    await createPlatformAgentOperation({
      agentId,
      adminId: req.user.id,
      actorName: getPlatformAgentActorName(req.user),
      eventType: nextActive ? 'agent_activated' : 'agent_deactivated',
      note: governanceNote || null,
      agentSnapshot: updated,
      metadata: {
        old_is_active: existing.is_active,
        new_is_active: updated.is_active,
      },
    });

    await logAction(req.user.id, 'UPDATE_PLATFORM_AGENT', 'platform_agent', agentId);

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update platform agent error:', error);
    res.status(500).json({ message: 'Failed to update platform agent record' });
  }
};

const deletePlatformAgent = async (req, res) => {
  try {
    await ensurePlatformAgentSchema();

    const agentId = Number(req.params.agentId);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return res.status(400).json({ message: 'Invalid platform agent id' });
    }

    const governanceNote = String(req.body.governance_note || '').trim();

    if (!governanceNote) {
      return res.status(400).json({ message: 'A deletion reason is required' });
    }

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT *
       FROM platform_agents
       WHERE id = $1
       FOR UPDATE`,
      [agentId]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Platform agent not found' });
    }

    const existing = existingResult.rows[0];

    await createPlatformAgentOperation({
      agentId,
      adminId: req.user.id,
      actorName: getPlatformAgentActorName(req.user),
      eventType: 'agent_deleted',
      note: governanceNote,
      agentSnapshot: existing,
      metadata: {
        source_type: existing.source_type,
        was_active: existing.is_active,
      },
    });

    const result = await db.query(
      `DELETE FROM platform_agents WHERE id = $1 RETURNING id`,
      [agentId]
    );

    if (!result.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Platform agent not found' });
    }

    await db.query('COMMIT');

    await logAction(req.user.id, 'DELETE_PLATFORM_AGENT', 'platform_agent', agentId);

    res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Delete platform agent error:', error);
    res.status(500).json({ message: 'Failed to delete platform agent record' });
  }
};

// Bulk actions
const bulkUserAction = async (req, res) => {
  const { ids, action } = req.body;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensureVerificationAuditSchema();
    await ensureAdminAccountOperationSchema();

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No users selected' });
    }

    let query;
    let params = [ids];
    let logActionName;

    switch (action) {
      case 'ban':
        if (!reason) {
          return res.status(400).json({ message: 'A bulk ban reason is required' });
        }
        query = `
          UPDATE users
          SET is_active = FALSE,
              account_suspended_reason = $2,
              account_suspended_at = NOW(),
              account_suspended_by = $3,
              updated_at = NOW()
          WHERE id = ANY($1)
            AND user_type <> 'super_admin'
            AND deleted_at IS NULL
          RETURNING id, full_name, email, user_type, is_active, account_suspended_reason
        `;
        params = [ids, reason, req.user.id];
        logActionName = 'BULK_BAN_USERS';
        break;
      case 'verify':
        query = `
          UPDATE users
          SET identity_verified = TRUE,
              identity_verification_status = 'verified',
              identity_verified_by = $2,
              identity_verified_at = NOW(),
              updated_at = NOW()
          WHERE id = ANY($1)
            AND user_type <> 'super_admin'
            AND passport_photo_url IS NOT NULL
            AND (nin IS NOT NULL OR international_passport_number IS NOT NULL)
        `;
        params = [ids, req.user.id];
        logActionName = 'BULK_VERIFY_USERS';
        break;
      case 'promote':
        query = `UPDATE users SET user_type = 'admin', updated_at = NOW() WHERE id = ANY($1) AND user_type <> 'super_admin'`;
        logActionName = 'BULK_PROMOTE_USERS';
        break;
      default:
        return res.status(400).json({ message: 'Invalid action' });
    }

    const actionResult = await db.query(query, params);

    if (action === 'ban') {
      for (const row of actionResult.rows) {
        await createAdminAccountOperation({
          adminUserId: row.id,
          actorId: req.user.id,
          actorName: getAdminOperationActorName(req.user),
          eventType: 'user_bulk_suspended',
          note: reason,
          adminSnapshot: row,
          metadata: {
            bulk_action: true,
          },
        });
      }
    }

    await logAction(req.user.id, logActionName, 'user', null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Bulk action failed' });
  }
};

const bulkPropertyAction = async (req, res) => {
  const { ids, action } = req.body;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensurePropertyOperationSchema();

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No properties selected' });
    }

    if (action !== 'unlist') {
      return res.status(400).json({ message: 'Invalid action' });
    }

    if (!reason) {
      return res.status(400).json({ message: 'A bulk unlist reason is required' });
    }

    const actionResult = await db.query(
      `UPDATE properties
       SET is_available = FALSE,
           updated_at = NOW()
       WHERE id = ANY($1)
       RETURNING id, title, landlord_id, user_id, is_available, featured`,
      [ids]
    );

    await db.query(
      'DELETE FROM saved_properties WHERE property_id = ANY($1)',
      [ids]
    );

    for (const row of actionResult.rows) {
      await createPropertyOperation({
        propertyId: row.id,
        actor: req.user,
        eventType: 'property_bulk_unlisted',
        note: reason,
        metadata: {
          ...row,
          bulk_action: true,
        },
      });
    }

    await logAction(req.user.id, 'BULK_UNLIST_PROPERTIES', 'property', null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Bulk action failed' });
  }
};

// feature flags
const getFeatureFlags = async (req, res) => {
  try {
    await ensureFeatureFlagsTable({ syncDefaults: true });
    const { rows } = await db.query(`SELECT * FROM feature_flags ORDER BY key`);
    const flagMap = new Map(
      DEFAULT_FEATURE_FLAGS.map((flag) => [flag.key, { ...flag }])
    );

    rows.forEach((row) => {
      flagMap.set(row.key, {
        ...(flagMap.get(row.key) || {}),
        ...row,
      });
    });

    const flags = Array.from(flagMap.values()).sort((a, b) =>
      a.key.localeCompare(b.key)
    );

    res.json({ success: true, flags });
  } catch {
    res.status(500).json({ message: 'Failed to load flags' });
  }
};

const updateFeatureFlag = async (req, res) => {
  const { key } = req.params;
  const { enabled } = req.body;

  try {
    await ensureFeatureFlagsTable();
    await syncDefaultFeatureFlags();

    const defaultFlag = DEFAULT_FEATURE_FLAGS.find((flag) => flag.key === key);
    let result;

    if (defaultFlag) {
      result = await db.query(
        `INSERT INTO feature_flags (key, enabled, description, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key)
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
         RETURNING key`,
        [key, enabled, defaultFlag.description]
      );
    } else {
      result = await db.query(
        `UPDATE feature_flags SET enabled = $1, updated_at = NOW() WHERE key = $2 RETURNING key`,
        [enabled, key]
      );
    }

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Feature flag not found' });
    }

    await logAction(req.user.id, `TOGGLE_FLAG_${key}`, 'feature_flag', null);

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: 'Failed to update flag' });
  }
};

const getPricingRules = async (req, res) => {
  try {
    const [rules, locations] = await Promise.all([
      listLocationPricingRules(),
      getLocationOptions(),
    ]);

    res.json({
      success: true,
      data: {
        rules,
        targets: getPricingTargets(),
        locations,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to load pricing rules' });
  }
};

const createPricingRule = async (req, res) => {
  try {
    const rule = await createLocationPricingRule({
      appliesTo: req.body.applies_to,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      amount: req.body.amount,
      isActive: req.body.is_active !== false,
    });

    await logAction(req.user.id, 'CREATE_PRICING_RULE', 'pricing_rule', rule.id);

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error(error);

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A pricing rule already exists for that target and location',
      });
    }

    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to create pricing rule',
    });
  }
};

const updatePricingRule = async (req, res) => {
  try {
    const rule = await updateLocationPricingRule(req.params.ruleId, {
      appliesTo: req.body.applies_to,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      amount: req.body.amount,
      isActive: req.body.is_active !== false,
    });

    await logAction(req.user.id, 'UPDATE_PRICING_RULE', 'pricing_rule', rule.id);

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error(error);

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A pricing rule already exists for that target and location',
      });
    }

    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to update pricing rule',
    });
  }
};

const removePricingRule = async (req, res) => {
  try {
    await deleteLocationPricingRule(req.params.ruleId);

    await logAction(req.user.id, 'DELETE_PRICING_RULE', 'pricing_rule', req.params.ruleId);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to delete pricing rule',
    });
  }
};

const getRegistrationAccessRules = async (req, res) => {
  try {
    const [rules, locations] = await Promise.all([
      listRegistrationAccessRules(),
      getLocationOptions(),
    ]);

    res.json({
      success: true,
      data: {
        rules,
        targets: getRegistrationAccessTargets(),
        locations,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to load registration access rules' });
  }
};

const createRegistrationAccessRuleHandler = async (req, res) => {
  try {
    const rule = await createRegistrationAccessRule({
      appliesTo: req.body.applies_to,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      isActive: req.body.is_active !== false,
    });

    await logAction(
      req.user.id,
      'CREATE_REGISTRATION_ACCESS_RULE',
      'registration_access_rule',
      rule.id
    );

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error(error);

    if (error.code === '23505') {
      return res.status(409).json({
        message:
          'A registration access rule already exists for that role and location',
      });
    }

    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to create registration access rule',
    });
  }
};

const updateRegistrationAccessRuleHandler = async (req, res) => {
  try {
    const rule = await updateRegistrationAccessRule(req.params.ruleId, {
      appliesTo: req.body.applies_to,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      isActive: req.body.is_active !== false,
    });

    await logAction(
      req.user.id,
      'UPDATE_REGISTRATION_ACCESS_RULE',
      'registration_access_rule',
      rule.id
    );

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error(error);

    if (error.code === '23505') {
      return res.status(409).json({
        message:
          'A registration access rule already exists for that role and location',
      });
    }

    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to update registration access rule',
    });
  }
};

const removeRegistrationAccessRule = async (req, res) => {
  try {
    await deleteRegistrationAccessRule(req.params.ruleId);

    await logAction(
      req.user.id,
      'DELETE_REGISTRATION_ACCESS_RULE',
      'registration_access_rule',
      req.params.ruleId
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to delete registration access rule',
    });
  }
};

// fraud
const ensureFraudOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS fraud_flag_operations (
      id SERIAL PRIMARY KEY,
      fraud_flag_id INTEGER REFERENCES fraud_flags(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fraud_flag_operations_flag
      ON fraud_flag_operations(fraud_flag_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fraud_flag_operations_created
      ON fraud_flag_operations(created_at DESC)
  `);
};

const createFraudFlagOperation = async ({
  fraudFlagId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO fraud_flag_operations (
       fraud_flag_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      fraudFlagId,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const getFraudFlags = async (req, res) => {
  try {
    await ensureFraudOperationSchema();

    const { rows } = await db.query(
      `SELECT ff.*,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM fraud_flags ff
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM fraud_flag_operations
           WHERE fraud_flag_id = ff.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       WHERE ff.resolved = FALSE
       ORDER BY score DESC, created_at DESC`
    );

    res.json({ success: true, flags: rows });
  } catch {
    res.status(500).json({ message: 'Failed to load fraud flags' });
  }
};

const resolveFraudFlag = async (req, res) => {
  const { id } = req.params;
  const note = String(req.body?.note || req.body?.reason || '').trim();

  try {
    await ensureFraudOperationSchema();

    if (!note) {
      return res.status(400).json({ message: 'A fraud resolution note is required' });
    }

    const existing = await db.query(`SELECT * FROM fraud_flags WHERE id = $1`, [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ message: 'Fraud flag not found' });
    }

    await db.query(`UPDATE fraud_flags SET resolved = TRUE WHERE id = $1`, [id]);

    await createFraudFlagOperation({
      fraudFlagId: Number(id),
      actor: req.user,
      eventType: 'fraud_flag_resolved',
      note,
      metadata: {
        entity_type: existing.rows[0].entity_type,
        entity_id: existing.rows[0].entity_id,
        rule: existing.rows[0].rule,
        score: existing.rows[0].score,
      },
    });

    await logAction(req.user.id, 'RESOLVE_FRAUD_FLAG', 'fraud', id);

    res.json({ success: true });
  } catch (err) {
    console.error('Resolve fraud flag error:', err);
    res.status(500).json({ message: 'Failed to resolve fraud flag' });
  }
};

const getRangeStart = (timeRange) => {
  const now = Date.now();

  switch (String(timeRange || '7days')) {
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '30days':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case '90days':
      return new Date(now - 90 * 24 * 60 * 60 * 1000);
    case 'all':
      return null;
    case '7days':
    default:
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
  }
};

const getLawyerActivities = async (req, res) => {
  try {
    await ensureLawyerCaseNotesSchema();

    const timeRange = String(req.query.time_range || '7days');
    const rangeStart = getRangeStart(timeRange);

    const lawyersResult = await db.query(
      `SELECT
         id,
         full_name,
         email,
         phone,
         chamber_name,
         identity_verified,
         created_at
       FROM users
       WHERE user_type = 'lawyer'
       ORDER BY created_at DESC`
    );

    const lawyers = lawyersResult.rows;
    if (!lawyers.length) {
      return res.json({
        success: true,
        data: {
          lawyers: [],
          stats: {
            totalLawyers: 0,
            activeLawyers: 0,
            totalVerifications: 0,
            totalResolutions: 0,
            avgResponseTime: 0,
          },
          time_range: timeRange,
        },
      });
    }

    const verificationsPromise = db.query(
      `SELECT
         verified_by AS lawyer_user_id,
         COUNT(*)::INT AS total_verifications
       FROM dispute_evidence
       WHERE verified_by IS NOT NULL
         ${rangeStart ? 'AND verified_at >= $1' : ''}
       GROUP BY verified_by`,
      rangeStart ? [rangeStart] : []
    );

    const resolutionsPromise = db.query(
      `SELECT
         resolved_by AS lawyer_user_id,
         COUNT(*)::INT AS total_resolutions
       FROM disputes
       WHERE resolved_by IS NOT NULL
         ${rangeStart ? 'AND resolved_at >= $1' : ''}
       GROUP BY resolved_by`,
      rangeStart ? [rangeStart] : []
    );

    const notesPromise = db.query(
      `SELECT
         lawyer_user_id,
         COUNT(*)::INT AS total_case_notes
       FROM lawyer_case_notes
       WHERE 1 = 1
         ${rangeStart ? 'AND created_at >= $1' : ''}
       GROUP BY lawyer_user_id`,
      rangeStart ? [rangeStart] : []
    );

    const authorizationsPromise = db.query(
      `SELECT
         lawyer_user_id,
         COUNT(DISTINCT property_id)::INT AS active_authorizations
       FROM legal_authorizations
       WHERE status = 'active'
         AND property_id IS NOT NULL
       GROUP BY lawyer_user_id`
    );

    const activeDisputesPromise = db.query(
      `SELECT
         la.lawyer_user_id,
         COUNT(DISTINCT d.id)::INT AS active_disputes
       FROM legal_authorizations la
       JOIN disputes d
         ON (
           la.property_id = d.property_id
           OR (
             la.property_id IS NULL
             AND la.client_user_id IN (d.opened_by, d.against_user)
           )
         )
       WHERE la.status = 'active'
         AND COALESCE(d.status, 'open') <> 'resolved'
       GROUP BY la.lawyer_user_id`
    );

    const activityPromise = db.query(
      `SELECT
         activity.lawyer_user_id,
         MAX(activity.happened_at) AS last_activity_at,
         MIN(activity.happened_at) AS first_activity_at
       FROM (
         SELECT verified_by AS lawyer_user_id, verified_at AS happened_at
         FROM dispute_evidence
         WHERE verified_by IS NOT NULL
           ${rangeStart ? 'AND verified_at >= $1' : ''}
         UNION ALL
         SELECT resolved_by AS lawyer_user_id, resolved_at AS happened_at
         FROM disputes
         WHERE resolved_by IS NOT NULL
           ${rangeStart ? 'AND resolved_at >= $1' : ''}
         UNION ALL
         SELECT lawyer_user_id, created_at AS happened_at
         FROM lawyer_case_notes
         WHERE 1 = 1
           ${rangeStart ? 'AND created_at >= $1' : ''}
       ) activity
       GROUP BY activity.lawyer_user_id`,
      rangeStart ? [rangeStart] : []
    );

    const firstAssignedPromise = db.query(
      `SELECT
         lawyer_user_id,
         MIN(created_at) AS first_assigned_at
       FROM legal_authorizations
       WHERE status = 'active'
       GROUP BY lawyer_user_id`
    );

    const [
      verificationsResult,
      resolutionsResult,
      notesResult,
      authorizationsResult,
      activeDisputesResult,
      activityResult,
      firstAssignedResult,
    ] = await Promise.all([
      verificationsPromise,
      resolutionsPromise,
      notesPromise,
      authorizationsPromise,
      activeDisputesPromise,
      activityPromise,
      firstAssignedPromise,
    ]);

    const toNumberMap = (rows, key, valueKey) =>
      new Map(rows.map((row) => [Number(row[key]), Number(row[valueKey] || 0)]));
    const toDateMap = (rows, key, valueKey) =>
      new Map(rows.map((row) => [Number(row[key]), row[valueKey] || null]));

    const verificationsMap = toNumberMap(verificationsResult.rows, 'lawyer_user_id', 'total_verifications');
    const resolutionsMap = toNumberMap(resolutionsResult.rows, 'lawyer_user_id', 'total_resolutions');
    const notesMap = toNumberMap(notesResult.rows, 'lawyer_user_id', 'total_case_notes');
    const authorizationsMap = toNumberMap(authorizationsResult.rows, 'lawyer_user_id', 'active_authorizations');
    const activeDisputesMap = toNumberMap(activeDisputesResult.rows, 'lawyer_user_id', 'active_disputes');
    const lastActivityMap = toDateMap(activityResult.rows, 'lawyer_user_id', 'last_activity_at');
    const firstActivityMap = toDateMap(activityResult.rows, 'lawyer_user_id', 'first_activity_at');
    const firstAssignedMap = toDateMap(firstAssignedResult.rows, 'lawyer_user_id', 'first_assigned_at');

    const lawyerRows = lawyers.map((lawyer) => {
      const lawyerId = Number(lawyer.id);
      const firstAssignedAt = firstAssignedMap.get(lawyerId);
      const firstActivityAt = firstActivityMap.get(lawyerId);

      let avgResponseMinutes = null;
      if (firstAssignedAt && firstActivityAt) {
        const assignedTime = new Date(firstAssignedAt).getTime();
        const activityTime = new Date(firstActivityAt).getTime();
        if (!Number.isNaN(assignedTime) && !Number.isNaN(activityTime) && activityTime >= assignedTime) {
          avgResponseMinutes = Math.round((activityTime - assignedTime) / 60000);
        }
      }

      return {
        ...lawyer,
        total_verifications: verificationsMap.get(lawyerId) || 0,
        total_resolutions: resolutionsMap.get(lawyerId) || 0,
        total_case_notes: notesMap.get(lawyerId) || 0,
        active_authorizations: authorizationsMap.get(lawyerId) || 0,
        active_disputes: activeDisputesMap.get(lawyerId) || 0,
        last_activity_at: lastActivityMap.get(lawyerId),
        avg_response_minutes: avgResponseMinutes,
      };
    });

    const responseTimes = lawyerRows
      .map((lawyer) => lawyer.avg_response_minutes)
      .filter((value) => Number.isFinite(value) && value >= 0);

    const stats = {
      totalLawyers: lawyerRows.length,
      activeLawyers: lawyerRows.filter(
        (lawyer) =>
          lawyer.total_verifications > 0 ||
          lawyer.total_resolutions > 0 ||
          lawyer.total_case_notes > 0
      ).length,
      totalVerifications: lawyerRows.reduce((sum, lawyer) => sum + lawyer.total_verifications, 0),
      totalResolutions: lawyerRows.reduce((sum, lawyer) => sum + lawyer.total_resolutions, 0),
      avgResponseTime: responseTimes.length
        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : 0,
    };

    res.json({
      success: true,
      data: {
        lawyers: lawyerRows,
        stats,
        time_range: timeRange,
      },
    });
  } catch (error) {
    console.error('Get lawyer activities error:', error);
    res.status(500).json({ message: 'Failed to load lawyer activities' });
  }
};

// Send verification reminder notification to a user
const sendUserVerificationReminder = async (req, res) => {
  try {
    const { userId } = req.params;
    const { message } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Verify user exists
    const userResult = await db.query(
      `SELECT id, full_name, email, email_verified, phone_verified,
              nin, nin_verified, passport_photo_url,
              international_passport_number, identity_verified,
              identity_verification_status
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Build a detailed message if none provided
    const steps = [];
    if (!user.email_verified) steps.push('Verify your email address');
    if (!user.phone_verified) steps.push('Verify your phone number');
    if (!user.passport_photo_url) steps.push('Upload your identity document (passport photo)');
    if (!user.nin && !user.international_passport_number) steps.push('Provide your NIN or International Passport number');

    const finalMessage = message || (
      steps.length > 0
        ? `You have pending verification steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nPlease complete these steps to proceed.`
        : 'Your account verification is complete. No action needed at this time.'
    );

    // Create the notification using the utility
    const { createNotification } = require('../config/utils/notificationService');
    await createNotification(
      Number(userId),
      'verification_reminder',
      'Verification Reminder from Admin',
      finalMessage,
      '/verification-status'
    );

    res.json({
      success: true,
      message: 'Verification reminder sent to user successfully'
    });
  } catch (error) {
    console.error('Send verification reminder error:', error);
    res.status(500).json({ success: false, message: 'Failed to send verification reminder' });
  }
};

module.exports = {
  getAllUsers,
  impersonateAdmin,
  banUser,
  unbanUser,
  deleteUser,
  promoteToAdmin,
  getIdentityVerifications,
  approveIdentityVerification,
  rejectIdentityVerification,
  deleteRejectedVerification,
  verifyUser,
  getAdminPerformance,
  getAdminStateUsers,
  updateAdminJurisdiction,
  getAllProperties,
  unlistProperty,
  featureProperty,
  unfeatureProperty,
  getAuditLogs,
  getAdminMonitor,
  getAnalytics,
  getReports,
  updateReportStatus,
  resolveReport,
  getBroadcasts,
  createBroadcast,
  getPlatformLawyerManagementData,
  createManualPlatformLawyer,
  resendManualPlatformLawyerInvite,
  updatePlatformLawyer,
  deletePlatformLawyer,
  createPlatformLawyerRecruitmentBroadcast,
  approvePlatformLawyerApplication,
  rejectPlatformLawyerApplication,
  getPlatformAgentManagementData,
  createManualPlatformAgent,
  updatePlatformAgent,
  deletePlatformAgent,
  bulkUserAction,
  bulkPropertyAction,
  getFeatureFlags,
  updateFeatureFlag,
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  removePricingRule,
  getRegistrationAccessRules,
  createRegistrationAccessRuleHandler,
  updateRegistrationAccessRuleHandler,
  removeRegistrationAccessRule,
  getFraudFlags,
  resolveFraudFlag,
  getLawyerActivities,
  sendUserVerificationReminder,
};
