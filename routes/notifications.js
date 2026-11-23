const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../config/middleware/auth');
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
  sendPushToAll,
  unregisterDevice,
} = require('../config/utils/pushNotificationService');
const spokenNotificationService = require('../config/utils/spokenNotificationService');

const DEFAULT_NOTIFICATION_PREFERENCES = {
  pushMessages: true,
  pushPayments: true,
  pushApplications: true,
  pushBookings: true,
  adminAlerts: true,
  updateAlerts: true,
  spokenNotificationsEnabled: false,
  spokenNotificationLanguage: 'en',
};

const ALLOWED_PREFERENCE_KEYS = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);
const BOOLEAN_PREFERENCE_KEYS = ALLOWED_PREFERENCE_KEYS.filter((key) => typeof DEFAULT_NOTIFICATION_PREFERENCES[key] === 'boolean');
const SPOKEN_LANGUAGE_OPTIONS = new Set(['en', 'ha', 'ig', 'yo']);

const ensureNotificationPreferenceSchema = () => db.query('SELECT user_id, preferences FROM user_notification_preferences WHERE FALSE');

const normalizePreferences = (value = {}) =>
  ALLOWED_PREFERENCE_KEYS.reduce((acc, key) => {
    const defaultValue = DEFAULT_NOTIFICATION_PREFERENCES[key];
    if (typeof defaultValue === 'boolean') {
      acc[key] = typeof value[key] === 'boolean' ? value[key] : defaultValue;
      return acc;
    }
    if (key === 'spokenNotificationLanguage') {
      const lang = String(value[key] || defaultValue).toLowerCase().split('-')[0];
      acc[key] = SPOKEN_LANGUAGE_OPTIONS.has(lang) ? lang : 'en';
      return acc;
    }
    acc[key] = value[key] ?? defaultValue;
    return acc;
  }, {});

