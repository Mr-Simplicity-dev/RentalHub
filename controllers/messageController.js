const pool = require('../config/middleware/database');
const { validationResult } = require('express-validator');
const { sendMessageNotification } = require('../utils/emailService');

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const senderId = req.user.id;
    const { receiver_id, message_text, property_id } = req.body;

    // Verify receiver exists
    const receiverResult = await pool.query(
      'SELECT id, email, full_name FROM users WHERE id = $1',
      [receiver_id]
    );

    if (receiverResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    const receiver = receiverResult.rows[0];

    // Get sender info
    const senderResult = await pool.query(
      'SELECT full_name FROM users WHERE id = $1',
      [senderId]
    );
    const sender = senderResult.rows[0];

    // If property_id provided, verify it exists
    if (property_id) {
      const propertyCheck = await pool.query(
        'SELECT id, title FROM properties WHERE id = $1',
        [property_id]
      );

      if (propertyCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
    }

    // Insert message
    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, property_id, message_text, is_read)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING *`,
      [senderId, receiver_id, property_id || null, message_text]
    );

    const message = result.rows[0];

    // Send email notification
    await sendMessageNotification(
      receiver.email,
      receiver.full_name,
      sender.full_name,
      message_text
    );

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Get conversations list
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `WITH latest_messages AS (
         SELECT DISTINCT ON (
           CASE 
             WHEN sender_id = $1 THEN receiver_id 
             ELSE sender_id 
           END
         )
           CASE 
             WHEN sender_id = $1 THEN receiver_id 
             ELSE sender_id 
           END as other_user_id,
           id,
           sender_id,
           receiver_id,
           message_text,
           is_read,
           created_at,
           property_id
         FROM messages
         WHERE sender_id = $1 OR receiver_id = $1
         ORDER BY 
           CASE 
             WHEN sender_id = $1 THEN receiver_id 
             ELSE sender_id 
           END,
           created_at DESC
       )
       SELECT 
         lm.*,
         u.full_name as other_user_name,
         u.user_type as other_user_type,
         p.title as property_title,
         (SELECT COUNT(*) 
          FROM messages 
          WHERE sender_id = lm.other_user_id 
            AND receiver_id = $1 
            AND is_read = FALSE
         ) as unread_count
       FROM latest_messages lm
       JOIN users u ON lm.other_user_id = u.id
       LEFT JOIN properties p ON lm.property_id = p.id
       ORDER BY lm.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations'
    });
  }
};

// Get conversation with specific user
exports.getConversationWithUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userId: otherUserId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Get messages
    const result = await pool.query(
      `SELECT 
         m.*,
         s.full_name as sender_name,
         r.full_name as receiver_name,
         p.title as property_title
       FROM messages m
       JOIN users s ON m.sender_id = s.id
       JOIN users r ON m.receiver_id = r.id
       LEFT JOIN properties p ON m.property_id = p.id
       WHERE (m.sender_id = $1 AND m.receiver_id = $2)
          OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, otherUserId, limit, offset]
    );

    // Mark messages as read
    await pool.query(
      `UPDATE messages 
       SET is_read = TRUE 
       WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
      [otherUserId, userId]
    );

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2)
          OR (sender_id = $2 AND receiver_id = $1)`,
      [userId, otherUserId]
    );

    res.json({
      success: true,
      data: result.rows.reverse(), // Reverse to show oldest first
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation'
    });
  }
};

// Get messages for specific property
exports.getPropertyMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { propertyId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT 
         m.*,
         s.full_name as sender_name,
         r.full_name as receiver_name,
         p.title as property_title
       FROM messages m
       JOIN users s ON m.sender_id = s.id
       JOIN users r ON m.receiver_id = r.id
       JOIN properties p ON m.property_id = p.id
       WHERE m.property_id = $1
         AND (m.sender_id = $2 OR m.receiver_id = $2)
       ORDER BY m.created_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyId, userId, limit, offset]
    );

    res.json({
      success: true,
      data: result.rows.reverse()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property messages'
    });
  }
};

// Mark message as read
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const result = await pool.query(
      `UPDATE messages 
       SET is_read = TRUE 
       WHERE id = $1 AND receiver_id = $2
       RETURNING *`,
      [messageId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or unauthorized'
      });
    }

    res.json({
      success: true,
      message: 'Message marked as read',
      data: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as read'
    });
  }
};

// Mark all messages in conversation as read
exports.markConversationAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userId: otherUserId } = req.params;

    const result = await pool.query(
      `UPDATE messages 
       SET is_read = TRUE 
       WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE
       RETURNING id`,
      [otherUserId, userId]
    );

    res.json({
      success: true,
      message: `${result.rows.length} message(s) marked as read`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read'
    });
  }
};

// Delete message
exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    // Only sender can delete their message
    const result = await pool.query(
      'DELETE FROM messages WHERE id = $1 AND sender_id = $2 RETURNING id',
      [messageId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or unauthorized'
      });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete message'
    });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT COUNT(*) as unread_count FROM messages WHERE receiver_id = $1 AND is_read = FALSE',
      [userId]
    );

    res.json({
      success: true,
      data: {
        unread_count: parseInt(result.rows[0].unread_count)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count'
    });
  }
};

module.exports = exports;