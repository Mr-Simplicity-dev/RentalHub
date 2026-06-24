import api from './api';

export const applicationService = {
  submitApplication: async (applicationData) => {
    const response = await api.post('/applications', applicationData);
    return response.data;
  },

  getMyApplications: async (params) => {
    const response = await api.get('/applications/my-applications', { params });
    return response.data;
  },

  getApplicationById: async (id) => {
    const response = await api.get(`/applications/${id}`);
    return response.data;
  },

  withdrawApplication: async (id) => {
    const response = await api.patch(`/applications/${id}/withdraw`);
    return response.data;
  },

  getReceivedApplications: async (params) => {
    const response = await api.get('/applications/landlord/received', { params });
    return response.data;
  },

  getPropertyApplications: async (propertyId, params) => {
    const response = await api.get(`/applications/property/${propertyId}`, { params });
    return response.data;
  },

  approveApplication: async (id) => {
    const response = await api.patch(`/applications/${id}/approve`);
    return response.data;
  },

  rejectApplication: async (id, reason) => {
    const response = await api.patch(`/applications/${id}/reject`, { reason });
    return response.data;
  },

  updateTenantOffer: async (id, payload) => {
    const response = await api.patch(`/applications/${id}/offer`, payload);
    return response.data;
  },

  respondToCounterOffer: async (id, payload) => {
    const response = await api.patch(`/applications/${id}/respond-counter`, payload);
    return response.data;
  },

  acceptTenantOffer: async (id, payload = {}) => {
    const response = await api.patch(`/applications/${id}/accept-offer`, payload);
    return response.data;
  },

  sendCounterOffer: async (id, payload) => {
    const response = await api.patch(`/applications/${id}/counter-offer`, payload);
    return response.data;
  },

  getApplicationStats: async () => {
    const response = await api.get('/applications/landlord/stats');
    return response.data;
  },
};
