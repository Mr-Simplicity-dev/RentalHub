const db = require('../../config/middleware/database');
const logger = require('../../config/utils/logger');
const { decryptNIN } = require('../../config/utils/ninEncryption');
const jwt = require('jsonwebtoken');
const {
  setAuthCookies,
  shouldReturnTokenInBody,
} = require('../../config/utils/authCookies');
const {
  ensureVerificationAuditSchema,
  ensureUserSuspensionSchema,
  ensureAdminAccountOperationSchema,
  ensureIdentityVerificationOperationSchema,
  createAdminAccountOperation,
  createIdentityVerificationOperation,
  buildDeletedEmail,
  buildDeletedUniqueValue,
  logAction,
  getDashboardPathForRole,
} = require('./schemaHelpers');

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
      req.logger.error(err);
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
    req.logger.error('Impersonation error:', error);
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
    req.logger.error(err);
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
    req.logger.error(err);
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
    req.logger.error(err);
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
    req.logger.error(err);
    res.status(500).json({ message: 'Failed to promote user' });
  }
};


module.exports = {
  getAllUsers,
  impersonateAdmin,
  banUser,
  unbanUser,
  deleteUser,
  promoteToAdmin,
};

