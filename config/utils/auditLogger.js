// utils/auditLogger.js

const db = require('../config/middleware/database');

exports.logAction = async ({
  actorId,
  action,
  targetType = null,
  targetId = null,
  ip = null
}) => {
  try {
    await db.query(
      `INSERT INTO audit_logs
       (actor_id, action, target_type, target_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId, action, targetType, targetId, ip]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};