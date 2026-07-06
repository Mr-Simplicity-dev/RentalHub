const express = require('express');
const { param } = require('express-validator');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
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
