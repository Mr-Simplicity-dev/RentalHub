import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  FaBriefcase,
  FaCalendarAlt,
  FaDownload,
  FaEnvelope,
  FaMapMarkerAlt,
  FaPlus,
  FaSearch,
  FaToggleOff,
  FaToggleOn,
  FaUsers,
} from 'react-icons/fa';
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

export default function RecruitmentAdminTab() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
      <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">
              Recruitment Control
            </p>
            <h2 className="mt-1 text-2xl font-black">Career Module</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
              Manage recruitment cycles, role fees, location activation, applicants, document exports, and interview activation.
            </p>
          </div>

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
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<FaUsers />} label="Total Applicants" value={analytics?.total_applicants || 0} />
        <MetricCard icon={<FaBriefcase />} label="Fees Collected" value={formatCurrency(analytics?.total_fees_collected || 0)} />
        <MetricCard icon={<FaCalendarAlt />} label="Interview Completed" value={analytics?.interview?.completed || 0} />
        <MetricCard icon={<FaMapMarkerAlt />} label="Active Locations" value={activeLocations.length} />
      </section>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          Loading recruitment dashboard...
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-3">
        <form onSubmit={createCycle} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <FaCalendarAlt className="text-blue-600" /> Manage Cycles
          </h3>
          <div className="mt-4 space-y-3">
            <AdminInput label="Cycle Title" value={cycleForm.title} onChange={(value) => setCycleForm((prev) => ({ ...prev, title: value }))} required />
            <AdminInput label="Open Date" type="date" value={cycleForm.open_date} onChange={(value) => setCycleForm((prev) => ({ ...prev, open_date: value }))} required />
            <AdminInput label="Close Date" type="date" value={cycleForm.close_date} onChange={(value) => setCycleForm((prev) => ({ ...prev, close_date: value }))} required />
            <AdminInput label="Extension Date" type="date" value={cycleForm.extension_date} onChange={(value) => setCycleForm((prev) => ({ ...prev, extension_date: value }))} />
            <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <FaPlus /> Create Cycle
            </button>
          </div>
          <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
            {cycles.map((cycle) => (
              <div key={cycle.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-900">{cycle.title}</p>
                <p className="text-xs text-slate-500">{formatDate(cycle.open_date)} - {formatDate(cycle.extension_date || cycle.close_date)}</p>
              </div>
            ))}
          </div>
        </form>

        <form onSubmit={createRole} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <FaBriefcase className="text-emerald-600" /> Manage Roles
          </h3>
          <div className="mt-4 space-y-3">
            <AdminSelect label="Cycle" value={roleForm.cycle_id} onChange={(value) => setRoleForm((prev) => ({ ...prev, cycle_id: value }))} required>
              <option value="">Select cycle</option>
              {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.title}</option>)}
            </AdminSelect>
            <AdminInput label="Position Title" value={roleForm.title} onChange={(value) => setRoleForm((prev) => ({ ...prev, title: value }))} required />
            <AdminSelect label="Type" value={roleForm.type} onChange={(value) => setRoleForm((prev) => ({ ...prev, type: value }))}>
              <option value="Administrative">Administrative</option>
              <option value="Technical">Technical</option>
            </AdminSelect>
            <div className="grid grid-cols-2 gap-3">
              <AdminInput label="Standard Fee" type="number" value={roleForm.application_fee} onChange={(value) => setRoleForm((prev) => ({ ...prev, application_fee: value }))} />
              <AdminInput label="Premium Fee" type="number" value={roleForm.premium_fee} onChange={(value) => setRoleForm((prev) => ({ ...prev, premium_fee: value }))} />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Description</span>
              <textarea
                value={roleForm.description}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="input w-full"
              />
            </label>
            <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <FaPlus /> Create Role
            </button>
          </div>
        </form>

        <form onSubmit={toggleLocation} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <FaMapMarkerAlt className="text-amber-600" /> Location Activation
          </h3>
          <div className="mt-4 space-y-3">
            <AdminSelect
              label="State"
              value={locationForm.state_name}
              onChange={(value) => setLocationForm((prev) => ({ ...prev, state_name: value, lga_name: '' }))}
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
              onChange={(value) => setLocationForm((prev) => ({ ...prev, lga_name: value }))}
              disabled={!locationForm.state_name}
            >
              <option value="">All LGAs in selected state</option>
              {lgas.map((lga) => <option key={lga} value={lga}>{lga}</option>)}
            </AdminSelect>
            <AdminSelect
              label="Status"
              value={locationForm.is_active ? 'true' : 'false'}
              onChange={(value) => setLocationForm((prev) => ({ ...prev, is_active: value === 'true' }))}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </AdminSelect>
            <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              Save Location
            </button>
          </div>
          <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
            {activeLocations.slice(0, 12).map((location) => (
              <div key={location.id} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                {location.state_name} / {location.lga_name === '__ALL__' ? 'All LGAs' : location.lga_name}
              </div>
            ))}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <FaUsers className="text-blue-600" /> Applicant List
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Filter by state, LGA, area, role, payment status, or application status. Area supports values like Kutunku, Phase 1, Gwarinpa, or Ikeja.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadBlob('/recruitment/admin/reports/area', 'recruitment-area-report.pdf', filters)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <FaDownload /> PDF Report
            </button>
            <button type="button" onClick={() => downloadBlob('/recruitment/admin/documents/bulk-download', 'recruitment-documents.zip', filters)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <FaDownload /> Documents ZIP
            </button>
            <button type="button" onClick={emailExport} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <FaEnvelope /> Send to Email
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <FilterInput name="search" value={filters.search} onChange={handleFilterChange} placeholder="Search name, email, ref" icon={<FaSearch />} />
          <FilterInput name="state" value={filters.state} onChange={handleFilterChange} placeholder="State" />
          <FilterInput name="lga" value={filters.lga} onChange={handleFilterChange} placeholder="LGA" />
          <FilterInput name="area" value={filters.area} onChange={handleFilterChange} placeholder="Area / locality" />
          <select name="role_id" value={filters.role_id} onChange={handleFilterChange} className="input w-full">
            <option value="">All roles</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.title}</option>)}
          </select>
          <select name="status" value={filters.status} onChange={handleFilterChange} className="input w-full">
            {statusOptions.map((item) => <option key={item || 'all'} value={item}>{item ? item.replace(/_/g, ' ') : 'All status'}</option>)}
          </select>
          <select name="payment_status" value={filters.payment_status} onChange={handleFilterChange} className="input w-full">
            {paymentOptions.map((item) => <option key={item || 'all'} value={item}>{item ? item.replace(/_/g, ' ') : 'All payments'}</option>)}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => loadApplicants(1)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Apply Filters
          </button>
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Reset
          </button>
          <button type="button" onClick={() => bulkProcess('under_review')} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
            Bulk Review
          </button>
          <button type="button" onClick={() => bulkProcess('shortlisted')} className="rounded-lg border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
            Bulk Shortlist
          </button>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Select</th>
                <th className="px-3 py-3">Applicant</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Interview</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applicants.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-3 py-10 text-center text-slate-500">
                    No applicants match this filter.
                  </td>
                </tr>
              )}

              {applicants.map((applicant) => (
                <tr key={applicant.id} className="align-top">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(applicant.id)}
                      onChange={(event) => handleSelected(applicant.id, event.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-900">{applicant.full_name}</p>
                    <p className="text-xs text-slate-500">{applicant.reference_number}</p>
                    <p className="text-xs text-slate-500">{applicant.email_address}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-800">{applicant.role_title}</p>
                    <p className="text-xs text-slate-500">{applicant.application_track} - {formatCurrency(applicant.application_fee)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-slate-800">{applicant.state_name}</p>
                    <p className="text-xs text-slate-500">{applicant.lga_name}</p>
                    <p className="text-xs font-semibold text-slate-700">{applicant.area_locality}</p>
                  </td>
                  <td className="px-3 py-3 capitalize">{applicant.payment_status}</td>
                  <td className="px-3 py-3 capitalize">{String(applicant.status || '').replace(/_/g, ' ')}</td>
                  <td className="px-3 py-3 text-xs">{formatDateTime(applicant.interview_date)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => updateApplicant(applicant.id, 'shortlist')} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                        Shortlist
                      </button>
                      <button type="button" onClick={() => updateApplicant(applicant.id, 'approve')} className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                        Approve
                      </button>
                      <button type="button" onClick={() => updateApplicant(applicant.id, 'reject')} className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                        Reject
                      </button>
                      <button type="button" onClick={() => setInterviewDate(applicant)} className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">
                        Interview
                      </button>
                      <button type="button" onClick={() => downloadBlob(`/recruitment/admin/reports/applicant/${applicant.id}`, `applicant-${applicant.id}.pdf`)} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                        PDF
                      </button>
                      <button type="button" onClick={() => downloadBlob(`/recruitment/admin/documents/download/${applicant.id}`, `documents-${applicant.id}.zip`)} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                        ZIP
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {applicants.length} of {pagination.total || 0}</span>
          <div className="flex gap-2">
            <button type="button" disabled={pagination.page <= 1} onClick={() => loadApplicants(pagination.page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">
              Previous
            </button>
            <span className="rounded-lg bg-slate-100 px-3 py-1.5">
              Page {pagination.page || 1} / {pagination.totalPages || 1}
            </span>
            <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => loadApplicants(pagination.page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </section>
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
