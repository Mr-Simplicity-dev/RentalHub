const axios = require('axios');
const db = require('../middleware/database');
const logger = require('./logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
let schemaReady = false;

const ensurePushSchema = async () => {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS push_device_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expo_push_token VARCHAR(255) NOT NULL UNIQUE,
      platform VARCHAR(20) NOT NULL,
      device_id VARCHAR(255),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user
      ON push_device_tokens(user_id, enabled);
  `);
  schemaReady = true;
};

const isExpoPushToken = (token) => {
  const normalized = String(token || '').trim();
  return normalized.length <= 255 && EXPO_TOKEN_PATTERN.test(normalized);
};

const registerDevice = async ({ userId, token, platform, deviceId = null }) => {
  await ensurePushSchema();
  const normalizedToken = String(token || '').trim();
  if (!isExpoPushToken(normalizedToken)) {
    const error = new Error('Invalid Expo push token');
    error.statusCode = 400;
    throw error;
  }

  const normalizedPlatform = String(platform || '').toLowerCase();
  if (!['android', 'ios'].includes(normalizedPlatform)) {
    const error = new Error('Platform must be android or ios');
    error.statusCode = 400;
    throw error;
  }

  const result = await db.query(
    `INSERT INTO push_device_tokens (
       user_id, expo_push_token, platform, device_id, enabled, last_seen_at, updated_at
     )
     VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
     ON CONFLICT (expo_push_token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       device_id = EXCLUDED.device_id,
       enabled = TRUE,
       last_seen_at = NOW(),
       updated_at = NOW()
     RETURNING id, platform, device_id, last_seen_at`,
    [
      userId,
      normalizedToken,
      normalizedPlatform,
      deviceId ? String(deviceId).slice(0, 255) : null,
    ]
  );
  return result.rows[0];
};

const unregisterDevice = async ({ userId, token }) => {
  await ensurePushSchema();
  await db.query(
    `UPDATE push_device_tokens
     SET enabled = FALSE, updated_at = NOW()
     WHERE user_id = $1 AND expo_push_token = $2`,
    [userId, String(token || '').trim()]
  );
};

const sendPushToUser = async (userId, notification = {}) => {
  await ensurePushSchema();
  const tokenResult = await db.query(
    `SELECT expo_push_token
     FROM push_device_tokens
     WHERE user_id = $1 AND enabled = TRUE`,
    [userId]
  );
  if (!tokenResult.rows.length) return { sent: 0 };

  const messages = tokenResult.rows.map(({ expo_push_token: to }) => ({
    to,
    sound: 'default',
    title: String(notification.title || 'RentalHub NG').slice(0, 255),
    body: String(notification.body || '').slice(0, 1000),
    data: notification.data || {},
    channelId: notification.channelId || 'messages',
    priority: 'high',
  }));

  try {
    const response = await axios.post(EXPO_PUSH_URL, messages, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      timeout: 12000,
    });
    const tickets = Array.isArray(response.data?.data)
      ? response.data.data
      : [response.data?.data].filter(Boolean);
    const invalidTokens = tickets
      .map((ticket, index) =>
        ticket?.details?.error === 'DeviceNotRegistered'
          ? messages[index]?.to
          : null
      )
      .filter(Boolean);

    if (invalidTokens.length) {
      await db.query(
        `UPDATE push_device_tokens
         SET enabled = FALSE, updated_at = NOW()
         WHERE expo_push_token = ANY($1::text[])`,
        [invalidTokens]
      );
    }
    return { sent: messages.length, invalid: invalidTokens.length };
  } catch (error) {
    logger.error('Expo push delivery failed:', error.message);
    return { sent: 0, error: error.message };
  }
};

module.exports = {
  ensurePushSchema,
  isExpoPushToken,
  registerDevice,
  sendPushToUser,
  unregisterDevice,
};
