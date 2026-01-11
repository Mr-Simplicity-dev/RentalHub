import api from './api';

export const messageService = {
  // Send message
  sendMessage: async (messageData) => {
    const response = await api.post('/messages', messageData);
    return response.data;
  },

  // Get conversations
  getConversations: async () => {
    const response = await api.get('/messages/conversations');
    return response.data;
  },

  // Get conversation with user
  getConversationWithUser: async (userId, params) => {
    const response = await api.get(`/messages/conversation/${userId}`, { params });
    return response.data;
  },

  // Get property messages
  getPropertyMessages: async (propertyId, params) => {
    const response = await api.get(`/messages/property/${propertyId}`, { params });
    return response.data;
  },

  // Mark message as read
  markAsRead: async (messageId) => {
    const response = await api.patch(`/messages/${messageId}/read`);
    return response.data;
  },

  // Mark conversation as read
  markConversationAsRead: async (userId) => {
    const response = await api.patch(`/messages/conversation/${userId}/read-all`);
    return response.data;
  },

  // Delete message
  deleteMessage: async (messageId) => {
    const response = await api.delete(`/messages/${messageId}`);
    return response.data;
  },

  // Get unread count
  getUnreadCount: async () => {
    const response = await api.get('/messages/unread/count');
    return response.data;
  },
};