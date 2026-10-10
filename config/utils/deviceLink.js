// Device/account-link analysis: record which device fingerprints access which
// accounts and flag a device that is shared across multiple accounts.
const crypto = require('crypto');
const db = require('../middleware/database');
const { raiseSecurityAlert } = require('./securityAlert');

const fingerprintFromRequest = (req, explicitDeviceId) => {
  const explicit = String(explicitDeviceId || '').trim();
  if (explicit) {
    return crypto.createHash('sha256').update(`device:${explicit}`).digest('hex');
  }
  const ua = String(req.headers?.['user-agent'] || '').slice(0, 200);
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  return crypto.createHash('sha256').update(`ipua:${ip}:${ua}`).digest('hex');
};

const recordDeviceLink = async ({ userId, req, deviceId = null }) => {
  if (!userId) return;
  const fingerprint = fingerprintFromRequest(req, deviceId);

  try {
    await db.query(
      `INSERT INTO device_links (device_fingerprint, user_id, first_seen, last_seen)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (device_fingerprint, user_id)
       DO UPDATE SET last_seen = NOW()`,
      [fingerprint, userId]
    );

    const shared = await db.query(
      `SELECT DISTINCT user_id FROM device_links
       WHERE device_fingerprint = $1 AND user_id <> $2`,
      [fingerprint, userId]
    );

    if (shared.rows.length) {
      await raiseSecurityAlert({
        event: 'device_shared_across_accounts',
        actorId: userId,
        targetType: 'device',
        ip: req.ip,
        metadata: {
          device_fingerprint: fingerprint,
          shared_user_ids: shared.rows.map((r) => r.user_id),
        },
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Device link record failed:', error.message);
  }
};

module.exports = { recordDeviceLink, fingerprintFromRequest };
