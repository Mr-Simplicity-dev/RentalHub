const pool = require('../middleware/database');

// Create notification table
const createNotificationTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      link VARCHAR(500),
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
  `);
};

// Create notification
exports.createNotification = async (userId, type, title, message, link = null) => {
  try {
    const result = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, type, title, message, link]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

// Get user notifications
exports.getUserNotifications = async (userId, limit = 20, unreadOnly = false) => {
  try {
    let query = 'SELECT * FROM notifications WHERE user_id = $1';
    const params = [userId];

    if (unreadOnly) {
      query += ' AND is_read = FALSE';
    }

    query += ' ORDER BY created_at DESC LIMIT $2';
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Get notifications error:', error);
    return [];
  }
};

// Mark notification as read
exports.markAsRead = async (notificationId, userId) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );
    return true;
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return false;
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (userId) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    return true;
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    return false;
  }
};

// Delete notification
exports.deleteNotification = async (notificationId, userId) => {
  try {
    await db.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );
    return true;
  } catch (error) {
    console.error('Delete notification error:', error);
    return false;
  }
};

// Get unread count
exports.getUnreadCount = async (userId) => {
  try {
    const result = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Get unread count error:', error);
    return 0;
  }
};

// Initialize notification table
createNotificationTable().catch(console.error);

module.exports = exports;
