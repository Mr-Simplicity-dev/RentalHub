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
    req.logger.error('Get admin monitor error:', err);
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
    req.logger.error(err);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
};


module.exports = {
  getAuditLogs,
  getAdminMonitor,
  getAnalytics,
};

