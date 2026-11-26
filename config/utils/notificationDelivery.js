const db = require('../middleware/database');
const logger = require('./logger');
const push = require('./pushNotificationService');
const unread = require('./unreadActivityService');

const preferenceFor = (data = {}) => {
  const type = String(data.type || '').toLowerCase();
  if (data.screen === 'Messages' || /message|chat|support|dispute|case|missed_call/.test(type)) return 'pushMessages';
  if (/payment|wallet|receipt|refund|rent_saving|rent_due|rent_reminder|withdrawal/.test(type)) return 'pushPayments';
  if (/application|recruitment/.test(type)) return 'pushApplications';
  if (/booking|provider_assignment|fumigation|transport/.test(type)) return 'pushBookings';
  if (/admin|staff_verification/.test(type)) return 'adminAlerts';
  return 'updateAlerts';
};

async function sendOrdinaryPush(userId, notification, { q = db, sendPush = push.sendPushToUser } = {}) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) return { sent: 0 };
  try {
    const preferences = (await q.query('SELECT preferences FROM user_notification_preferences WHERE user_id=$1', [userId])).rows[0]?.preferences || {};
    if (preferences[preferenceFor(notification.data)] === false) return { sent: 0, disabled: true };
    const badge = notification.badge ?? await unread.getPushBadgeCount(userId, q);
    return await sendPush(userId, { ...notification, badge: Math.max(0, Number(badge) || 0) }, { q });
  } catch (error) {
    logger.warn('Background notification delivery failed:', error.message);
    return { sent: 0, error: 'delivery-unavailable' };
  }
}

async function deliverNotification(notification, options = {}) {
  if (!notification?.id || !notification.user_id) return { sent: 0 };
  const relatedId = Number(notification.related_id);
  const link = notification.link || (notification.related_type === 'fumigation_cleaning_booking' && Number.isSafeInteger(relatedId) && relatedId > 0 ? `/fumigation-cleaning/bookings/${relatedId}` : '');
  return sendOrdinaryPush(notification.user_id, {
    title: notification.title,
    body: notification.message,
    data: { notificationId: String(notification.id), type: String(notification.type || ''), link },
    channelId: notification.type === 'message' ? 'messages' : 'general',
  }, options);
}
module.exports = { preferenceFor, sendOrdinaryPush, deliverNotification };
