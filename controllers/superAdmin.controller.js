const db = require('../config/middleware/database');
const {
  DEFAULT_FEATURE_FLAGS,
  ensureFeatureFlagsTable,
  syncDefaultFeatureFlags,
} = require('../config/middleware/featureFlags');

let verificationAuditSchemaReady = false;

const ensureVerificationAuditSchema = async () => {
  if (verificationAuditSchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS identity_verified_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

    CREATE INDEX IF NOT EXISTS idx_users_identity_verified_by
      ON users(identity_verified_by);
  `);

  verificationAuditSchemaReady = true;
};

// ---- Audit Helper ----
const logAction = async (actorId, action, targetType = null, targetId = null) => {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id)
     VALUES ($1, $2, $3, $4)`,
    [actorId, action, targetType, targetId]
  );
};

// ================= USERS =================

// GET /api/super/users
const getAllUsers = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

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
         v.full_name AS identity_verified_by_name,
         COALESCE(vc.total_verified, 0)::INT AS credentials_verified_count
       FROM users u
       LEFT JOIN users v ON v.id = u.identity_verified_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS total_verified
         FROM users uv
         WHERE uv.identity_verified_by = u.id
       ) vc ON TRUE
       WHERE u.deleted_at IS NULL
         AND u.user_type IN ('tenant', 'landlord')
       ORDER BY u.created_at DESC`
    );

    res.json({ success: true, users: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load users' });
  }
};

// PATCH /api/super/users/:id/ban
const banUser = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query(
      `UPDATE users
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_type <> 'super_admin'`,
      [id]
    );
    await logAction(req.user.id, 'BAN_USER', 'user', id);

    res.json({ success: true, message: 'User banned' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to ban user' });
  }
};

// PATCH /api/super/users/:id/unban
const unbanUser = async (req, res) => {
  const { id } = req.params;

  try {
    await ensureVerificationAuditSchema();

    const result = await db.query(
      `UPDATE users
       SET is_active = TRUE, updated_at = NOW()
       WHERE id = $1
         AND user_type <> 'super_admin'
         AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'User not found or cannot be unbanned' });
    }

    await logAction(req.user.id, 'UNBAN_USER', 'user', id);

    res.json({ success: true, message: 'User unbanned' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to unban user' });
  }
};

