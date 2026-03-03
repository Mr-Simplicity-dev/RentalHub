const db = require('../config/middleware/database');
const { validationResult } = require('express-validator');
const { sendMessageNotification } = require('../config/utils/emailService');

let messageSchemaReady = false;

const ensureMessageSchema = async () => {
  if (messageSchemaReady) return;

  await db.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS subject VARCHAR(180),
    ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'general';

    CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread
      ON messages(receiver_id, is_read);

    CREATE INDEX IF NOT EXISTS idx_messages_message_type
      ON messages(message_type);
  `);

  messageSchemaReady = true;
};

const canSendMessage = (senderRole, receiverRole, messageType) => {
  // Super admin can send to admins, tenants, and landlords.
  if (senderRole === 'super_admin') {
    return ['admin', 'tenant', 'landlord'].includes(receiverRole);
  }

  // Admin can message tenants/landlords and can escalate to super admin.
  if (senderRole === 'admin') {
    if (messageType === 'escalation') return receiverRole === 'super_admin';
    return ['tenant', 'landlord'].includes(receiverRole);
  }

  // Tenant and landlord are receive-only in internal messaging.
  if (['tenant', 'landlord'].includes(senderRole)) return false;

  return false;
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    await ensureMessageSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const senderId = req.user.id;
    const senderRole = req.user.user_type;
    const {
      receiver_id,
      message_text,
      property_id,
      subject,
      message_type = 'general',
    } = req.body;

    // Verify receiver exists
    const receiverResult = await db.query(
      'SELECT id, email, full_name, user_type FROM users WHERE id = $1',
      [receiver_id]
    );

    if (receiverResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    const receiver = receiverResult.rows[0];
    const messageType = String(message_type || 'general').toLowerCase();

    if (!['general', 'escalation'].includes(messageType)) {
      return res.status(400).json({
        success: false,
        message: 'message_type must be either general or escalation',
      });
    }

    if (messageType === 'escalation' && senderRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can send escalation messages',
      });
    }

    if (!canSendMessage(senderRole, receiver.user_type, messageType)) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to send messages to this user',
      });
    }

    // Get sender info
    const senderResult = await db.query(
      'SELECT full_name FROM users WHERE id = $1',
      [senderId]
    );
    const sender = senderResult.rows[0];

    // If property_id provided, verify it exists
    if (property_id) {
      const propertyCheck = await db.query(
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
    const result = await db.query(
      `INSERT INTO messages (sender_id, receiver_id, property_id, message_text, subject, message_type, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING *`,
      [
        senderId,
        receiver_id,
        property_id || null,
        message_text,
        subject ? String(subject).trim() : null,
        messageType,
      ]
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
    await ensureMessageSchema();

    const userId = req.user.id;

    const result = await db.query(
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
           subject,
           message_type,
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
    await ensureMessageSchema();

    const userId = req.user.id;
    const otherUserId = parseInt(req.params.userId, 10);

    if (!otherUserId || isNaN(otherUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;

    // Get messages
    const result = await db.query(
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

    // Mark unread messages as read
    await db.query(
      `UPDATE messages 
       SET is_read = TRUE 
       WHERE sender_id = $1 
         AND receiver_id = $2 
         AND is_read = FALSE`,
      [otherUserId, userId]
    );
// 🔐 Audit Log
await db.query(
  `INSERT INTO audit_logs 
   (actor_id, action, target_type, target_id, ip_address)
   VALUES ($1, $2, $3, $4, $5)`,
  [req.user.id, 'Viewed conversation', 'conversation', otherUserId, req.ip]
);
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2)
          OR (sender_id = $2 AND receiver_id = $1)`,
      [userId, otherUserId]
    );

    // 🔐 AUDIT LOG (Safe + Non-blocking)
    try {
      const { logAction } = require('../utils/auditLogger');

      await logAction({
        actorId: userId,
        action: 'Viewed conversation',
        targetType: 'conversation',
        targetId: otherUserId,
        ip: req.ip
      });
    } catch (logError) {
      console.error('Audit log error:', logError.message);
    }

    return res.json({
      success: true,
      data: result.rows.reverse(), // Oldest first
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10)
      }
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation'
    });
  }
};

