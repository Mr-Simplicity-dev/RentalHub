const db = require('../middleware/database');
const logger = require('./logger');

/**
 * One number for the whole platform.
 *
 * The app icon badge, the web top-bar badge and the in-app badge all read from
 * here, so a person sees the same count everywhere. It is the sum of everything
 * unread that is waiting for them: support/app notifications plus unread direct
 * messages. Opening any one of them reduces the number by one.
 */

const safeCount = async (sql, params, label) => {
  try {
    const result = await db.query(sql, params);
    const value = Number(result.rows[0]?.count || 0);
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    // A missing table must never blank the badge; log and treat as zero.
    logger.warn(`Unread activity (${label}) failed: ${error.message}`);
    return 0;
  }
};

const countUnreadNotifications = (userId) =>
  safeCount(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId],
    'notifications'
  );

const countUnreadMessages = (userId) =>
  safeCount(
    'SELECT COUNT(*)::int AS count FROM messages WHERE receiver_id = $1 AND is_read = FALSE',
    [userId],
    'messages'
  );

exports.getUnreadActivityCount = async (userId) => {
  if (!userId) {
    return { total: 0, unreadNotifications: 0, unreadMessages: 0 };
  }

  const [unreadNotifications, unreadMessages] = await Promise.all([
    countUnreadNotifications(userId),
    countUnreadMessages(userId),
  ]);

  return {
    total: unreadNotifications + unreadMessages,
    unreadNotifications,
    unreadMessages,
  };
};

/**
 * The badge number to attach to a push payload. Called at send time so the
 * number that arrives while the app is closed is the real count, not a
 * hard-coded 1.
 */
exports.getPushBadgeCount = async (userId) => {
  const { total } = await exports.getUnreadActivityCount(userId);
  return total;
};

exports.countUnreadNotifications = countUnreadNotifications;
exports.countUnreadMessages = countUnreadMessages;
