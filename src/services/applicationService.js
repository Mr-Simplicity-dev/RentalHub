import api from './api';

export const applicationService = { // Submit application submitApplication: async (applicationData) => { const response = await api.post('/applications', applicationData); return response.data; },

// Get my applications (tenant) getMyApplications: async (params) => { const response = await api.get('/applications/my-applications', { params }); return response.data; },

// Get application by ID getApplicationById: async (id) => { const response = await api.get(/applications/${id}); return response.data; },

// Withdraw application withdrawApplication: async (id) => { const response = await api.patch(/applications/${id}/withdraw); return response.data; },

// Get received applications (landlord) getReceivedApplications: async (params) => { const response = await api.get('/applications/landlord/received', { params }); return response.data;},

  // Get applications for property
  getPropertyApplications: async (propertyId, params) => {
    const response = await api.get(`/applications/property/${propertyId}`, { params });
    return response.data;
  },

  // Approve application
  approveApplication: async (id) => {
    const response = await api.patch(`/applications/${id}/approve`);
    return response.data;
  },

  // Reject application
  rejectApplication: async (id, reason) => {
    const response = await api.patch(`/applications/${id}/reject`, { reason });
    return response.data;
  },

  // Get application stats
  getApplicationStats: async () => {
    const response = await api.get('/applications/landlord/stats');
    return response.data;
  },
};