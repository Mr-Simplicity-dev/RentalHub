const db = require('../../config/middleware/database');
const logger = require('../../config/utils/logger');
const { decryptNIN } = require('../../config/utils/ninEncryption');
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
    req.logger.error(err);
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
    req.logger.error(err);
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
    req.logger.error(err);
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
    req.logger.error(err);
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
    req.logger.error(err);
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
    req.logger.error(err);
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
    req.logger.error('Update admin jurisdiction error:', err);
    res.status(500).json({ success: false, message: 'Failed to update admin jurisdiction' });
  }
};


module.exports = {
  getIdentityVerifications,
  approveIdentityVerification,
  rejectIdentityVerification,
  deleteRejectedVerification,
  verifyUser,
  getAdminPerformance,
  getAdminStateUsers,
  updateAdminJurisdiction,
};