// Get messages for specific property
exports.getPropertyMessages = async (req, res) => {
  try {
    await ensureMessageSchema();

    const userId = req.user.id;
    const { propertyId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
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
    await ensureMessageSchema();

    const userId = req.user.id;
    const { messageId } = req.params;

    const result = await db.query(
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
    await ensureMessageSchema();

    const userId = req.user.id;
    const { userId: otherUserId } = req.params;

    const result = await db.query(
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
    await ensureMessageSchema();

    const userId = req.user.id;
    const { messageId } = req.params;

    // Only sender can delete their message
    const result = await db.query(
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
    await ensureMessageSchema();

    const userId = req.user.id;

    const result = await db.query(
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

// Get recipients allowed for current user
exports.getEligibleRecipients = async (req, res) => {
  try {
    await ensureMessageSchema();

    const { role = '', q = '' } = req.query;
    const userId = req.user.id;
    const userRole = req.user.user_type;
    const requestedRole = String(role || '').trim().toLowerCase();
    const search = String(q || '').trim();

    let allowedRoles = [];
    if (userRole === 'super_admin') {
      allowedRoles = ['admin', 'tenant', 'landlord'];
    } else if (userRole === 'admin') {
      allowedRoles = ['tenant', 'landlord', 'super_admin'];
    } else if (['tenant', 'landlord'].includes(userRole)) {
      // Receive-only roles do not get sender recipient list.
      allowedRoles = [];
    } else {
      return res.json({ success: true, data: [] });
    }

    if (requestedRole && !allowedRoles.includes(requestedRole)) {
      return res.json({ success: true, data: [] });
    }

    const rolesFilter = requestedRole ? [requestedRole] : allowedRoles;
    if (!rolesFilter.length) {
      return res.json({ success: true, data: [] });
    }
    const params = [userId, rolesFilter];
    let idx = 3;

    let where = `
      WHERE u.id <> $1
        AND u.user_type = ANY($2)
        AND COALESCE(u.is_active, TRUE) = TRUE
    `;

    if (search) {
      where += ` AND (
        u.full_name ILIKE $${idx}
        OR u.email ILIKE $${idx}
      )`;
      params.push(`%${search}%`);
      idx += 1;
    }

    const result = await db.query(
      `SELECT u.id, u.full_name, u.email, u.user_type
       FROM users u
       ${where}
       ORDER BY
         CASE u.user_type
           WHEN 'super_admin' THEN 1
           WHEN 'admin' THEN 2
           WHEN 'landlord' THEN 3
           WHEN 'tenant' THEN 4
           ELSE 5
         END,
         u.full_name ASC
       LIMIT 200`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get eligible recipients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch eligible recipients',
    });
  }
};

// Escalation feed: admins see their escalations; super admins see escalations sent to them.
exports.getEscalations = async (req, res) => {
  try {
    await ensureMessageSchema();

    const userId = req.user.id;
    const userRole = req.user.user_type;

    if (!['admin', 'super_admin'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    let query = '';
    let params = [];

    if (userRole === 'admin') {
      query = `
        SELECT m.id, m.subject, m.message_text, m.is_read, m.created_at,
               s.id AS sender_id, s.full_name AS sender_name, s.user_type AS sender_role,
               r.id AS receiver_id, r.full_name AS receiver_name, r.user_type AS receiver_role
        FROM messages m
        JOIN users s ON s.id = m.sender_id
        JOIN users r ON r.id = m.receiver_id
        WHERE m.message_type = 'escalation'
          AND m.sender_id = $1
        ORDER BY m.created_at DESC
        LIMIT 200
      `;
      params = [userId];
    } else {
      query = `
        SELECT m.id, m.subject, m.message_text, m.is_read, m.created_at,
               s.id AS sender_id, s.full_name AS sender_name, s.user_type AS sender_role,
               r.id AS receiver_id, r.full_name AS receiver_name, r.user_type AS receiver_role
        FROM messages m
        JOIN users s ON s.id = m.sender_id
        JOIN users r ON r.id = m.receiver_id
        WHERE m.message_type = 'escalation'
          AND m.receiver_id = $1
        ORDER BY m.created_at DESC
        LIMIT 200
      `;
      params = [userId];
    }

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get escalations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch escalations',
    });
  }
};

module.exports = exports;
