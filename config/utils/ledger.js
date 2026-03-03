const crypto = require('crypto');
const db = require('../config/middleware/database');

exports.addLedgerEntry = async ({
  actorId,
  action,
  targetType,
  targetId
}) => {
  try {
    // Get last log
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
      actorId +
      action +
      targetType +
      targetId +
      timestamp +
      previousHash;

    const currentHash = crypto
      .createHash('sha256')
      .update(dataString)
      .digest('hex');

    await db.query(
      `INSERT INTO audit_logs
       (actor_id, action, target_type, target_id, previous_hash, current_hash)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        actorId,
        action,
        targetType,
        targetId,
        previousHash,
        currentHash
      ]
    );

  } catch (error) {
    console.error('Ledger logging error:', error);
  }
};