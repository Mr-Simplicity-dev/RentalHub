const db = require('../config/middleware/database');
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
  PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE,
  PLATFORM_LAWYER_INVITE_EXPIRY_HOURS,
  createPlatformLawyerInvite,
  ensurePlatformLawyerSchema,
} = require('../config/utils/platformLawyerProgram');
const {
  sendPlatformLawyerInviteEmail,
} = require('../config/utils/emailService');

let verificationAuditSchemaReady = false;
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
        u.created_at
      FROM users u
      LEFT JOIN users v ON v.id = u.identity_verified_by
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
      return res.status(404).json({ message: 'User not found or cannot be rejected' });
    }

    await logAction(req.user.id, 'REJECT_USER_VERIFICATION', 'user', userId);

    res.json({ success: true, message: 'User verification rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to reject verification' });
  }
};

// DELETE /api/super/verifications/:userId
const deleteRejectedVerification = async (req, res) => {
  const { userId } = req.params;

  try {
    await ensureVerificationAuditSchema();

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
      return res.status(404).json({ message: 'Rejected verification record not found' });
    }

    await logAction(req.user.id, 'DELETE_REJECTED_VERIFICATION', 'user', userId);

    res.json({ success: true, message: 'Rejected verification deleted' });
  } catch (err) {
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

// ================= PLATFORM LAWYERS =================

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

    res.json({
      success: true,
      data: {
        entries: entriesResult.rows,
        applications: applicationsResult.rows,
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
        String(req.body.review_note || '').trim() || null,
        req.user.id,
      ]
    );

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
        String(req.body.review_note || '').trim() || null,
        req.user.id,
      ]
    );

    if (!applicationResult.rows.length) {
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

    await logAction(req.user.id, 'REJECT_PLATFORM_LAWYER_APPLICATION', 'platform_lawyer_application', req.params.applicationId);

    res.json({ success: true });
  } catch (error) {
    console.error('Reject platform lawyer application error:', error);
    res.status(500).json({ message: 'Failed to reject lawyer application' });
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
  deleteRejectedVerification,
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
  getPlatformLawyerManagementData,
  createManualPlatformLawyer,
  resendManualPlatformLawyerInvite,
  updatePlatformLawyer,
  deletePlatformLawyer,
  createPlatformLawyerRecruitmentBroadcast,
  approvePlatformLawyerApplication,
  rejectPlatformLawyerApplication,
  bulkUserAction,
  bulkPropertyAction,
  getFeatureFlags,
  updateFeatureFlag,
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  removePricingRule,
  getFraudFlags,
  resolveFraudFlag,
};
