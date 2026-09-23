const db = require('../../config/middleware/database');
const logger = require('../../config/utils/logger');
const { ensureVerificationAuditSchema } = require('./schemaHelpers');

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
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 200))
      : 100;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0;

    // Admin user types we want to monitor
    const adminTypes = [
      'admin', 'lga_admin', 'super_admin',
      'financial_admin', 'lga_financial_admin', 'super_financial_admin',
      'state_admin', 'state_financial_admin',
      'lga_support_admin', 'state_support_admin', 'super_support_admin',
      'recruitment_admin',

      'state_lawyer', 'super_lawyer', 'state_lawyer_admin', 'super_lawyer_admin',
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
    req.logger.error('Get admin monitor error:', err);
    res.status(500).json({ message: 'Failed to load admin activity' });
  }
};

// ================= ANALYTICS =================
// GET /api/super/analytics

// Range presets. `all` preserves the original all-time behaviour.
const ANALYTICS_RANGES = {
  today: { start: "date_trunc('day', NOW())", bucket: 'hour', step: "INTERVAL '1 hour'", span: "INTERVAL '23 hours'", format: 'HH24:00' },
  week: { start: "date_trunc('week', NOW())", bucket: 'day', step: "INTERVAL '1 day'", span: "INTERVAL '6 days'", format: 'Dy DD Mon' },
  month: { start: "date_trunc('month', NOW())", bucket: 'day', step: "INTERVAL '1 day'", span: null, format: 'DD Mon' },
  all: { start: null, bucket: 'month', step: "INTERVAL '1 month'", span: "INTERVAL '5 months'", format: 'Mon YYYY' },
};

const getAnalytics = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const requestedRange = String(req.query.range || 'all').toLowerCase();
    const range = ANALYTICS_RANGES[requestedRange] ? requestedRange : 'all';
    const config = ANALYTICS_RANGES[range];
    const start = config.start;

    const usersFilter = start ? `created_at >= ${start}` : 'TRUE';
    const propertiesFilter = start ? `p.created_at >= ${start}` : 'TRUE';
    const applicationsFilter = start ? `a.created_at >= ${start}` : 'TRUE';
    const verifiedFilter = start
      ? `COALESCE(identity_verified_at, created_at) >= ${start}`
      : 'TRUE';
    const growthStart = config.span
      ? `date_trunc('${config.bucket}', NOW()) - ${config.span}`
      : `date_trunc('month', NOW())`;

    const [users, properties, apps, verified, byState, userGrowth] = await Promise.all([
      db.query(
        `SELECT user_type AS role, COUNT(*)::INT AS count
         FROM users
         WHERE deleted_at IS NULL AND ${usersFilter}
         GROUP BY user_type`
      ),
      db.query(`SELECT COUNT(*) FROM properties p WHERE ${propertiesFilter}`),
      db.query(`SELECT COUNT(*) FROM applications a WHERE ${applicationsFilter}`),
      db.query(
        `SELECT COUNT(*)
         FROM users
         WHERE identity_verified = TRUE
           AND deleted_at IS NULL

           AND ${verifiedFilter}`
      ),
      db.query(
        `SELECT
           COALESCE(s.state_name, 'Unknown') AS state,
           COUNT(*)::INT AS count
         FROM properties p

         LEFT JOIN states s ON s.id = p.state_id
         WHERE ${propertiesFilter}
         GROUP BY COALESCE(s.state_name, 'Unknown')
         ORDER BY COUNT(*) DESC`
      ),
      db.query(
        `WITH buckets AS (
           SELECT generate_series(
             ${growthStart},
             date_trunc('${config.bucket}', NOW()),
             ${config.step}
           ) AS bucket_start
         )
         SELECT
           TO_CHAR(b.bucket_start, '${config.format}') AS month,
           COALESCE(COUNT(u.id), 0)::INT AS users
         FROM buckets b
         LEFT JOIN users u
           ON date_trunc('${config.bucket}', u.created_at) = b.bucket_start
          AND u.deleted_at IS NULL
         GROUP BY b.bucket_start
         ORDER BY b.bucket_start`
      )
    ]);

    res.json({
      success: true,
      data: {
        range,

        usersByRole: users.rows,
        totalProperties: Number(properties.rows[0].count),
        totalApplications: Number(apps.rows[0].count),
        verifiedUsers: Number(verified.rows[0].count),
        propertiesByState: byState.rows,
        userGrowth: userGrowth.rows
      }
    });
  } catch (err) {
    req.logger.error(err);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
};


module.exports = {
  getAuditLogs,
  getAdminMonitor,
  getAnalytics,
};

