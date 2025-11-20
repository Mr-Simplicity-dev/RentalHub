const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
} = require('../utils/notificationService');

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
router.patch('/:notificationId/read', authenticate, async (req, res) => {
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