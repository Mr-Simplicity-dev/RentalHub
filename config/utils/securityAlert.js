// Security monitoring: persist + log high-risk events for detection and audit.
const db = require('../middleware/database');
const logger = require('./logger');

const raiseSecurityAlert = async ({
  event,
  actorId = null,
  actorType = null,
  targetType = null,
  targetId = null,
  ip = null,
  metadata = {},
}) => {
  try {
    await db.query(
      `INSERT INTO security_alerts (event, actor_id, actor_type, target_type, target_id, ip, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event, actorId, actorType, targetType, targetId, ip, JSON.stringify(metadata || {})]
    );
  } catch (error) {
    console.error('Security alert insert failed:', error.message);
  }

  logger.warn(`[SECURITY ALERT] ${event}`, {
    actorId,
    actorType,
    targetType,
    targetId,
    ip,
    ...(metadata || {}),
  });
};

module.exports = { raiseSecurityAlert };
