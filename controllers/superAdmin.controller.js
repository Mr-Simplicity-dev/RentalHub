import db from '../db/index.js';

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
export const getAllUsers = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, email, role, user_type, identity_verified, is_active, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({ success: true, users: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load users' });
  }
};

// PATCH /api/super/users/:id/ban
export const banUser = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [id]);
    await logAction(req.user.id, 'BAN_USER', 'user', id);

    res.json({ success: true, message: 'User banned' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to ban user' });
  }
};

// PATCH /api/super/users/:id/promote
export const promoteToAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [id]);
    await logAction(req.user.id, 'PROMOTE_TO_ADMIN', 'user', id);

    res.json({ success: true, message: 'User promoted to admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to promote user' });
  }
};

// PATCH /api/super/verify/:userId
export const verifyUser = async (req, res) => {
  const { userId } = req.params;

  try {
    await db.query(`UPDATE users SET identity_verified = TRUE WHERE id = $1`, [userId]);
    await logAction(req.user.id, 'VERIFY_USER', 'user', userId);

    res.json({ success: true, message: 'User verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to verify user' });
  }
};

// ================= PROPERTIES =================

// GET /api/super/properties
export const getAllProperties = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.full_name AS landlord_name
       FROM properties p
       JOIN users u ON u.id = p.landlord_id
       ORDER BY p.created_at DESC`
    );

    res.json({ success: true, properties: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load properties' });
  }
};

// PATCH /api/super/properties/:id/unlist
export const unlistProperty = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query(`UPDATE properties SET is_active = FALSE WHERE id = $1`, [id]);
    await logAction(req.user.id, 'UNLIST_PROPERTY', 'property', id);

    res.json({ success: true, message: 'Property unlisted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to unlist property' });
  }
};

// ================= AUDIT LOGS =================

// GET /api/super/logs
export const getAuditLogs = async (req, res) => {
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
export const getAnalytics = async (req, res) => {
  try {
    const [users, properties, apps, verified, byState] = await Promise.all([
      db.query(`SELECT role, COUNT(*) FROM users GROUP BY role`),
      db.query(`SELECT COUNT(*) FROM properties`),
      db.query(`SELECT COUNT(*) FROM applications`),
      db.query(`SELECT COUNT(*) FROM users WHERE identity_verified = TRUE`),
      db.query(`SELECT state, COUNT(*) FROM properties GROUP BY state ORDER BY COUNT(*) DESC`)
    ]);

    res.json({
      success: true,
      data: {
        usersByRole: users.rows,
        totalProperties: Number(properties.rows[0].count),
        totalApplications: Number(apps.rows[0].count),
        verifiedUsers: Number(verified.rows[0].count),
        propertiesByState: byState.rows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
};

// ================= REPORTS =================

// GET /api/super/reports
export const getReports = async (req, res) => {
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
export const updateReportStatus = async (req, res) => {
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

// ================= BROADCAST =================

// GET /api/super/broadcasts
export const getBroadcasts = async (req, res) => {
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

// POST /api/super/broadcasts
export const createBroadcast = async (req, res) => {
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
export const bulkUserAction = async (req, res) => {
  const { ids, action } = req.body; // ids = [1,2,3], action = ban | verify | promote

  try {
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No users selected' });
    }

    let query;
    let logActionName;

    switch (action) {
      case 'ban':
        query = `UPDATE users SET is_active = FALSE WHERE id = ANY($1)`;
        logActionName = 'BULK_BAN_USERS';
        break;
      case 'verify':
        query = `UPDATE users SET identity_verified = TRUE WHERE id = ANY($1)`;
        logActionName = 'BULK_VERIFY_USERS';
        break;
      case 'promote':
        query = `UPDATE users SET role = 'admin' WHERE id = ANY($1)`;
        logActionName = 'BULK_PROMOTE_USERS';
        break;
      default:
        return res.status(400).json({ message: 'Invalid action' });
    }

    await db.query(query, [ids]);
    await logAction(db, req.user.id, logActionName, 'user', null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Bulk action failed' });
  }
};

export const bulkPropertyAction = async (req, res) => {
  const { ids, action } = req.body; // action = unlist

  try {
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No properties selected' });
    }

    if (action !== 'unlist') {
      return res.status(400).json({ message: 'Invalid action' });
    }

    await db.query(
      `UPDATE properties SET is_active = FALSE WHERE id = ANY($1)`,
      [ids]
    );

    await logAction(db, req.user.id, 'BULK_UNLIST_PROPERTIES', 'property', null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Bulk action failed' });
  }
};
