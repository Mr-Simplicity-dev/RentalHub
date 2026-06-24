import api from './api';

const buildEscalationBody = ({ actionType, summary, payload }) => {
  const normalizedType = String(actionType || 'general_review').trim();
  const normalizedSummary = String(summary || '').trim();

  return {
    subject: `[Escalation] ${normalizedType.replace(/_/g, ' ')}`,
    message_text: JSON.stringify(
      {
        escalation_type: normalizedType,
        summary: normalizedSummary,
        payload: payload || {},
        requested_at: new Date().toISOString(),
      },
      null,
      2
    ),
  };
};

const resolveSuperAdminRecipient = async () => {
  const res = await api.get('/messages/recipients', {
    params: { role: 'super_admin' },
  });

  const recipients = res.data?.data || [];
  const superAdmin = recipients.find((item) => String(item.user_type || '').toLowerCase() === 'super_admin');

  if (!superAdmin?.id) {
    throw new Error('No active super admin recipient found for escalation');
  }

  return superAdmin;
};

export const approvalService = {
  async fetchPendingAdminApprovals() {
    const res = await api.get('/super/pending-admins');
    return res.data?.data || [];
  },

  async approvePendingAdmin(adminId) {
    const res = await api.patch(`/super/pending-admins/${adminId}/approve`);
    return res.data;
  },

  async rejectPendingAdmin(adminId) {
    const res = await api.patch(`/super/pending-admins/${adminId}/reject`);
    return res.data;
  },

  async fetchEscalations() {
    const res = await api.get('/messages/escalations');
    return res.data?.data || [];
  },

  async markEscalationHandled(escalationId) {
    const res = await api.patch(`/messages/escalations/${escalationId}/handled`);
    return res.data;
  },

  async convertEscalationToTicket(escalationId) {
    const res = await api.post(`/messages/escalations/${escalationId}/ticket`);
    return res.data;
  },

  async updateEscalationTicketStatus(escalationId, ticketStatus) {
    const res = await api.patch(`/messages/escalations/${escalationId}/ticket-status`, {
      ticket_status: ticketStatus,
    });
    return res.data;
  },

  async requestSensitiveActionEscalation({ actionType, summary, payload }) {
    const superAdmin = await resolveSuperAdminRecipient();
    const escalation = buildEscalationBody({ actionType, summary, payload });

    const res = await api.post('/messages', {
      receiver_id: superAdmin.id,
      message_type: 'escalation',
      subject: escalation.subject,
      message_text: escalation.message_text,
    });

    return res.data;
  },
};
