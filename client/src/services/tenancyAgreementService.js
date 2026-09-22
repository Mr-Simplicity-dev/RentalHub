import api from './api';

export const tenancyAgreementService = {
  list: async (params) => {
    const response = await api.get('/tenancy-agreements', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/tenancy-agreements/${id}`);
    return response.data;
  },

  createFromApplication: async (applicationId) => {
    const response = await api.post('/tenancy-agreements', { application_id: applicationId });
    return response.data;
  },

  review: async (id, role) => {
    const response = await api.post(`/tenancy-agreements/${id}/review`, { role });
    return response.data;
  },

  sign: async (id, { role, consent, signatoryName }) => {
    const response = await api.post(`/tenancy-agreements/${id}/sign`, {
      role,
      consent,
      signatory_name: signatoryName,
    });
    return response.data;
  },

  decline: async (id, { role, reason }) => {
    const response = await api.post(`/tenancy-agreements/${id}/decline`, { role, reason });
    return response.data;
  },

  amend: async (id, { role, changes, note }) => {
    const response = await api.post(`/tenancy-agreements/${id}/amend`, { role, changes, note });
    return response.data;
  },

  getDocument: async (id) => {
    const response = await api.get(`/tenancy-agreements/${id}/document`);
    return response.data;
  },

  getAudit: async (id) => {
    const response = await api.get(`/tenancy-agreements/${id}/audit`);
    return response.data;
  },
};

export const TENANCY_AGREEMENT_STATUS_LABELS = {
  DRAFT: 'Draft',
  PENDING_LANDLORD_REVIEW: 'Awaiting landlord review',
  PENDING_LANDLORD_SIGNATURE: 'Awaiting landlord signature',
  PENDING_TENANT_REVIEW: 'Awaiting tenant review',
  PENDING_TENANT_SIGNATURE: 'Awaiting tenant signature',
  PARTIALLY_EXECUTED: 'Partially executed',
  FULLY_EXECUTED: 'Fully executed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  AMENDED: 'Amended',
  SUPERSEDED: 'Superseded',
};

export const TENANCY_AGREEMENT_STATUS_TONES = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDING_LANDLORD_REVIEW: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING_LANDLORD_SIGNATURE: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING_TENANT_REVIEW: 'bg-sky-100 text-sky-800 border-sky-200',
  PENDING_TENANT_SIGNATURE: 'bg-sky-100 text-sky-800 border-sky-200',
  PARTIALLY_EXECUTED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  FULLY_EXECUTED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  DECLINED: 'bg-red-100 text-red-800 border-red-200',
  CANCELLED: 'bg-slate-200 text-slate-700 border-slate-300',
  EXPIRED: 'bg-slate-200 text-slate-700 border-slate-300',
  AMENDED: 'bg-violet-100 text-violet-800 border-violet-200',
  SUPERSEDED: 'bg-slate-200 text-slate-700 border-slate-300',
};

export default tenancyAgreementService;
