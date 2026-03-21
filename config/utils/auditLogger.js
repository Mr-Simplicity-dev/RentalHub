const db = require('../middleware/database');
const crypto = require('crypto');

exports.logAction = async ({
  actorId,
  action,
  targetType = null,
  targetId = null,
  ip = null
}) => {
  try {

    const lastLog = await db.query(
      `SELECT current_hash FROM audit_logs
       ORDER BY id DESC
       LIMIT 1`
    );

    const previousHash =
      lastLog.rows.length > 0
        ? lastLog.rows[0].current_hash
        : 'GENESIS';

    const timestamp = new Date().toISOString();

    const dataString =
      (actorId || '') +
      action +
      (targetType || '') +
      (targetId || '') +
      timestamp +
      previousHash;

    const currentHash = crypto
      .createHash('sha256')
      .update(dataString)
      .digest('hex');

    await db.query(
      `INSERT INTO audit_logs
       (actor_id, action, target_type, target_id,
        ip_address, previous_hash, current_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        actorId,
        action,
        targetType,
        targetId,
        ip,
        previousHash,
        currentHash
      ]
    );

  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};
