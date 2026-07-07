const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const db = require('../config/middleware/database');
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
} = require('../config/utils/notificationService');
const {
  registerDevice,
  unregisterDevice,
} = require('../config/utils/pushNotificationService');

const DEFAULT_NOTIFICATION_PREFERENCES = {
  pushMessages: true,
  pushPayments: true,
  pushApplications: true,
  pushBookings: true,
  adminAlerts: true,
};

const ALLOWED_PREFERENCE_KEYS = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);

const ensureNotificationPreferenceSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const normalizePreferences = (value = {}) =>
  ALLOWED_PREFERENCE_KEYS.reduce((acc, key) => {
    acc[key] =
      typeof value[key] === 'boolean'
        ? value[key]
        : DEFAULT_NOTIFICATION_PREFERENCES[key];
    return acc;
  }, {});

const pickPreferenceUpdates = (value = {}) =>
  ALLOWED_PREFERENCE_KEYS.reduce((acc, key) => {
    if (typeof value[key] === 'boolean') {
      acc[key] = value[key];
    }
    return acc;
  }, {});

router.post('/devices', authenticate, async (req, res) => {
  try {
    const device = await registerDevice({
      userId: req.user.id,
      token: req.body?.token,
      platform: req.body?.platform,
      deviceId: req.body?.device_id || null,
    });
    return res.status(201).json({ success: true, data: device });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to register device',
    });
  }
});

router.delete('/devices', authenticate, async (req, res) => {
  try {
    await unregisterDevice({
      userId: req.user.id,
      token: req.body?.token,
    });
    return res.json({ success: true, message: 'Device unregistered' });
  } catch {
    return res.status(500).json({
      success: false,
      message: 'Failed to unregister device',
    });
  }
});

router.get('/preferences', authenticate, async (req, res) => {
  try {
    await ensureNotificationPreferenceSchema();
    const result = await db.query(
      'SELECT preferences FROM user_notification_preferences WHERE user_id = $1',
      [req.user.id]
    );
    const preferences = normalizePreferences(result.rows[0]?.preferences || {});
    return res.json({ success: true, data: preferences });
  } catch (error) {
    req.logger?.error?.('Get notification preferences error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notification preferences',
    });
  }
});

router.patch(
  '/preferences',
  [
    body('preferences').optional().isObject().withMessage('Preferences must be an object'),
    ...ALLOWED_PREFERENCE_KEYS.map((key) => body(`preferences.${key}`).optional().isBoolean()),
  ],
  validateRequest,
  authenticate,
  async (req, res) => {
    try {
      await ensureNotificationPreferenceSchema();
      const updates = pickPreferenceUpdates(req.body?.preferences || req.body || {});

      const currentResult = await db.query(
        'SELECT preferences FROM user_notification_preferences WHERE user_id = $1',
        [req.user.id]
      );
      const current = normalizePreferences(currentResult.rows[0]?.preferences || {});
      const next = normalizePreferences({ ...current, ...updates });

      const result = await db.query(
        `INSERT INTO user_notification_preferences (user_id, preferences)
         VALUES ($1, $2)
         ON CONFLICT (user_id)
         DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = CURRENT_TIMESTAMP
         RETURNING preferences`,
        [req.user.id, JSON.stringify(next)]
      );

      return res.json({
        success: true,
        data: normalizePreferences(result.rows[0]?.preferences || next),
        message: 'Notification preferences saved',
      });
    } catch (error) {
      req.logger?.error?.('Update notification preferences error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update notification preferences',
      });
    }
  }
);

// Get user notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, unread_only = false } = req.query;

    const notifications = await getUserNotifications(
      userId, 
      parseInt(limit), 
      unread_only === 'true'
    );

    res.json({
      success: true,
      data: notifications
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

// Get unread count
router.get('/unread/count', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await getUnreadCount(userId);

    res.json({
      success: true,
      data: { unread_count: count }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count'
    });
  }
});

// Mark notification as read
router.patch('/:notificationId/read', [param('notificationId').isInt()], validateRequest, authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const success = await markAsRead(notificationId, userId);

    if (success) {
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

// Mark all notifications as read
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const success = await markAllAsRead(userId);

    if (success) {
      res.json({
        success: true,
        message: 'All notifications marked as read'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to mark notifications as read'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    });
  }
});

// Delete notification
router.delete('/:notificationId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const success = await deleteNotification(notificationId, userId);

    if (success) {
      res.json({
        success: true,
        message: 'Notification deleted'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification'
    });
  }
});

module.exports = router;
