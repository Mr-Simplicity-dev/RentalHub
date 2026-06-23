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
  FaSave,
  FaSearch,
  FaSortAmountDown,
  FaTimes,
  FaUsers,
  FaVideo,
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import {
  ActionButton,
  EmptyState,
  FilterInput,
  FormInput,
  FormSelect,
  FormTextarea,
  formatCurrency,
  formatDate,
  formatDateTime,
  LoadingState,
  MetricCard,
  SectionCard,
  StatusPill,
} from './RecruitmentAdminUi';

// ─── Shared helpers ─────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// RecruitmentOverviewTab
// ─────────────────────────────────────────────────────────

export function RecruitmentOverviewTab({ analytics, cycles, roles, locations, activeLocations, status, onRefresh }) {
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState('');
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    let active = true;
    const loadChart = async () => {
      setLoadingChart(true);
      setChartError('');
      try {
        const res = await api.get('/recruitment/admin/analytics');
        if (active) {
          setChartData(res.data?.data || null);
        }
      } catch (err) {
        if (active) {
          setChartError(err.response?.data?.message || 'Failed to load analytics');
        }
      } finally {
        if (active) setLoadingChart(false);
      }
    };
    loadChart();
    return () => { active = false; };
  }, []);

  const cycleStats = useMemo(() => {
    if (!analytics?.cycles) return [];
    return Object.entries(analytics.cycles).map(([key, value]) => ({
      label: key.replace(/_/g, ' '),
      value,
    }));
  }, [analytics]);

  const roleDistribution = useMemo(() => {
    if (!analytics?.roles) return [];
    return Object.entries(analytics.roles).map(([key, value]) => ({
      label: key.replace(/_/g, ' '),
      value,
    }));
  }, [analytics]);

  if (loadingChart) {
    return <LoadingState label="Loading analytics charts..." />;
  }

  if (chartError) {
    return (
      <div className="space-y-6">
        <SectionCard
          title="Overview"
          description="High-level recruitment performance and activity metrics."
        >
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <p className="font-bold">Analytics could not load fully.</p>
            <p className="mt-1">{chartError}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Quick metrics ──────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Applicants"
          value={analytics?.total_applicants || 0}
          tone="indigo"
        />
        <MetricCard
          label="Fees Collected"
          value={formatCurrency(analytics?.total_fees_collected || 0)}
          tone="emerald"
        />
        <MetricCard
          label="Interviews Completed"
          value={analytics?.interview?.completed || 0}
          tone="blue"
        />
        <MetricCard
          label="Active Locations"
          value={activeLocations.length}
          subtext={`${locations.length - activeLocations.length} inactive`}
          tone="amber"
        />
      </div>

      {/* ── Cycle analytics ────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Cycle analytics"
          description="Applicants per recruitment cycle."
        >
          {cycleStats.length > 0 ? (
            <div className="space-y-3">
              {cycleStats.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <p className="text-sm font-medium text-slate-700 capitalize">{item.label}</p>
                  <p className="text-lg font-bold text-indigo-700">{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No cycle data"
              description="Applicant distribution across cycles will appear here."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Role distribution"
          description="How applicants are distributed across roles."
        >
          {roleDistribution.length > 0 ? (
            <div className="space-y-3">
              {roleDistribution.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <p className="text-sm font-medium text-slate-700 capitalize">{item.label}</p>
                  <p className="text-lg font-bold text-emerald-700">{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No role data"
              description="Applicant distribution across roles will appear here."
            />
          )}
        </SectionCard>
      </div>

      {/* ── Status breakdown ───────────────────────── */}
      <SectionCard
        title="Application status breakdown"
        description="Current funnel snapshot of every application stage."
      >
        {analytics?.status_counts ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(analytics.status_counts).map(([status, count]) => (
              <div
                key={status}
                className="rounded-xl border border-slate-200 px-4 py-3 text-center"
              >
                <StatusPill value={status} />
                <p className="mt-2 text-2xl font-bold text-slate-900">{count}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No status data"
            description="Application stage breakdown will show here once applicants are processed."
          />
        )}
      </SectionCard>

      {/* ── Payment summary ────────────────────────── */}
      <SectionCard
        title="Payment summary"
        description="Fee collection overview across all cycles."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Total collected</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">
              {formatCurrency(analytics?.total_fees_collected || 0)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Pending</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">
              {formatCurrency(analytics?.pending_fees || 0)}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Failed</p>
            <p className="mt-1 text-2xl font-bold text-rose-900">
              {formatCurrency(analytics?.failed_fees || 0)}
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Refunded</p>
            <p className="mt-1 text-2xl font-bold text-blue-900">
              {formatCurrency(analytics?.refunded_fees || 0)}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ── Recent cycles list ─────────────────────── */}
      <SectionCard
        title="Recent cycles"
        description="Latest recruitment cycles and their active status."
      >
        {cycles.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {cycles.slice(0, 8).map((cycle) => (
              <div key={cycle.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{cycle.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(cycle.open_date)} — {formatDate(cycle.extension_date || cycle.close_date)}
                  </p>
                </div>
                <StatusPill value={cycle.is_active ? 'active' : 'inactive'} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No cycles yet"
            description="Create a recruitment cycle in the Cycles tab to get started."
          />
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// RecruitmentCyclesTab
// ─────────────────────────────────────────────────────────

const EMPTY_CYCLE = { title: '', open_date: '', close_date: '', extension_date: '' };

export function RecruitmentCyclesTab({ cycles, onRefresh }) {
  const [form, setForm] = useState(EMPTY_CYCLE);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_CYCLE);
  const [savingEdit, setSavingEdit] = useState(false);

  const createCycle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/recruitment/admin/cycles', form);
      toast.success('Recruitment cycle created');
      setForm(EMPTY_CYCLE);
      await onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create cycle');
    } finally {
      setSaving(false);
    }
  };

  const updateCycle = async () => {
    setSavingEdit(true);
    try {
      await api.put(`/recruitment/admin/cycles/${editing.id}`, editForm);
      toast.success('Cycle updated');
      setEditing(null);
      setEditForm(EMPTY_CYCLE);
      await onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update cycle');
    } finally {
      setSavingEdit(false);
    }
  };

  const beginEdit = (cycle) => {
    setEditing(cycle);
    setEditForm({
      title: cycle.title || '',
      open_date: cycle.open_date ? cycle.open_date.substring(0, 10) : '',
      close_date: cycle.close_date ? cycle.close_date.substring(0, 10) : '',
      extension_date: cycle.extension_date ? cycle.extension_date.substring(0, 10) : '',
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm(EMPTY_CYCLE);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr,1.15fr]">
      <SectionCard
        title="Create cycle"
        description="Define a new recruitment period with open and close dates."
        className="h-fit"
      >
        <form onSubmit={createCycle} className="space-y-4">
          <FormInput
            label="Cycle Title"
            value={form.title}
            onChange={(v) => setForm((p) => ({ ...p, title: v }))}
            required
            placeholder="e.g. 2025 Q3 Intake"
          />
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="Open Date"
              type="date"
              value={form.open_date}
              onChange={(v) => setForm((p) => ({ ...p, open_date: v }))}
              required
            />
            <FormInput
              label="Close Date"
              type="date"
              value={form.close_date}
              onChange={(v) => setForm((p) => ({ ...p, close_date: v }))}
              required
            />
          </div>
          <FormInput
            label="Extension Date (optional)"
            type="date"
            value={form.extension_date}
            onChange={(v) => setForm((p) => ({ ...p, extension_date: v }))}
          />
          <ActionButton
            type="submit"
            disabled={saving}
            loading={saving}
            icon={FaPlus}
            variant="primary"
            className="w-full"
          >
            Create Cycle
          </ActionButton>
        </form>
      </SectionCard>

      <SectionCard
        title="Existing cycles"
        description="All recruitment cycles. Click the edit icon to modify dates or title."
      >
        {cycles.length > 0 ? (
          <div className="space-y-3">
            {cycles.map((cycle) => (
              <div key={cycle.id}>
                {editing?.id === cycle.id ? (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
                    <FormInput
                      label="Title"
                      value={editForm.title}
                      onChange={(v) => setEditForm((p) => ({ ...p, title: v }))}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput
                        label="Open Date"
                        type="date"
                        value={editForm.open_date}
                        onChange={(v) => setEditForm((p) => ({ ...p, open_date: v }))}
                      />
                      <FormInput
                        label="Close Date"
                        type="date"
                        value={editForm.close_date}
                        onChange={(v) => setEditForm((p) => ({ ...p, close_date: v }))}
                      />
                    </div>
                    <FormInput
                      label="Extension Date"
                      type="date"
                      value={editForm.extension_date}
                      onChange={(v) => setEditForm((p) => ({ ...p, extension_date: v }))}
                    />
                    <div className="flex gap-2">
                      <ActionButton
                        onClick={updateCycle}
                        disabled={savingEdit}
                        loading={savingEdit}
                        icon={FaSave}
                        variant="primary"
                        className="flex-1"
                      >
                        Save
                      </ActionButton>
                      <ActionButton
                        onClick={cancelEdit}
                        icon={FaTimes}
                        variant="secondary"
                      >
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{cycle.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(cycle.open_date)} — {formatDate(cycle.extension_date || cycle.close_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusPill value={cycle.is_active ? 'active' : 'inactive'} />
                        <button
                          type="button"
                          onClick={() => beginEdit(cycle)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
                          title="Edit cycle"
                        >
                          <FaSave className="text-xs" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No cycles defined"
            description="Create your first recruitment cycle using the form on the left."
          />
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// RecruitmentRolesTab
// ─────────────────────────────────────────────────────────

const EMPTY_ROLE = {
  title: '',
  type: 'Administrative',
  description: '',
  application_fee: '5000',
  premium_fee: '8000',
  cycle_id: '',
};

export function RecruitmentRolesTab({ roles, cycles, onRefresh }) {
  const [form, setForm] = useState(EMPTY_ROLE);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_ROLE);
  const [savingEdit, setSavingEdit] = useState(false);

  const createRole = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/recruitment/admin/roles', form);
      toast.success('Recruitment role created');
      setForm(EMPTY_ROLE);
      await onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async () => {
    setSavingEdit(true);
    try {
      await api.put(`/recruitment/admin/roles/${editing.id}`, editForm);
      toast.success('Role updated');
      setEditing(null);
      setEditForm(EMPTY_ROLE);
      await onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update role');
    } finally {
      setSavingEdit(false);
    }
  };

  const beginEdit = (role) => {
    setEditing(role);
    setEditForm({
      title: role.title || '',
      type: role.type || 'Administrative',
      description: role.description || '',
      application_fee: String(role.application_fee || ''),
      premium_fee: String(role.premium_fee || ''),
      cycle_id: role.cycle_id || '',
      is_active: role.is_active !== undefined ? role.is_active : true,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm(EMPTY_ROLE);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr,1.15fr]">
      <SectionCard
        title="Create role"
        description="Add a position with fee structure for a recruitment cycle."
        className="h-fit"
      >
        <form onSubmit={createRole} className="space-y-4">
          <FormSelect
            label="Cycle"
            value={form.cycle_id}
            onChange={(v) => setForm((p) => ({ ...p, cycle_id: v }))}
            required
          >
            <option value="">Select cycle</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.title}</option>
            ))}
          </FormSelect>
          <FormInput
            label="Position Title"
            value={form.title}
            onChange={(v) => setForm((p) => ({ ...p, title: v }))}
            required
            placeholder="e.g. Administrative Officer"
          />
          <FormSelect
            label="Type"
            value={form.type}
            onChange={(v) => setForm((p) => ({ ...p, type: v }))}
          >
            <option value="Administrative">Administrative</option>
            <option value="Technical">Technical</option>
          </FormSelect>
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="Standard Fee (₦)"
              type="number"
              value={form.application_fee}
              onChange={(v) => setForm((p) => ({ ...p, application_fee: v }))}
            />
            <FormInput
              label="Premium Fee (₦)"
              type="number"
              value={form.premium_fee}
              onChange={(v) => setForm((p) => ({ ...p, premium_fee: v }))}
            />
          </div>
          <FormTextarea
            label="Description"
            value={form.description}
            onChange={(v) => setForm((p) => ({ ...p, description: v }))}
            rows={2}
          />
          <ActionButton
            type="submit"
            disabled={saving}
            loading={saving}
            icon={FaPlus}
            variant="success"
            className="w-full"
          >
            Create Role
          </ActionButton>
        </form>
      </SectionCard>

      <SectionCard
        title="Existing roles"
        description="All roles with their fees, cycle association, and active status."
      >
        {roles.length > 0 ? (
          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role.id}>
                {editing?.id === role.id ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                    <FormSelect
                      label="Cycle"
                      value={editForm.cycle_id}
                      onChange={(v) => setEditForm((p) => ({ ...p, cycle_id: v }))}
                    >
                      <option value="">Select cycle</option>
                      {cycles.map((cycle) => (
                        <option key={cycle.id} value={cycle.id}>{cycle.title}</option>
                      ))}
                    </FormSelect>
                    <FormInput
                      label="Title"
                      value={editForm.title}
                      onChange={(v) => setEditForm((p) => ({ ...p, title: v }))}
                    />
                    <FormSelect
                      label="Type"
                      value={editForm.type}
                      onChange={(v) => setEditForm((p) => ({ ...p, type: v }))}
                    >
                      <option value="Administrative">Administrative</option>
                      <option value="Technical">Technical</option>
                    </FormSelect>
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput
                        label="Standard Fee (₦)"
                        type="number"
                        value={editForm.application_fee}
                        onChange={(v) => setEditForm((p) => ({ ...p, application_fee: v }))}
                      />
                      <FormInput
                        label="Premium Fee (₦)"
                        type="number"
                        value={editForm.premium_fee}
                        onChange={(v) => setEditForm((p) => ({ ...p, premium_fee: v }))}
                      />
                    </div>
                    <FormTextarea
                      label="Description"
                      value={editForm.description}
                      onChange={(v) => setEditForm((p) => ({ ...p, description: v }))}
                      rows={2}
                    />
                    <FormSelect
                      label="Active"
                      value={editForm.is_active ? 'true' : 'false'}
                      onChange={(v) => setEditForm((p) => ({ ...p, is_active: v === 'true' }))}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </FormSelect>
                    <div className="flex gap-2">
                      <ActionButton
                        onClick={updateRole}
                        disabled={savingEdit}
                        loading={savingEdit}
                        icon={FaSave}
                        variant="success"
                        className="flex-1"
                      >
                        Save
                      </ActionButton>
                      <ActionButton
                        onClick={cancelEdit}
                        icon={FaTimes}
                        variant="secondary"
                      >
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{role.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {role.type} &middot; {role.cycle_title || '—'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatCurrency(role.application_fee)} / {formatCurrency(role.premium_fee)}
                          {role.is_active !== undefined && (
                            <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              role.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                            }`}>
                              {role.is_active ? 'Active' : 'Inactive'}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => beginEdit(role)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                        title="Edit role"
                      >
                        <FaSave className="text-xs" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No roles created"
            description="Add a role using the form on the left."
          />
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// RecruitmentLocationsTab
// ─────────────────────────────────────────────────────────

const EMPTY_LOCATION = { state_name: '', lga_name: '', is_active: true };

export function RecruitmentLocationsTab({ locations, states, onRefresh }) {
  const [form, setForm] = useState(EMPTY_LOCATION);
  const [saving, setSaving] = useState(false);
  const [lgas, setLgas] = useState([]);

  const activeLocations = useMemo(
    () => locations.filter((loc) => loc.is_active),
    [locations]
  );

  useEffect(() => {
    if (!form.state_name) {
      setLgas([]);
      return;
    }
    let active = true;
    api
      .get(`/recruitment/locations/lgas/${encodeURIComponent(form.state_name)}`)
      .then((res) => {
        if (active) setLgas(res.data?.data || []);
      })
      .catch(() => {
        if (active) setLgas([]);
      });
    return () => { active = false; };
  }, [form.state_name]);

  const toggleLocation = async (e) => {
    e.preventDefault();
    if (!form.state_name) {
      toast.error('Select a state first');
      return;
    }
    setSaving(true);
    try {
      await api.put('/recruitment/admin/locations/toggle', {
        ...form,
        lga_name: form.lga_name || '__ALL__',
      });
      toast.success('Recruitment location updated');
      setForm(EMPTY_LOCATION);
      await onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update location');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr,1.15fr]">
      <SectionCard
        title="Toggle location"
        description="Activate or deactivate a state or LGA for recruitment."
        className="h-fit"
      >
        <form onSubmit={toggleLocation} className="space-y-4">
          <FormSelect
            label="State"
            value={form.state_name}
            onChange={(v) => setForm((p) => ({ ...p, state_name: v, lga_name: '' }))}
            required
          >
            <option value="">Select state</option>
            {states.map((state) => (
              <option key={state.name || state.displayName} value={state.displayName || state.name}>
                {state.displayName || state.name}
              </option>
            ))}
          </FormSelect>
          <FormSelect
            label="LGA"
            value={form.lga_name}
            onChange={(v) => setForm((p) => ({ ...p, lga_name: v }))}
            disabled={!form.state_name}
          >
            <option value="">All LGAs in selected state</option>
            {lgas.map((lga) => (
              <option key={lga} value={lga}>{lga}</option>
            ))}
          </FormSelect>
          <FormSelect
            label="Status"
            value={form.is_active ? 'true' : 'false'}
            onChange={(v) => setForm((p) => ({ ...p, is_active: v === 'true' }))}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </FormSelect>
          <ActionButton
            type="submit"
            disabled={saving}
            loading={saving}
            variant="amber"
            className="w-full"
          >
            Save Location
          </ActionButton>
        </form>
      </SectionCard>

      <SectionCard
        title="Active locations"
        description="States and LGAs where recruitment is currently accepting applications."
      >
        {activeLocations.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {activeLocations.map((location) => (
              <div
                key={location.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <FaCheckCircle className="shrink-0 text-[10px] text-emerald-600" />
                <span className="font-medium text-emerald-800">
                  {location.state_name} / {location.lga_name === '__ALL__' ? 'All LGAs' : location.lga_name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No active locations"
            description="Activate a state or LGA using the form on the left."
          />
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// RecruitmentApplicantsTab
// ─────────────────────────────────────────────────────────

export function RecruitmentApplicantsTab({ roles, onRefreshCore }) {
  const [applicants, setApplicants] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionKey, setActionKey] = useState('');

  const loadApplicants = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/recruitment/admin/applicants', {
        params: { ...filters, page, limit: 20 },
      });
      setApplicants(res.data?.data || []);
      setPagination(res.data?.pagination || { page, totalPages: 1, total: 0 });
      setSelectedIds([]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load applicants');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadApplicants(1);
  }, [loadApplicants]);

  const updateApplicant = async (id, action, body = {}) => {
    const key = `${id}-${action}`;
    setActionKey(key);
    try {
      await api.post(`/recruitment/admin/applicants/${id}/${action}`, body);
      toast.success(`Applicant ${action}ed`);
      await loadApplicants(pagination.page);
      if (onRefreshCore) await onRefreshCore();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to ${action} applicant`);
    } finally {
      setActionKey('');
    }
  };

  const bulkProcess = async (statusValue) => {
    if (!selectedIds.length) {
      toast.error('Select at least one applicant');
      return;
    }
    const key = `bulk-${statusValue}`;
    setActionKey(key);
    try {
      await api.post('/recruitment/admin/applicants/bulk-process', {
        application_ids: selectedIds,
        status: statusValue,
      });
      toast.success('Applicants updated');
      await loadApplicants(pagination.page);
      if (onRefreshCore) await onRefreshCore();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Bulk update failed');
    } finally {
      setActionKey('');
    }
  };

  const setInterviewDate = async (applicant) => {
    const value = window.prompt('Interview date and time (YYYY-MM-DD HH:mm)', '');
    if (!value) return;
    await updateApplicant(applicant.id, 'set-interview', {
      interview_date: value.replace(' ', 'T'),
    });
  };

  const handleSelected = (id, checked) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)
    );
  };

  const handleFilterChange = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectAll = (checked) => {
    if (checked) setSelectedIds(applicants.map((a) => a.id));
    else setSelectedIds([]);
  };

  const emailExport = async () => {
    try {
      await api.post('/recruitment/admin/email-documents', filters);
      toast.success('Recruitment export sent to email');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Email export failed');
    }
  };

  return (
    <SectionCard
      title="Applicant list"
      description="Search, filter, shortlist, approve, or reject applicants. Use bulk actions to process multiple applicants at once."
      action={
        <div className="flex flex-wrap gap-2">
          <ActionButton
            onClick={() => downloadBlob('/recruitment/admin/reports/area', 'recruitment-area-report.pdf', filters)}
            variant="secondary"
            size="sm"
            icon={FaDownload}
          >
            PDF Report
          </ActionButton>
          <ActionButton
            onClick={() => downloadBlob('/recruitment/admin/documents/bulk-download', 'recruitment-documents.zip', filters)}
            variant="secondary"
            size="sm"
              icon={FaDownload}
          >
            Documents ZIP
          </ActionButton>
          <ActionButton
            onClick={emailExport}
            variant="secondary"
            size="sm"
            icon={FaEnvelope}
          >
            Send to Email
          </ActionButton>
        </div>
      }
    >
      {/* ── Filters ──────────────────────────────── */}
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <FilterInput
          name="search"
          value={filters.search}
          onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
          placeholder="Search name, email, ref"
          icon={<FaSearch />}
        />
        <FilterInput
          name="state"
          value={filters.state}
          onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
          placeholder="State"
        />
        <FilterInput
          name="lga"
          value={filters.lga}
          onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
          placeholder="LGA"
        />
        <FilterInput
          name="area"
          value={filters.area}
          onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
          placeholder="Area / locality"
        />
        <select
          name="role_id"
          value={filters.role_id}
          onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
          className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>{role.title}</option>
          ))}
        </select>
        <select
          name="status"
          value={filters.status}
          onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
          className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        >
          {statusOptions.map((item) => (
            <option key={item || "all"} value={item}>
              {item ? item.replace(/_/g, " ") : "All status"}
            </option>
          ))}
        </select>
        <select
          name="payment_status"
          value={filters.payment_status}
          onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
          className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        >
          {paymentOptions.map((item) => (
            <option key={item || "all"} value={item}>
              {item ? item.replace(/_/g, " ") : "All payments"}
            </option>
          ))}
        </select>
      </div>

      {/* ── Filter actions ───────────────────────── */}
      <div className="mb-5 flex flex-wrap gap-2">
        <ActionButton
          onClick={() => loadApplicants(1)}
          variant="dark"
          size="sm"
          icon={FaSearch}
        >
          Apply Filters
        </ActionButton>
        <ActionButton
          onClick={() => setFilters(EMPTY_FILTERS)}
          variant="secondary"
          size="sm"
        >
          Reset
        </ActionButton>
        <div className="ml-auto flex flex-wrap gap-2">
          <ActionButton
            onClick={() => bulkProcess("under_review")}
            disabled={!selectedIds.length}
            variant="secondary"
            size="sm"
            icon={FaSortAmountDown}
          >
            Bulk Review ({selectedIds.length})
          </ActionButton>
          <ActionButton
            onClick={() => bulkProcess("shortlisted")}
            disabled={!selectedIds.length}
            variant="success"
            size="sm"
            icon={FaCheckCircle}
          >
            Bulk Shortlist ({selectedIds.length})
          </ActionButton>
        </div>
      </div>

      {/* ── Table ────────────────────────────────── */}
      {loading ? (
        <LoadingState label="Loading applicants..." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gradient-to-r from-slate-50 to-white">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === applicants.length && applicants.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Applicant
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Role
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Location
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Payment
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Interview
                  </th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applicants.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-4 py-16 text-center">
                      <EmptyState
                        title="No applicants match this filter"
                        description="Try adjusting your search or filter criteria."
                      />
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
                      <p className="text-[11px] text-slate-500">
                        {applicant.application_track} &middot; {formatCurrency(applicant.application_fee)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800 text-xs">{applicant.state_name}</p>
                      <p className="text-[11px] text-slate-500">{applicant.lga_name}</p>
                      <p className="text-[11px] font-semibold text-slate-600">{applicant.area_locality}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill value={applicant.payment_status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill value={applicant.status} />
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
                        <ActionButton
                          onClick={() => updateApplicant(applicant.id, "shortlist")}
                          disabled={actionKey.startsWith(applicant.id)}
                          loading={actionKey === `${applicant.id}-shortlist`}
                          variant="success"
                          size="sm"
                        >
                          Shortlist
                        </ActionButton>
                        <ActionButton
                          onClick={() => updateApplicant(applicant.id, "approve")}
                          disabled={actionKey.startsWith(applicant.id)}
                          loading={actionKey === `${applicant.id}-approve`}
                          variant="primary"
                          size="sm"
                        >
                          Approve
                        </ActionButton>
                        <ActionButton
                          onClick={() => updateApplicant(applicant.id, "reject")}
                          disabled={actionKey.startsWith(applicant.id)}
                          loading={actionKey === `${applicant.id}-reject`}
                          variant="danger"
                          size="sm"
                        >
                          Reject
                        </ActionButton>
                        <ActionButton
                          onClick={() => setInterviewDate(applicant)}
                          disabled={actionKey.startsWith(applicant.id)}
                          variant="amber"
                          size="sm"
                        >
                          Interview
                        </ActionButton>
                        <ActionButton
                          onClick={() =>
                            downloadBlob(
                              `/recruitment/admin/reports/applicant/${applicant.id}`,
                              `applicant-${applicant.id}.pdf`
                            )
                          }
                          variant="secondary"
                          size="sm"
                        >
                          PDF
                        </ActionButton>
                        <ActionButton
                          onClick={() =>
                            downloadBlob(
                              `/recruitment/admin/documents/download/${applicant.id}`,
                              `documents-${applicant.id}.zip`
                            )
                          }
                          variant="secondary"
                          size="sm"
                        >
                          ZIP
                        </ActionButton>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ────────────────────────── */}
          <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {applicants.length} of {pagination.total || 0}
            </span>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                onClick={() => loadApplicants(pagination.page - 1)}
                disabled={pagination.page <= 1}
                variant="secondary"
                size="sm"
              >
                Previous
              </ActionButton>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium">
                Page {pagination.page || 1} / {pagination.totalPages || 1}
              </span>
              <ActionButton
                onClick={() => loadApplicants(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                variant="secondary"
                size="sm"
              >
                Next
              </ActionButton>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────
// RecruitmentInterviewTab
// ─────────────────────────────────────────────────────────

export function RecruitmentInterviewTab({ cycles, roles, onRefreshCore }) {
  const [applicants, setApplicants] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, status: "shortlisted" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerModal, setTriggerModal] = useState(false);
  const [triggerForm, setTriggerForm] = useState({ cycle_id: "", role_id: "", interview_date: "" });
  const [actionKey, setActionKey] = useState("");

  const loadApplicants = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get("/recruitment/admin/applicants", {
        params: { ...filters, page, limit: 20 },
      });
      setApplicants(res.data?.data || []);
      setPagination(res.data?.pagination || { page, totalPages: 1, total: 0 });
      setSelectedIds([]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load applicants");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadApplicants(1);
  }, [loadApplicants]);

  const triggerInterview = async () => {
    setTriggering(true);
    try {
      const body = {};
      if (triggerForm.interview_date) body.interview_date = triggerForm.interview_date;
      if (triggerForm.cycle_id) body.cycle_id = triggerForm.cycle_id;
      if (triggerForm.role_id) body.role_id = triggerForm.role_id;

      const res = await api.post("/recruitment/admin/interviews/trigger", body);
      toast.success(res.data?.message || "Interviews triggered successfully");
      setTriggerModal(false);
      setTriggerForm({ cycle_id: "", role_id: "", interview_date: "" });
      await loadApplicants(pagination.page);
      if (onRefreshCore) await onRefreshCore();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to trigger interviews");
    } finally {
      setTriggering(false);
    }
  };

  const updateApplicant = async (id, action, body = {}) => {
    const key = `${id}-${action}`;
    setActionKey(key);
    try {
      await api.post(`/recruitment/admin/applicants/${id}/${action}`, body);
      toast.success(`Applicant ${action}ed`);
      await loadApplicants(pagination.page);
      if (onRefreshCore) await onRefreshCore();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to ${action} applicant`);
    } finally {
      setActionKey("");
    }
  };

  const setInterviewDate = async (applicant) => {
    const value = window.prompt("Interview date and time (YYYY-MM-DD HH:mm)", "");
    if (!value) return;
    await updateApplicant(applicant.id, "set-interview", {
      interview_date: value.replace(" ", "T"),
    });
  };

  const handleFilterChange = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6">
      {/* ── Trigger Interview Panel ──────────────── */}
      <SectionCard
        title="Trigger Interviews"
        description="Activate interview access for shortlisted candidates. Scope by cycle, role, or date."
        action={
          <ActionButton
            onClick={() => setTriggerModal(true)}
            variant="primary"
            icon={FaVideo}
          >
            Open Trigger Panel
          </ActionButton>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Shortlisted</p>
            <p className="mt-1 text-2xl font-bold text-indigo-900">{pagination.total || 0}</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">With Interview Date</p>
            <p className="mt-1 text-2xl font-bold text-blue-900">
              {applicants.filter((a) => a.interview_date).length}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Cycles Active</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">
              {cycles.filter((c) => c.is_active).length}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ── Interview Modal ──────────────────────── */}
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
                <button
                  type="button"
                  onClick={() => setTriggerModal(false)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <FormSelect
                  label="Cycle"
                  value={triggerForm.cycle_id}
                  onChange={(v) => setTriggerForm((prev) => ({ ...prev, cycle_id: v }))}
                >
                  <option value="">All active cycles</option>
                  {cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.title}
                    </option>
                  ))}
                </FormSelect>
                <FormSelect
                  label="Role"
                  value={triggerForm.role_id}
                  onChange={(v) => setTriggerForm((prev) => ({ ...prev, role_id: v }))}
                >
                  <option value="">All roles</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title}
                    </option>
                  ))}
                </FormSelect>
                <FormInput
                  label="Interview Date"
                  type="datetime-local"
                  value={triggerForm.interview_date}
                  onChange={(v) => setTriggerForm((prev) => ({ ...prev, interview_date: v }))}
                />
              </div>

              <ActionButton
                onClick={triggerInterview}
                disabled={triggering}
                loading={triggering}
                icon={FaPaperPlane}
                variant="primary"
                className="mt-5 w-full"
              >
                Trigger Interview
              </ActionButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Shortlisted Applicants Table ─────────── */}
      <SectionCard
        title="Shortlisted applicants"
        description="Manage interview scheduling for shortlisted candidates."
      >
        {/* Interview filters */}
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FilterInput
            name="search"
            value={filters.search}
            onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
            placeholder="Search name, email, ref"
            icon={<FaSearch />}
          />
          <select
            name="role_id"
            value={filters.role_id}
            onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
            className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All roles</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.title}</option>
            ))}
          </select>
          <select
            name="status"
            value={filters.status}
            onChange={(e) => handleFilterChange(e.target.name, e.target.value)}
            className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            {statusOptions.map((item) => (
              <option key={item || "all"} value={item}>
                {item ? item.replace(/_/g, " ") : "All status"}
              </option>
            ))}
          </select>
          <ActionButton
            onClick={() => loadApplicants(1)}
            variant="dark"
            size="sm"
            icon={FaSearch}
          >
            Filter
          </ActionButton>
          <ActionButton
            onClick={() => setFilters({ ...EMPTY_FILTERS, status: "shortlisted" })}
            variant="secondary"
            size="sm"
          >
            Reset
          </ActionButton>
        </div>

        {loading ? (
          <LoadingState label="Loading applicants..." />
        ) : applicants.length > 0 ? (
          <div className="space-y-3">
            {applicants.map((applicant, idx) => (
              <motion.div
                key={applicant.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{applicant.full_name}</p>
                      <StatusPill value={applicant.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {applicant.role_title} &middot; {applicant.state_name} / {applicant.lga_name}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 font-mono">{applicant.reference_number}</p>
                    {applicant.interview_date && (
                      <p className="mt-1 text-xs font-semibold text-indigo-700">
                        Interview: {formatDateTime(applicant.interview_date)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <ActionButton
                      onClick={() => setInterviewDate(applicant)}
                      disabled={actionKey.startsWith(applicant.id)}
                      variant="amber"
                      size="sm"
                    >
                      Set Date
                    </ActionButton>
                    <ActionButton
                      onClick={() => downloadBlob(
                        `/recruitment/admin/reports/applicant/${applicant.id}`,
                        `applicant-${applicant.id}.pdf`
                      )}
                      variant="secondary"
                      size="sm"
                    >
                      PDF
                    </ActionButton>
                    <ActionButton
                      onClick={() => downloadBlob(
                        `/recruitment/admin/documents/download/${applicant.id}`,
                        `documents-${applicant.id}.zip`
                      )}
                      variant="secondary"
                      size="sm"
                    >
                      ZIP
                    </ActionButton>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No shortlisted applicants"
            description="Shortlist applicants from the Applicants tab to schedule interviews."
          />
        )}

        {/* ── Pagination ──────────────────────────── */}
        {applicants.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {applicants.length} of {pagination.total || 0}
            </span>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                onClick={() => loadApplicants(pagination.page - 1)}
                disabled={pagination.page <= 1}
                variant="secondary"
                size="sm"
              >
                Previous
              </ActionButton>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium">
                Page {pagination.page || 1} / {pagination.totalPages || 1}
              </span>
              <ActionButton
                onClick={() => loadApplicants(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                variant="secondary"
                size="sm"
              >
                Next
              </ActionButton>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
