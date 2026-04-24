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

  // Get eligible recipients based on current user role
  getRecipients: async (params = {}) => {
    const response = await api.get('/messages/recipients', { params });
    return response.data;
  },

  // Get escalations feed
  getEscalations: async () => {
    const response = await api.get('/messages/escalations');
    return response.data;
  },

  // Mark escalation as handled
  markEscalationHandled: async (messageId) => {
    const response = await api.patch(`/messages/escalations/${messageId}/handled`);
    return response.data;
  },

  // Convert escalation into tracked approval ticket
  convertEscalationToTicket: async (messageId) => {
    const response = await api.post(`/messages/escalations/${messageId}/ticket`);
    return response.data;
  },

  // Update tracked escalation ticket status
  updateEscalationTicketStatus: async (messageId, ticketStatus) => {
    const response = await api.patch(`/messages/escalations/${messageId}/ticket-status`, {
      ticket_status: ticketStatus,
    });
    return response.data;
  },
};