const pickPreferenceUpdates = (value = {}) =>
  ALLOWED_PREFERENCE_KEYS.reduce((acc, key) => {
    const defaultValue = DEFAULT_NOTIFICATION_PREFERENCES[key];
    if (typeof defaultValue === 'boolean') {
      if (typeof value[key] === 'boolean') acc[key] = value[key];
      return acc;
    }
    if (key === 'spokenNotificationLanguage' && typeof value[key] === 'string') {
      const lang = value[key].toLowerCase().split('-')[0];
      if (SPOKEN_LANGUAGE_OPTIONS.has(lang)) acc[key] = lang;
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
    ...BOOLEAN_PREFERENCE_KEYS.map((key) => body(`preferences.${key}`).optional().isBoolean()),
    body('preferences.spokenNotificationLanguage').optional().isIn(['en', 'ha', 'ig', 'yo']),
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

router.post(
  '/mobile-update',
  [
    body('latest_version').optional().isString().trim().isLength({ max: 80 }),
    body('title').optional().isString().trim().isLength({ max: 120 }),
    body('body').optional().isString().trim().isLength({ max: 500 }),
    body('platform').optional().isIn(['android', 'ios']),
    body('download_url').optional().isString().trim().isLength({ max: 1000 }),
    body('apk_url').optional().isString().trim().isLength({ max: 1000 }),
  ],
  validateRequest,
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const latestVersion = String(req.body?.latest_version || process.env.MOBILE_LATEST_VERSION || '').trim();
      const platform = req.body?.platform ? String(req.body.platform).toLowerCase() : undefined;
      const result = await sendPushToAll(
        {
          title: req.body?.title || 'Update available',
          body: req.body?.body || 'A newer RentalHub app is ready. Open RentalHub to install the latest version.',
          channelId: 'general',
          data: {
            type: 'app_update',
            screen: 'Settings',
            latest_version: latestVersion || null,
            download_url: req.body?.download_url || null,
            apk_url: req.body?.apk_url || null,
          },
          badge: 1,
        },
        {
          platform,
          respectUpdateAlerts: true,
        }
      );

      return res.json({
        success: true,
        data: result,
        message: 'Mobile update notification queued',
      });
    } catch (error) {
      req.logger?.error?.('Mobile update push error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send mobile update notification',
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

// Combined unread activity for the app badge. Web, APK and iOS all read this
// one number so the badge agrees everywhere.
router.get('/unread/activity', authenticate, async (req, res) => {
  try {
    const { getUnreadActivityCount } = require('../config/utils/unreadActivityService');
    const counts = await getUnreadActivityCount(req.user.id);
    res.json({
      success: true,
      data: {
        total: counts.total,
        unread_count: counts.total,
        unread_notifications: counts.unreadNotifications,
        unread_messages: counts.unreadMessages,
      },
    });
  } catch (error) {
    req.logger?.error?.('Unread activity count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread activity count',
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

// Spoken notification events (Phase C) - user-owned, idempotent, non-read side effects
router.get('/spoken/pending', authenticate, async (req, res) => {
  try {
    await ensureNotificationPreferenceSchema();
    const prefResult = await db.query(
      'SELECT preferences FROM user_notification_preferences WHERE user_id = $1',
      [req.user.id]
    );
    const preferences = normalizePreferences(prefResult.rows[0]?.preferences || {});
    if (!preferences.spokenNotificationsEnabled) {
      return res.json({ success: true, enabled: false, data: [], count: 0 });
    }

    const events = await spokenNotificationService.getPendingEvents(req.user.id, {
      limit: Math.min(Number(req.query.limit) || 10, 10),
    });

    return res.json({
      success: true,
      enabled: true,
      data: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        sourceType: event.source_type,
        sourceId: event.source_id,
        dedupKey: event.dedup_key,
        title: event.title,
        message: event.message,
        language: event.language,
        audioKey: event.audio_key,
        payload: event.payload || {},
        status: event.status,
        expiresAt: event.expires_at,
        claimedAt: event.claimed_at,
        claimExpiresAt: event.claim_expires_at,
        createdAt: event.created_at,
      })),
      count: events.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get spoken notifications' });
  }
});

router.post(
  '/spoken/:eventId/claim',
  [
    param('eventId').isInt({ min: 1 }),
    body('deviceId').isString().isLength({ min: 1, max: 120 }),
    body('claimToken').isString().isLength({ min: 8, max: 120 }),
  ],
  validateRequest,
  authenticate,
  async (req, res) => {
    try {
      const event = await spokenNotificationService.claimEvent({
        userId: req.user.id,
        eventId: Number(req.params.eventId),
        deviceId: req.body?.deviceId,
        claimToken: req.body?.claimToken,
      });
      if (!event) {
        return res.status(409).json({ success: false, message: 'Spoken notification not claimable' });
      }
      return res.json({
        success: true,
        data: {
          id: event.id,
          status: event.status,
          claimedAt: event.claimed_at,
          claimExpiresAt: event.claim_expires_at,
          claimedByDevice: event.claimed_by_device,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to claim spoken notification' });
    }
  }
);

router.post(
  '/spoken/:eventId/ack',
  [
    param('eventId').isInt({ min: 1 }),
    body('deviceId').isString().isLength({ min: 1, max: 120 }),
    body('claimToken').isString().isLength({ min: 8, max: 120 }),
    body('outcome').optional().isIn(['success', 'failed', 'interrupted', 'unavailable', 'unsupported']),
    body('played').optional().isBoolean(),
    body('reason').optional().isString().isLength({ min: 1, max: 64 }),
  ],
  validateRequest,
  authenticate,
  async (req, res) => {
    try {
      const outcome = req.body?.outcome
        || (req.body?.played === true ? 'success' : 'failed');
      const result = await spokenNotificationService.recordPlaybackResult({
        userId: req.user.id,
        eventId: Number(req.params.eventId),
        deviceId: req.body?.deviceId,
        claimToken: req.body?.claimToken,
        outcome,
        reason: req.body?.reason,
      });
      if (!result?.event) {
        return res.status(404).json({ success: false, message: 'Spoken notification not found' });
      }
      return res.json({
        success: true,
        data: {
          id: result.event.id,
          status: result.event.status,
          acknowledged: !!result.acknowledged,
          acknowledgedAt: result.event.acknowledged_at,
          acknowledgedByDevice: result.event.acknowledged_by_device,
          attemptCount: result.event.attempt_count,
          lastFailureReason: result.event.last_failure_reason,
          nextEligibleAt: result.event.next_eligible_at,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to record spoken notification playback result' });
    }
  }
);

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