// DELETE /api/super/users/:id
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    await ensureVerificationAuditSchema();

    const result = await db.query(
      `UPDATE users
       SET deleted_at = NOW(),
           is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
         AND user_type <> 'super_admin'
         AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'User not found or cannot be deleted' });
    }

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
      `u.passport_photo_url IS NOT NULL`,
      `(u.nin IS NOT NULL OR u.international_passport_number IS NOT NULL)`,
    ];
    const params = [];
    let i = 1;

    if (status === 'pending') {
      where.push(`u.identity_verified = FALSE`);
    } else if (status === 'verified') {
      where.push(`u.identity_verified = TRUE`);
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
        u.identity_verified_at,
        u.identity_verified_by,
        v.full_name AS identity_verified_by_name,
        u.created_at
      FROM users u
      LEFT JOIN users v ON v.id = u.identity_verified_by
      ${whereClause}
      ORDER BY u.identity_verified ASC, u.created_at ASC
      LIMIT $${i++} OFFSET $${i++}
    `;
    const dataResult = await db.query(dataQuery, [...params, pageSize, offset]);

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

    const result = await db.query(
      `UPDATE users
       SET identity_verified = TRUE,
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
      return res.status(404).json({ message: 'User not found or not eligible for verification' });
    }

    await logAction(req.user.id, 'VERIFY_USER', 'user', userId);

    res.json({ success: true, message: 'User verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to verify user' });
  }
};

// PATCH /api/super/verifications/:userId/reject
const rejectIdentityVerification = async (req, res) => {
  const { userId } = req.params;

  try {
    await ensureVerificationAuditSchema();

    const result = await db.query(
      `UPDATE users
       SET identity_verified = FALSE,
           identity_verified_by = NULL,
           identity_verified_at = NULL,
           passport_photo_url = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type <> 'super_admin'
       RETURNING id`,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'User not found or cannot be rejected' });
    }

    await logAction(req.user.id, 'REJECT_USER_VERIFICATION', 'user', userId);

    res.json({ success: true, message: 'User verification rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to reject verification' });
  }
};

// Backward-compatible route handler
// PATCH /api/super/verify/:userId
const verifyUser = approveIdentityVerification;

// GET /api/super/admins/performance
const getAdminPerformance = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const { rows } = await db.query(
      `SELECT
         a.id,
         a.full_name,
         a.email,
         a.is_active,
         a.created_at,
         COUNT(v.id)::INT AS credentials_verified_count,
         MAX(v.identity_verified_at) AS last_verification_at
       FROM users a
       LEFT JOIN users v
         ON v.identity_verified_by = a.id
         AND v.identity_verified = TRUE
       WHERE a.user_type = 'admin'
         AND a.deleted_at IS NULL
       GROUP BY a.id, a.full_name, a.email, a.is_active, a.created_at
       ORDER BY credentials_verified_count DESC, a.created_at DESC`
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load admin performance' });
  }
};

// ================= PROPERTIES =================

// GET /api/super/properties
const getAllProperties = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.full_name AS landlord_name
       FROM properties p
       LEFT JOIN users u ON u.id = COALESCE(p.landlord_id, p.user_id)
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

  try {
    await db.query(
      `UPDATE properties
       SET is_available = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    await db.query(
      'DELETE FROM saved_properties WHERE property_id = $1',
      [id]
    );
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

  try {
    await db.query(
      `UPDATE properties
       SET featured = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
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

  try {
    await db.query(
      `UPDATE properties
       SET featured = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
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

// GET /api/super/reports
const getReports = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, u.full_name AS reporter_name
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
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
  const { status } = req.body;

  try {
    await db.query(`UPDATE reports SET status = $1 WHERE id = $2`, [status, id]);
    await logAction(req.user.id, `REPORT_${status.toUpperCase()}`, 'report', id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update report' });
  }
};

// PATCH /api/super/reports/:reportId/resolve
const resolveReport = async (req, res) => {
  const { reportId } = req.params;

  try {
    await db.query(`UPDATE reports SET status = 'resolved' WHERE id = $1`, [reportId]);
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

// Bulk actions
const bulkUserAction = async (req, res) => {
  const { ids, action } = req.body;

  try {
    await ensureVerificationAuditSchema();

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No users selected' });
    }

    let query;
    let params = [ids];
    let logActionName;

    switch (action) {
      case 'ban':
        query = `UPDATE users SET is_active = FALSE WHERE id = ANY($1) AND user_type <> 'super_admin'`;
        logActionName = 'BULK_BAN_USERS';
        break;
      case 'verify':
        query = `
          UPDATE users
          SET identity_verified = TRUE,
              identity_verified_by = $2,
              identity_verified_at = NOW(),
              updated_at = NOW()
          WHERE id = ANY($1)
            AND user_type <> 'super_admin'
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

    await db.query(query, params);
    await logAction(req.user.id, logActionName, 'user', null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Bulk action failed' });
  }
};

const bulkPropertyAction = async (req, res) => {
  const { ids, action } = req.body;

  try {
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No properties selected' });
    }

    if (action !== 'unlist') {
      return res.status(400).json({ message: 'Invalid action' });
    }

    await db.query(
      `UPDATE properties
       SET is_available = FALSE,
           updated_at = NOW()
       WHERE id = ANY($1)`,
      [ids]
    );
    await db.query(
      'DELETE FROM saved_properties WHERE property_id = ANY($1)',
      [ids]
    );

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

// fraud
const getFraudFlags = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM fraud_flags
       WHERE resolved = FALSE
       ORDER BY score DESC, created_at DESC`
    );

    res.json({ success: true, flags: rows });
  } catch {
    res.status(500).json({ message: 'Failed to load fraud flags' });
  }
};

const resolveFraudFlag = async (req, res) => {
  const { id } = req.params;

  await db.query(`UPDATE fraud_flags SET resolved = TRUE WHERE id = $1`, [id]);
  await logAction(req.user.id, 'RESOLVE_FRAUD_FLAG', 'fraud', id);

  res.json({ success: true });
};

module.exports = {
  getAllUsers,
  banUser,
  unbanUser,
  deleteUser,
  promoteToAdmin,
  getIdentityVerifications,
  approveIdentityVerification,
  rejectIdentityVerification,
  verifyUser,
  getAdminPerformance,
  getAllProperties,
  unlistProperty,
  featureProperty,
  unfeatureProperty,
  getAuditLogs,
  getAnalytics,
  getReports,
  updateReportStatus,
  resolveReport,
  getBroadcasts,
  createBroadcast,
  bulkUserAction,
  bulkPropertyAction,
  getFeatureFlags,
  updateFeatureFlag,
  getFraudFlags,
  resolveFraudFlag,
};
