const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const messageController = require('../controllers/messageController');
const { authenticate, isVerified } = require('../config/middleware/auth');

// Send message
router.post('/',
  authenticate,
  isVerified,
  [
    body('receiver_id').isInt(),
    body('message_text').trim().notEmpty(),
    body('property_id').optional().isInt()
  ],
  messageController.sendMessage
);

// Get conversations list
router.get('/conversations',
  authenticate,
  messageController.getConversations
);

// Get messages with specific user
router.get('/conversation/:userId',
  authenticate,
  messageController.getConversationWithUser
);

// Get messages for specific property
router.get('/property/:propertyId',
  authenticate,
  messageController.getPropertyMessages
);

// Mark message as read
router.patch('/:messageId/read',
  authenticate,
  messageController.markAsRead
);

// Mark all messages from user as read
router.patch('/conversation/:userId/read-all',
  authenticate,
  messageController.markConversationAsRead
);

// Delete message
router.delete('/:messageId',
  authenticate,
  messageController.deleteMessage
);

// Get unread count
router.get('/unread/count',
  authenticate,
  messageController.getUnreadCount
);

module.exports = router;