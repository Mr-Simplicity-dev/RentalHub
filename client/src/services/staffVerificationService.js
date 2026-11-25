import api from './api';

export const staffVerificationService = {
  // Public endpoints (no authentication required)
  getPublicMeta: () => api.get('/staff-verification/public/meta'),
  lookupPublicStaff: (staffIdOrQr) =>
    api.post('/staff-verification/public/lookup', { query: staffIdOrQr }),
  lookupPublicStaffById: (staffId) =>
    api.get(`/staff-verification/public/lookup/${encodeURIComponent(staffId)}`),
  createLiveChallenge: (payload) =>
    api.post('/staff-verification/public/challenges', payload),
  pollLiveChallenge: (challengeReference, pollToken) =>
    api.get(`/staff-verification/public/challenges/${encodeURIComponent(challengeReference)}`, {
      headers: { 'x-challenge-poll-token': pollToken },
    }),
  submitImpersonationReport: (payload) =>
    api.post('/staff-verification/public/impersonation-reports', payload),

  // Authenticated staff endpoints
  getMyIdentity: () => api.get('/staff-verification/me'),
  lookupMyChallenge: (codeOrPayload) =>
    api.post('/staff-verification/me/challenges/lookup', { code: codeOrPayload }),
  respondToChallenge: (challengeReference, decision, note = '') =>
    api.post(
      `/staff-verification/me/challenges/${encodeURIComponent(challengeReference)}/respond`,
      { decision, note }
    ),

  // Super-admin management endpoints
  getAdminCatalog: () => api.get('/staff-verification/admin/catalog'),
  getEligibleUsers: (search = '') =>
    api.get('/staff-verification/admin/eligible-users', { params: { search } }),
  listIdentities: (params = {}) =>
    api.get('/staff-verification/admin/identities', { params }),
  createIdentity: (payload) =>
    api.post('/staff-verification/admin/identities', payload),
  updateIdentity: (id, payload) =>
    api.patch(`/staff-verification/admin/identities/${id}`, payload),
  uploadIdentityPhoto: (id, file) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.post(`/staff-verification/admin/identities/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  updateIdentityStatus: (id, action, reason = '') =>
    api.post(`/staff-verification/admin/identities/${id}/status`, { action, reason }),
  regenerateIdentityId: (id) =>
    api.post(`/staff-verification/admin/identities/${id}/regenerate-id`),
  getAdminHistory: (limit = 100) =>
    api.get('/staff-verification/admin/history', { params: { limit } }),
  listImpersonationReports: (status = '') =>
    api.get('/staff-verification/admin/impersonation-reports', {
      params: status ? { status } : {},
    }),
  updateImpersonationReport: (id, payload) =>
    api.patch(`/staff-verification/admin/impersonation-reports/${id}`, payload),
};

export default staffVerificationService;
