import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  FaBriefcase,
  FaCalendarAlt,
  FaCheckCircle,
  FaDownload,
  FaEnvelope,
  FaMapMarkerAlt,
  FaPaperPlane,
  FaPlus,
  FaSearch,
  FaSortAmountDown,
  FaSpinner,
  FaToggleOff,
  FaToggleOn,
  FaUsers,
  FaVideo,
  FaEdit,
  FaSave,
  FaTimes,
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';

const EMPTY_CYCLE = {
  title: '',
  open_date: '',
  close_date: '',
  extension_date: '',
};

const EMPTY_ROLE = {
  title: '',
  type: 'Administrative',
  description: '',
  application_fee: '5000',
  premium_fee: '8000',
  cycle_id: '',
};

const EMPTY_LOCATION = {
  state_name: '',
  lga_name: '',
  is_active: true,
};

const EMPTY_FILTERS = {
  search: '',
  state: '',
  lga: '',
  area: '',
  role_id: '',
  status: '',
  payment_status: '',
};

const statusOptions = ['', 'draft', 'submitted', 'under_review', 'shortlisted', 'approved', 'rejected', 'disqualified'];
const paymentOptions = ['', 'pending', 'paid', 'failed', 'refunded'];

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

const statusBadge = (status) => {
  const styles = {
    draft: 'bg-slate-100 text-slate-700 border-slate-200',
    submitted: 'bg-blue-100 text-blue-700 border-blue-200',
    under_review: 'bg-amber-100 text-amber-700 border-amber-200',
    shortlisted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
    disqualified: 'bg-red-100 text-red-700 border-red-200',
  };
  return styles[status] || 'bg-slate-100 text-slate-700 border-slate-200';
};

const paymentBadge = (status) => {
  const styles = {
    paid: 'badge-success',
    pending: 'badge-warning',
    failed: 'badge-danger',
    refunded: 'bg-purple-100 text-purple-700',
  };
  return styles[status] || 'badge bg-slate-100 text-slate-700';
};

export default function RecruitmentAdminTab() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [status, setStatus] = useState({ is_active: false });
  const [cycles, setCycles] = useState([]);
  const [roles, setRoles] = useState([]);
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [locations, setLocations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [cycleForm, setCycleForm] = useState(EMPTY_CYCLE);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE);
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState([]);
  const [triggerModal, setTriggerModal] = useState(false);
  const [triggerForm, setTriggerForm] = useState({ cycle_id: '', role_id: '', interview_date: '' });

  // Edit states
  const [editingCycle, setEditingCycle] = useState(null);
  const [editCycleForm, setEditCycleForm] = useState(EMPTY_CYCLE);
  const [editingRole, setEditingRole] = useState(null);
  const [editRoleForm, setEditRoleForm] = useState(EMPTY_ROLE);
  const [savingEdit, setSavingEdit] = useState(false);

  const activeLocations = useMemo(
    () => locations.filter((location) => location.is_active),
    [locations]
  );

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, cyclesRes, rolesRes, statesRes, locationsRes, analyticsRes] = await Promise.all([
        api.get('/recruitment/status'),
        api.get('/recruitment/admin/cycles'),
        api.get('/recruitment/admin/roles'),
        api.get('/recruitment/locations/states'),
        api.get('/recruitment/admin/locations'),
        api.get('/recruitment/admin/analytics'),
      ]);

      setStatus(statusRes.data?.data || { is_active: false });
      setCycles(cyclesRes.data?.data || []);
      setRoles(rolesRes.data?.data || []);
      setStates(statesRes.data?.data || []);
      setLocations(locationsRes.data?.data || []);
      setAnalytics(analyticsRes.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load recruitment dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadApplicants = useCallback(async (page = 1) => {
    try {
      const res = await api.get('/recruitment/admin/applicants', {
        params: {
          ...filters,
          page,
          limit: 20,
        },
      });
      setApplicants(res.data?.data || []);
      setPagination(res.data?.pagination || { page, totalPages: 1, total: 0 });
      setSelectedIds([]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load applicants');
    }
  }, [filters]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    loadApplicants(1);
  }, [loadApplicants]);

  useEffect(() => {
    if (!locationForm.state_name) {
      setLgas([]);
      return;
    }

    let active = true;
    api.get(`/recruitment/locations/lgas/${encodeURIComponent(locationForm.state_name)}`)
      .then((res) => {
        if (active) setLgas(res.data?.data || []);
      })
      .catch(() => {
        if (active) setLgas([]);
      });

    return () => {
      active = false;
    };
  }, [locationForm.state_name]);

  const toggleRecruitment = async () => {
    setSaving(true);
    try {
      const next = !status.is_active;
      await api.put('/recruitment/admin/settings/toggle', { is_active: next });
      setStatus({ is_active: next });
      toast.success(next ? 'Recruitment opened' : 'Recruitment closed');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update recruitment status');
    } finally {
      setSaving(false);
    }
  };

  const createCycle = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/recruitment/admin/cycles', cycleForm);
      toast.success('Recruitment cycle created');
      setCycleForm(EMPTY_CYCLE);
      await loadCore();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create cycle');
    } finally {
      setSaving(false);
    }
  };

  const createRole = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/recruitment/admin/roles', roleForm);
      toast.success('Recruitment role created');
      setRoleForm(EMPTY_ROLE);
      await loadCore();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  const updateCycle = async () => {
    setSavingEdit(true);
    try {
      await api.put(`/recruitment/admin/cycles/${editingCycle.id}`, editCycleForm);
      toast.success('Cycle updated');
      setEditingCycle(null);
      setEditCycleForm(EMPTY_CYCLE);
      await loadCore();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update cycle');
    } finally {
      setSavingEdit(false);
    }
  };

  const updateRole = async () => {
    setSavingEdit(true);
    try {
      await api.put(`/recruitment/admin/roles/${editingRole.id}`, editRoleForm);
      toast.success('Role updated');
      setEditingRole(null);
      setEditRoleForm(EMPTY_ROLE);
      await loadCore();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update role');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleLocation = async (event) => {
    event.preventDefault();
    if (!locationForm.state_name) {
      toast.error('Select state first');
      return;
    }

    setSaving(true);
    try {
      await api.put('/recruitment/admin/locations/toggle', {
        ...locationForm,
        lga_name: locationForm.lga_name || '__ALL__',
      });
      toast.success('Recruitment location updated');
      setLocationForm(EMPTY_LOCATION);
      await loadCore();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update location');
    } finally {
      setSaving(false);
    }
  };

  const updateApplicant = async (id, action, body = {}) => {
    try {
      await api.post(`/recruitment/admin/applicants/${id}/${action}`, body);
      toast.success(`Applicant ${action}ed`);
      await loadApplicants(pagination.page);
      await loadCore();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to ${action} applicant`);
    }
  };

  const bulkProcess = async (statusValue) => {
    if (!selectedIds.length) {
      toast.error('Select at least one applicant');
      return;
    }
    try {
      await api.post('/recruitment/admin/applicants/bulk-process', {
        application_ids: selectedIds,
        status: statusValue,
      });
      toast.success('Applicants updated');
      await loadApplicants(pagination.page);
      await loadCore();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Bulk update failed');
    }
  };

  const setInterviewDate = async (applicant) => {
    const value = window.prompt('Interview date and time (YYYY-MM-DD HH:mm)', '');
    if (!value) return;
    await updateApplicant(applicant.id, 'set-interview', {
      interview_date: value.replace(' ', 'T'),
    });
  };

  const triggerInterview = async () => {
    setTriggering(true);
    try {
      const body = {};
      if (triggerForm.interview_date) body.interview_date = triggerForm.interview_date;
      if (triggerForm.cycle_id) body.cycle_id = triggerForm.cycle_id;
      if (triggerForm.role_id) body.role_id = triggerForm.role_id;

      const res = await api.post('/recruitment/admin/interviews/trigger', body);
      toast.success(res.data?.message || 'Interviews triggered successfully');
      setTriggerModal(false);
      setTriggerForm({ cycle_id: '', role_id: '', interview_date: '' });
      await loadApplicants(pagination.page);
      await loadCore();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to trigger interviews');
    } finally {
      setTriggering(false);
    }
  };

  const downloadBlob = async (path, filename, params = {}) => {
    try {
      const res = await api.get(path, { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Download failed');
    }
  };

  const emailExport = async () => {
    try {
      await api.post('/recruitment/admin/email-documents', filters);
      toast.success('Recruitment export sent to email');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Email export failed');
    }
  };

  const handleSelected = (id, checked) => {
    setSelectedIds((prev) => (
      checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)
    ));
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-elevated-lg"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
              Recruitment Control
            </p>
            <h2 className="mt-2 text-3xl font-black">Career Module</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Manage recruitment cycles, role fees, location activation, applicants, document exports, and interview activation.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Trigger Interview Button */}
            <button
              type="button"
              onClick={() => setTriggerModal(true)}
              disabled={loading || !status.is_active}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-500 hover:to-indigo-600 transition-all disabled:opacity-50"
            >
              <FaVideo /> Trigger Interview
            </button>

            <button
              type="button"
              onClick={toggleRecruitment}
              disabled={saving}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-sm transition ${
                status.is_active
                  ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                  : 'bg-slate-100 text-slate-900 hover:bg-white'
              } disabled:opacity-50`}
            >
              {status.is_active ? <FaToggleOn /> : <FaToggleOff />}
              {status.is_active ? 'Recruitment Open' : 'Recruitment Closed'}
            </button>
          </div>
        </div>
      </motion.section>

      {/* ─── Metric Cards ───────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard icon={<FaUsers />} label="Total Applicants" value={analytics?.total_applicants || 0} color="blue" />
        <MetricCard icon={<FaBriefcase />} label="Fees Collected" value={formatCurrency(analytics?.total_fees_collected || 0)} color="emerald" />
        <MetricCard icon={<FaCheckCircle />} label="Interview Completed" value={analytics?.interview?.completed || 0} color="indigo" />
        <MetricCard icon={<FaMapMarkerAlt />} label="Active Locations" value={activeLocations.length} color="amber" />
      </motion.section>

      {/* ─── Loading ────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <FaSpinner className="animate-spin text-primary-500" />
          <p className="text-sm font-medium text-slate-500">Loading recruitment dashboard...</p>
        </div>
      )}

      {/* ─── Management Forms ───────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid gap-5 xl:grid-cols-3"
      >
        {/* Cycles */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-elevated">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <FaCalendarAlt />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Manage Cycles</h3>
          </div>
          <form onSubmit={createCycle} className="space-y-3">
            <AdminInput label="Cycle Title" value={cycleForm.title} onChange={(v) => setCycleForm((p) => ({ ...p, title: v }))} required />
            <div className="grid grid-cols-2 gap-3">
              <AdminInput label="Open Date" type="date" value={cycleForm.open_date} onChange={(v) => setCycleForm((p) => ({ ...p, open_date: v }))} required />
              <AdminInput label="Close Date" type="date" value={cycleForm.close_date} onChange={(v) => setCycleForm((p) => ({ ...p, close_date: v }))} required />
            </div>
            <AdminInput label="Extension Date (optional)" type="date" value={cycleForm.extension_date} onChange={(v) => setCycleForm((p) => ({ ...p, extension_date: v }))} />
            <button type="submit" disabled={saving} className="btn btn-primary w-full">
              {saving ? <><FaSpinner className="animate-spin mr-2" /> Creating...</> : <><FaPlus className="mr-2" /> Create Cycle</>}
            </button>
          </form>
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
            {cycles.map((cycle) => (
              <div key={cycle.id}>
                {editingCycle?.id === cycle.id ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                    <AdminInput label="Title" value={editCycleForm.title} onChange={(v) => setEditCycleForm((p) => ({ ...p, title: v }))} />
                    <AdminInput label="Open Date" type="date" value={editCycleForm.open_date} onChange={(v) => setEditCycleForm((p) => ({ ...p, open_date: v }))} />
                    <AdminInput label="Close Date" type="date" value={editCycleForm.close_date} onChange={(v) => setEditCycleForm((p) => ({ ...p, close_date: v }))} />
                    <AdminInput label="Extension Date" type="date" value={editCycleForm.extension_date} onChange={(v) => setEditCycleForm((p) => ({ ...p, extension_date: v }))} />
                    <div className="flex gap-2">
                      <button type="button" onClick={updateCycle} disabled={savingEdit} className="btn btn-sm bg-blue-600 text-white hover:bg-blue-700 flex-1">
                        {savingEdit ? <><FaSpinner className="animate-spin mr-1" /> Saving</> : <><FaSave className="mr-1" /> Save</>}
                      </button>
                      <button type="button" onClick={() => { setEditingCycle(null); setEditCycleForm(EMPTY_CYCLE); }} className="btn btn-sm bg-slate-200 text-slate-700 hover:bg-slate-300">
                        <FaTimes />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{cycle.title}</p>
                        <p className="text-xs text-slate-500">{formatDate(cycle.open_date)} - {formatDate(cycle.extension_date || cycle.close_date)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCycle(cycle);
                          setEditCycleForm({
                            title: cycle.title || '',
                            open_date: cycle.open_date ? cycle.open_date.substring(0, 10) : '',
                            close_date: cycle.close_date ? cycle.close_date.substring(0, 10) : '',
                            extension_date: cycle.extension_date ? cycle.extension_date.substring(0, 10) : '',
                          });
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                        title="Edit cycle"
                      >
                        <FaEdit className="text-xs" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {cycles.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No cycles yet</p>}
          </div>
        </div>

        {/* Roles */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-elevated">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <FaBriefcase />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Manage Roles</h3>
          </div>
          <form onSubmit={createRole} className="space-y-3">
            <AdminSelect label="Cycle" value={roleForm.cycle_id} onChange={(v) => setRoleForm((p) => ({ ...p, cycle_id: v }))} required>
              <option value="">Select cycle</option>
              {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.title}</option>)}
            </AdminSelect>
            <AdminInput label="Position Title" value={roleForm.title} onChange={(v) => setRoleForm((p) => ({ ...p, title: v }))} required />
            <AdminSelect label="Type" value={roleForm.type} onChange={(v) => setRoleForm((p) => ({ ...p, type: v }))}>
              <option value="Administrative">Administrative</option>
              <option value="Technical">Technical</option>
            </AdminSelect>
            <div className="grid grid-cols-2 gap-3">
              <AdminInput label="Standard Fee (₦)" type="number" value={roleForm.application_fee} onChange={(v) => setRoleForm((p) => ({ ...p, application_fee: v }))} />
              <AdminInput label="Premium Fee (₦)" type="number" value={roleForm.premium_fee} onChange={(v) => setRoleForm((p) => ({ ...p, premium_fee: v }))} />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Description</span>
              <textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="input w-full resize-none"
              />
            </label>
            <button type="submit" disabled={saving} className="btn w-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-md">
              {saving ? <><FaSpinner className="animate-spin mr-2" /> Creating...</> : <><FaPlus className="mr-2" /> Create Role</>}
            </button>
          </form>
          {/* Roles List */}
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
            {roles.map((role) => (
              <div key={role.id}>
                {editingRole?.id === role.id ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                    <AdminSelect label="Cycle" value={editRoleForm.cycle_id} onChange={(v) => setEditRoleForm((p) => ({ ...p, cycle_id: v }))}>
                      <option value="">Select cycle</option>
                      {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.title}</option>)}
                    </AdminSelect>
                    <AdminInput label="Title" value={editRoleForm.title} onChange={(v) => setEditRoleForm((p) => ({ ...p, title: v }))} />
                    <AdminSelect label="Type" value={editRoleForm.type} onChange={(v) => setEditRoleForm((p) => ({ ...p, type: v }))}>
                      <option value="Administrative">Administrative</option>
                      <option value="Technical">Technical</option>
                    </AdminSelect>
                    <div className="grid grid-cols-2 gap-2">
                      <AdminInput label="Standard Fee (₦)" type="number" value={editRoleForm.application_fee} onChange={(v) => setEditRoleForm((p) => ({ ...p, application_fee: v }))} />
                      <AdminInput label="Premium Fee (₦)" type="number" value={editRoleForm.premium_fee} onChange={(v) => setEditRoleForm((p) => ({ ...p, premium_fee: v }))} />
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-slate-700">Description</span>
                      <textarea
                        value={editRoleForm.description}
                        onChange={(e) => setEditRoleForm((p) => ({ ...p, description: e.target.value }))}
                        rows={2}
                        className="input w-full resize-none text-sm"
                      />
                    </label>
                    <AdminSelect label="Active" value={editRoleForm.is_active ? 'true' : 'false'} onChange={(v) => setEditRoleForm((p) => ({ ...p, is_active: v === 'true' }))}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </AdminSelect>
                    <div className="flex gap-2">
                      <button type="button" onClick={updateRole} disabled={savingEdit} className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 flex-1">
                        {savingEdit ? <><FaSpinner className="animate-spin mr-1" /> Saving</> : <><FaSave className="mr-1" /> Save</>}
                      </button>
                      <button type="button" onClick={() => { setEditingRole(null); setEditRoleForm(EMPTY_ROLE); }} className="btn btn-sm bg-slate-200 text-slate-700 hover:bg-slate-300">
                        <FaTimes />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 truncate">{role.title}</p>
                        <p className="text-[11px] text-slate-500">{role.type} &middot; {role.cycle_title || '—'}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatCurrency(role.application_fee)} / {formatCurrency(role.premium_fee)}
                          {role.is_active !== undefined && (
                            <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${role.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                              {role.is_active ? 'Active' : 'Inactive'}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRole(role);
                          setEditRoleForm({
                            title: role.title || '',
                            type: role.type || 'Administrative',
                            description: role.description || '',
                            application_fee: String(role.application_fee || ''),
                            premium_fee: String(role.premium_fee || ''),
                            cycle_id: role.cycle_id || '',
                            is_active: role.is_active !== undefined ? role.is_active : true,
                          });
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                        title="Edit role"
                      >
                        <FaEdit className="text-xs" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {roles.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No roles created yet</p>}
          </div>
        </div>

        {/* Locations */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-elevated">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <FaMapMarkerAlt />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Location Activation</h3>
          </div>
          <form onSubmit={toggleLocation} className="space-y-3">
            <AdminSelect
              label="State"
              value={locationForm.state_name}
              onChange={(v) => setLocationForm((p) => ({ ...p, state_name: v, lga_name: '' }))}
              required
            >
              <option value="">Select state</option>
              {states.map((state) => (
                <option key={state.name || state.displayName} value={state.displayName || state.name}>
                  {state.displayName || state.name}
                </option>
              ))}
            </AdminSelect>
            <AdminSelect
              label="LGA"
              value={locationForm.lga_name}
              onChange={(v) => setLocationForm((p) => ({ ...p, lga_name: v }))}
              disabled={!locationForm.state_name}
            >
              <option value="">All LGAs in selected state</option>
              {lgas.map((lga) => <option key={lga} value={lga}>{lga}</option>)}
            </AdminSelect>
            <AdminSelect
              label="Status"
              value={locationForm.is_active ? 'true' : 'false'}
              onChange={(v) => setLocationForm((p) => ({ ...p, is_active: v === 'true' }))}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </AdminSelect>
            <button type="submit" disabled={saving} className="btn w-full bg-amber-600 text-white hover:bg-amber-700 shadow-md">
              {saving ? <><FaSpinner className="animate-spin mr-2" /> Saving...</> : 'Save Location'}
            </button>
          </form>
          <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
            {activeLocations.slice(0, 12).map((location) => (
              <div key={location.id} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <FaCheckCircle className="text-[10px] text-emerald-600" />
                {location.state_name} / {location.lga_name === '__ALL__' ? 'All LGAs' : location.lga_name}
              </div>
            ))}
            {activeLocations.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No active locations</p>}
          </div>
        </div>
      </motion.section>

      {/* ─── Applicant List ─────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-elevated"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <FaUsers />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Applicant List</h3>
              {pagination.total > 0 && (
                <span className="badge bg-blue-100 text-blue-700 text-xs">{pagination.total} total</span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Filter by state, LGA, area, role, payment status, or application status. Area supports values like Kutunku, Phase 1, Gwarinpa, or Ikeja.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadBlob('/recruitment/admin/reports/area', 'recruitment-area-report.pdf', filters)} className="btn btn-secondary text-xs px-3 py-2">
              <FaDownload className="mr-1.5" /> PDF Report
            </button>
            <button type="button" onClick={() => downloadBlob('/recruitment/admin/documents/bulk-download', 'recruitment-documents.zip', filters)} className="btn btn-secondary text-xs px-3 py-2">
              <FaDownload className="mr-1.5" /> Documents ZIP
            </button>
            <button type="button" onClick={emailExport} className="btn btn-secondary text-xs px-3 py-2">
              <FaEnvelope className="mr-1.5" /> Send to Email
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <FilterInput name="search" value={filters.search} onChange={handleFilterChange} placeholder="Search name, email, ref" icon={<FaSearch />} />
          <FilterInput name="state" value={filters.state} onChange={handleFilterChange} placeholder="State" />
          <FilterInput name="lga" value={filters.lga} onChange={handleFilterChange} placeholder="LGA" />
          <FilterInput name="area" value={filters.area} onChange={handleFilterChange} placeholder="Area / locality" />
          <select name="role_id" value={filters.role_id} onChange={handleFilterChange} className="input w-full text-sm">
            <option value="">All roles</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.title}</option>)}
          </select>
          <select name="status" value={filters.status} onChange={handleFilterChange} className="input w-full text-sm">
            {statusOptions.map((item) => <option key={item || 'all'} value={item}>{item ? item.replace(/_/g, ' ') : 'All status'}</option>)}
          </select>
          <select name="payment_status" value={filters.payment_status} onChange={handleFilterChange} className="input w-full text-sm">
            {paymentOptions.map((item) => <option key={item || 'all'} value={item}>{item ? item.replace(/_/g, ' ') : 'All payments'}</option>)}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => loadApplicants(1)} className="btn bg-slate-900 text-white hover:bg-slate-800 text-sm">
            <FaSearch className="mr-1.5" /> Apply Filters
          </button>
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="btn btn-secondary text-sm">
            Reset
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => bulkProcess('under_review')} disabled={!selectedIds.length} className="btn border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm disabled:opacity-50">
              <FaSortAmountDown className="mr-1.5" /> Bulk Review ({selectedIds.length})
            </button>
            <button type="button" onClick={() => bulkProcess('shortlisted')} disabled={!selectedIds.length} className="btn border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm disabled:opacity-50">
              <FaCheckCircle className="mr-1.5" /> Bulk Shortlist ({selectedIds.length})
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gradient-to-r from-slate-50 to-white">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === applicants.length && applicants.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(applicants.map((a) => a.id));
                      else setSelectedIds([]);
                    }}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Applicant</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Role</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Location</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Payment</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Status</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Interview</th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applicants.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <FaUsers className="text-2xl opacity-40" />
                      <p className="text-sm font-medium">No applicants match this filter.</p>
                    </div>
                  </td>
                </tr>
              )}

              {applicants.map((applicant, idx) => (
                <motion.tr
                  key={applicant.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-slate-50/50 transition-colors align-top"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(applicant.id)}
                      onChange={(e) => handleSelected(applicant.id, e.target.checked)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{applicant.full_name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{applicant.reference_number}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[180px]">{applicant.email_address}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{applicant.role_title}</p>
                    <p className="text-[11px] text-slate-500">{applicant.application_track} &middot; {formatCurrency(applicant.application_fee)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-800 text-xs">{applicant.state_name}</p>
                    <p className="text-[11px] text-slate-500">{applicant.lga_name}</p>
                    <p className="text-[11px] font-semibold text-slate-600">{applicant.area_locality}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${paymentBadge(applicant.payment_status)}`}>
                      {applicant.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge(applicant.status)}`}>
                      {String(applicant.status || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-600">
                      {applicant.interview_date ? (
                        <>{formatDateTime(applicant.interview_date)}</>
                      ) : (
                        <span className="text-slate-400">Not set</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button type="button" onClick={() => updateApplicant(applicant.id, 'shortlist')} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 transition-colors">
                        Shortlist
                      </button>
                      <button type="button" onClick={() => updateApplicant(applicant.id, 'approve')} className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-blue-700 transition-colors">
                        Approve
                      </button>
                      <button type="button" onClick={() => updateApplicant(applicant.id, 'reject')} className="rounded-lg bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-red-700 transition-colors">
                        Reject
                      </button>
                      <button type="button" onClick={() => setInterviewDate(applicant)} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 transition-colors">
                        Interview
                      </button>
                      <button type="button" onClick={() => downloadBlob(`/recruitment/admin/reports/applicant/${applicant.id}`, `applicant-${applicant.id}.pdf`)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                        PDF
                      </button>
                      <button type="button" onClick={() => downloadBlob(`/recruitment/admin/documents/download/${applicant.id}`, `documents-${applicant.id}.zip`)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                        ZIP
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {applicants.length} of {pagination.total || 0}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => loadApplicants(pagination.page - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="rounded-lg bg-slate-100 px-3 py-1.5">
              Page {pagination.page || 1} / {pagination.totalPages || 1}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadApplicants(pagination.page + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </motion.section>

      <AnimatePresence>
        {triggerModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4"
          >
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Trigger Interview</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Activate interview access for shortlisted candidates. You can scope it by cycle, role, or date.
                  </p>
                </div>
                <button type="button" onClick={() => setTriggerModal(false)} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600">
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <AdminSelect
                  label="Cycle"
                  value={triggerForm.cycle_id}
                  onChange={(value) => setTriggerForm((prev) => ({ ...prev, cycle_id: value }))}
                >
                  <option value="">All active cycles</option>
                  {cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>{cycle.title}</option>
                  ))}
                </AdminSelect>
                <AdminSelect
                  label="Role"
                  value={triggerForm.role_id}
                  onChange={(value) => setTriggerForm((prev) => ({ ...prev, role_id: value }))}
                >
                  <option value="">All roles</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.title}</option>
                  ))}
                </AdminSelect>
                <AdminInput
                  label="Interview Date"
                  type="datetime-local"
                  value={triggerForm.interview_date}
                  onChange={(value) => setTriggerForm((prev) => ({ ...prev, interview_date: value }))}
                />
              </div>

              <button
                type="button"
                onClick={triggerInterview}
                disabled={triggering}
                className="btn btn-primary mt-5 w-full"
              >
                {triggering ? <><FaSpinner className="mr-2 animate-spin" /> Triggering...</> : <><FaPaperPlane className="mr-2" /> Trigger Interview</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function AdminInput({ label, value, onChange, type = 'text', ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="input w-full" {...props} />
    </label>
  );
}

function AdminSelect({ label, value, onChange, children, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input w-full" {...props}>
        {children}
      </select>
    </label>
  );
}

function FilterInput({ icon, ...props }) {
  return (
    <label className="relative block">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
      <input {...props} className={`input w-full ${icon ? 'pl-9' : ''}`} />
    </label>
  );
}
