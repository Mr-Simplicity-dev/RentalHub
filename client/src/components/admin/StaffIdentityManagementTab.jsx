import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  FaBan,
  FaCheckCircle,
  FaFlag,
  FaHistory,
  FaIdBadge,
  FaPlus,
  FaRedo,
  FaSearch,
  FaShieldAlt,
  FaTimesCircle,
  FaUpload,
} from 'react-icons/fa';
import staffVerificationService from '../../services/staffVerificationService';

const ENGAGEMENT_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'contract_staff', label: 'Contract Staff' },
  { value: 'field_agent', label: 'Field Agent' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'approved_representative', label: 'Approved Representative' },
];

export default function StaffIdentityManagementTab() {
  const [subTab, setSubTab] = useState('identities');
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState({ approved_activity_catalog: [] });
  const [identities, setIdentities] = useState([]);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [history, setHistory] = useState({ events: [], challenges: [], suspicious_activity: [] });
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Create new staff identity form
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    user_id: '',
    full_name: '',
    official_role: '',
    department: '',
    engagement_type: 'field_agent',
    approved_activities: [],
    financial_collection_authorized: false,
    valid_from: new Date().toISOString().slice(0, 10),
    expires_at: '',
  });

  // Edit modal state
  const [editing, setEditing] = useState(null);
  const [reportDrafts, setReportDrafts] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, idRes, usersRes, histRes, repRes] = await Promise.all([
        staffVerificationService.getAdminCatalog(),
        staffVerificationService.listIdentities({ status: statusFilter, search: searchQuery }),
        staffVerificationService.getEligibleUsers(userSearch),
        staffVerificationService.getAdminHistory(100),
        staffVerificationService.listImpersonationReports(),
      ]);
      if (catRes.data?.success) setCatalog(catRes.data.data);
      if (idRes.data?.success) setIdentities(idRes.data.data || []);
      if (usersRes.data?.success) setEligibleUsers(usersRes.data.data || []);
      if (histRes.data?.success) setHistory(histRes.data.data || { events: [], challenges: [], suspicious_activity: [] });
      if (repRes.data?.success) setReports(repRes.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load Staff Identity Management data');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, userSearch]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleCreateActivity = (code) => {
    setCreateForm((prev) => ({
      ...prev,
      approved_activities: prev.approved_activities.includes(code)
        ? prev.approved_activities.filter((c) => c !== code)
        : [...prev.approved_activities, code],
    }));
  };

  const handleSelectEligibleUser = (userId) => {
    const found = eligibleUsers.find((u) => String(u.id) === String(userId));
    setCreateForm((prev) => ({
      ...prev,
      user_id: userId,
      full_name: found?.full_name || prev.full_name,
    }));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.user_id) {
      toast.error('Select an eligible existing staff account.');
      return;
    }
    setBusyId('create');
    try {
      const res = await staffVerificationService.createIdentity({
        ...createForm,
        user_id: Number(createForm.user_id),
        expires_at: createForm.expires_at || null,
      });
      if (res.data?.success) {
        toast.success(
          `Staff identity ${res.data.data.staff_verification_id} created (Pending Approval).`
        );
        setCreateOpen(false);
        setCreateForm({
          user_id: '',
          full_name: '',
          official_role: '',
          department: '',
          engagement_type: 'field_agent',
          approved_activities: [],
          financial_collection_authorized: false,
          valid_from: new Date().toISOString().slice(0, 10),
          expires_at: '',
        });
        await loadAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Unable to register staff identity.');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusAction = async (identity, action) => {
    setBusyId(identity.id);
    try {
      const res = await staffVerificationService.updateIdentityStatus(identity.id, action);
      if (res.data?.success) {
        toast.success(`Updated ${identity.full_name} (${action})`);
        await loadAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} staff identity`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerateId = async (identity) => {
    setBusyId(identity.id);
    try {
      const res = await staffVerificationService.regenerateIdentityId(identity.id);
      if (res.data?.success) {
        toast.success(`New Staff Verification ID generated: ${res.data.data.staff_verification_id}`);
        await loadAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate Staff Verification ID');
    } finally {
      setBusyId(null);
    }
  };

  const handlePhotoUpload = async (identity, file) => {
    if (!file) return;
    setBusyId(identity.id);
    try {
      const res = await staffVerificationService.uploadIdentityPhoto(identity.id, file);
      if (res.data?.success) {
        toast.success(`Official photograph updated for ${identity.full_name}`);
        await loadAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Photo upload failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const res = await staffVerificationService.updateIdentity(editing.id, {
        full_name: editing.full_name,
        official_role: editing.official_role,
        department: editing.department,
        engagement_type: editing.engagement_type,
        approved_activities: editing.approved_activities,
        financial_collection_authorized: editing.financial_collection_authorized,
        valid_from: editing.valid_from || null,
        expires_at: editing.expires_at || null,
      });
      if (res.data?.success) {
        toast.success('Staff identity updated');
        setEditing(null);
        await loadAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateReport = async (report, nextStatus) => {
    setBusyId(`rep-${report.id}`);
    try {
      const notes = reportDrafts[report.id] ?? report.investigation_notes ?? '';
      const res = await staffVerificationService.updateImpersonationReport(report.id, {
        status: nextStatus,
        investigation_notes: notes,
      });
      if (res.data?.success) {
        toast.success(`Report ${report.report_reference} marked ${nextStatus}`);
        await loadAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Unable to update report');
    } finally {
      setBusyId(null);
    }
  };

  const activityCatalog = catalog.approved_activity_catalog || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary-700">
            Super Admin Governance
          </p>
          <h2 className="text-2xl font-bold text-slate-900">STAFF IDENTITY MANAGEMENT</h2>
          <p className="mt-1 text-sm text-slate-600">
            Register eligible staff accounts, approve or revoke public verification IDs, assign
            explicitly permitted activities, and investigate impersonation reports.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 whitespace-nowrap"
        >
          <FaPlus className="text-xs" aria-hidden="true" />
          <span>{createOpen ? 'Close Registration Form' : 'Register Eligible Staff'}</span>
        </button>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { key: 'identities', label: `Staff Identities (${identities.length})`, icon: FaIdBadge },
          {
            key: 'history',
            label: `Verification & Live History (${history.challenges?.length || 0})`,
            icon: FaHistory,
          },
          {
            key: 'reports',
            label: `Impersonation Reports (${reports.filter((r) => r.status === 'open').length} open)`,
            icon: FaFlag,
          },
        ].map((item) => {
          const IconComp = item.icon;
          const active = subTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSubTab(item.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <IconComp className="text-xs" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Register New Eligible Staff Form */}
      {createOpen && (
        <form
          onSubmit={handleCreateSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Register Existing Eligible Staff Account
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              New records start in <strong>Pending Approval</strong> and never appear publicly
              until explicitly approved.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Filter Eligible Accounts
              </label>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, email, or role..."
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Select Existing Staff Account *
              </label>
              <select
                required
                value={createForm.user_id}
                onChange={(e) => handleSelectEligibleUser(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                <option value="">Choose eligible user...</option>
                {eligibleUsers
                  .filter((u) => !u.staff_identity_id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.user_type}) — {u.email}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Official Registered Name *
              </label>
              <input
                type="text"
                required
                value={createForm.full_name}
                onChange={(e) => setCreateForm((p) => ({ ...p, full_name: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Engagement Type *
              </label>
              <select
                value={createForm.engagement_type}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, engagement_type: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                {ENGAGEMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Official Role / Title *
              </label>
              <input
                type="text"
                required
                value={createForm.official_role}
                onChange={(e) => setCreateForm((p) => ({ ...p, official_role: e.target.value }))}
                placeholder="e.g. Field Inspection Officer"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Department *
              </label>
              <input
                type="text"
                required
                value={createForm.department}
                onChange={(e) => setCreateForm((p) => ({ ...p, department: e.target.value }))}
                placeholder="e.g. Property Operations"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Valid From</label>
              <input
                type="date"
                value={createForm.valid_from}
                onChange={(e) => setCreateForm((p) => ({ ...p, valid_from: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Expiry Date (optional)
              </label>
              <input
                type="date"
                value={createForm.expires_at}
                onChange={(e) => setCreateForm((p) => ({ ...p, expires_at: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700">
              Explicitly Permitted Activities (never inferred from job title)
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {activityCatalog.map((item) => (
                <label
                  key={item.code}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm text-slate-800 cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={createForm.approved_activities.includes(item.code)}
                    onChange={() => toggleCreateActivity(item.code)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyId === 'create'}
              className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busyId === 'create' ? 'Registering...' : 'Create Pending Staff Identity'}
            </button>
          </div>
        </form>
      )}

      {/* SUBTAB 1: STAFF IDENTITIES */}
      {subTab === 'identities' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <FaSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, Staff ID, department, or email..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="revoked">Revoked</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600">Loading staff identities...</p>
          ) : identities.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              No staff identities found matching your filter.
            </div>
          ) : (
            <div className="space-y-3">
              {identities.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row">
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
                        {item.official_photo_url ? (
                          <img
                            src={item.official_photo_url}
                            alt={item.full_name}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <FaIdBadge className="h-6 w-6 text-slate-400" aria-hidden="true" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            {item.staff_verification_id}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold uppercase text-primary-700">
                            {item.status.replace(/_/g, ' ')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.engagement_type_label}</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">{item.full_name}</h3>
                        <p className="text-sm text-slate-700">
                          {item.official_role} · {item.department}
                        </p>
                        <p className="text-xs text-slate-500">
                          Account: {item.account_email} ({item.account_user_type}) · Expires:{' '}
                          {item.expires_at
                            ? new Date(item.expires_at).toLocaleDateString()
                            : 'Ongoing'}
                        </p>
                        <p className="text-xs text-slate-600">
                          Approved activities:{' '}
                          {item.approved_activities_detailed?.length
                            ? item.approved_activities_detailed.map((a) => a.label).join(', ')
                            : 'None assigned'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <FaUpload className="text-[11px]" aria-hidden="true" />
                        <span>Upload Photo</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(item, file);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...item,
                            valid_from: item.valid_from ? item.valid_from.slice(0, 10) : '',
                            expires_at: item.expires_at ? item.expires_at.slice(0, 10) : '',
                          })
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit Details &amp; Activities
                      </button>

                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => handleRegenerateId(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <FaRedo className="text-[10px]" aria-hidden="true" />
                        <span>New ID</span>
                      </button>

                      {item.status === 'pending_approval' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleStatusAction(item, 'approve')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                          >
                            <FaCheckCircle aria-hidden="true" />
                            <span>Approve &amp; Activate</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleStatusAction(item, 'reject')}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                          >
                            <FaTimesCircle aria-hidden="true" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {item.status === 'active' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleStatusAction(item, 'suspend')}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                          >
                            <FaBan aria-hidden="true" />
                            <span>Suspend</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleStatusAction(item, 'revoke')}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                          >
                            <FaTimesCircle aria-hidden="true" />
                            <span>Revoke</span>
                          </button>
                        </>
                      )}

                      {['suspended', 'revoked', 'rejected'].includes(item.status) && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => handleStatusAction(item, 'reinstate')}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          <FaShieldAlt aria-hidden="true" />
                          <span>Reinstate</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: VERIFICATION & LIVE HISTORY + SUSPICIOUS ACTIVITY */}
      {subTab === 'history' && (
        <div className="space-y-6">
          {history.suspicious_activity?.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
              <h3 className="text-sm font-bold text-amber-950">
                Suspicious Verification Activity (Last 24 Hours)
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs text-amber-950">
                  <thead>
                    <tr className="border-b border-amber-200 font-semibold">
                      <th className="py-2 pr-4">IP Address</th>
                      <th className="py-2 pr-4">Failed Lookups</th>
                      <th className="py-2 pr-4">Rejected Challenges</th>
                      <th className="py-2 pr-4">Wrong-Staff Attempts</th>
                      <th className="py-2">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200/70 font-mono tabular-nums">
                    {history.suspicious_activity.map((row) => (
                      <tr key={row.ip_address}>
                        <td className="py-2 pr-4">{row.ip_address}</td>
                        <td className="py-2 pr-4">{row.failed_lookups}</td>
                        <td className="py-2 pr-4">{row.rejected_challenges}</td>
                        <td className="py-2 pr-4">{row.wrong_staff_attempts}</td>
                        <td className="py-2">{new Date(row.last_seen).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-base font-bold text-slate-900">Live Confirmation History</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead>
                  <tr className="font-semibold text-slate-500">
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Staff</th>
                    <th className="py-2 pr-3">Purpose</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {(history.challenges || []).map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 font-mono tabular-nums">{c.challenge_reference}</td>
                      <td className="py-2 pr-3">
                        {c.staff_name} ({c.staff_verification_id})
                      </td>
                      <td className="py-2 pr-3 max-w-xs truncate">{c.purpose}</td>
                      <td className="py-2 pr-3 font-semibold capitalize">{c.status}</td>
                      <td className="py-2 font-mono text-slate-500 tabular-nums">
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-base font-bold text-slate-900">Audit &amp; Lookup Events</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead>
                  <tr className="font-semibold text-slate-500">
                    <th className="py-2 pr-3">Event</th>
                    <th className="py-2 pr-3">Staff</th>
                    <th className="py-2 pr-3">Outcome</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {(history.events || []).map((ev) => (
                    <tr key={ev.id}>
                      <td className="py-2 pr-3 font-mono">{ev.event_type}</td>
                      <td className="py-2 pr-3">
                        {ev.staff_name ? `${ev.staff_name} (${ev.staff_verification_id})` : '—'}
                      </td>
                      <td className="py-2 pr-3">{ev.outcome || '—'}</td>
                      <td className="py-2 pr-3">{ev.actor_name || 'Public Visitor'}</td>
                      <td className="py-2 font-mono text-slate-500 tabular-nums">
                        {new Date(ev.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: IMPERSONATION REPORTS */}
      {subTab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              No impersonation reports submitted.
            </div>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {rep.report_reference}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold uppercase text-red-700">
                      {rep.category.replace(/_/g, ' ')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold uppercase text-slate-900">{rep.status}</span>
                  </div>
                  <span className="font-mono tabular-nums">
                    {new Date(rep.created_at).toLocaleString()}
                  </span>
                </div>

                <p className="text-sm text-slate-800 whitespace-pre-wrap">{rep.description}</p>

                <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                  <span>Staff ID Claimed: {rep.reported_staff_id || 'None'}</span>
                  <span>Location: {rep.incident_location || 'Not provided'}</span>
                  <span>
                    Reporter (Confidential): {rep.reporter_name || 'Anonymous'}{' '}
                    {rep.reporter_contact ? `(${rep.reporter_contact})` : ''}
                  </span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={reportDrafts[rep.id] ?? rep.investigation_notes ?? ''}
                    onChange={(e) =>
                      setReportDrafts((prev) => ({ ...prev, [rep.id]: e.target.value }))
                    }
                    placeholder="Add confidential investigation notes..."
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <div className="flex gap-2">
                    {['investigating', 'resolved', 'dismissed'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={busyId === `rep-${rep.id}`}
                        onClick={() => handleUpdateReport(rep, st)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold capitalize text-slate-700 hover:bg-slate-50"
                      >
                        Mark {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Edit Staff Identity Modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEdit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
          >
            <h3 className="text-lg font-bold text-slate-900">
              Edit Staff Identity — {editing.staff_verification_id}
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={editing.full_name}
                  onChange={(e) => setEditing((p) => ({ ...p, full_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Engagement Type
                </label>
                <select
                  value={editing.engagement_type}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, engagement_type: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {ENGAGEMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Official Role</label>
                <input
                  type="text"
                  required
                  value={editing.official_role}
                  onChange={(e) => setEditing((p) => ({ ...p, official_role: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Department</label>
                <input
                  type="text"
                  required
                  value={editing.department}
                  onChange={(e) => setEditing((p) => ({ ...p, department: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Valid From</label>
                <input
                  type="date"
                  value={editing.valid_from || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, valid_from: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Expires At</label>
                <input
                  type="date"
                  value={editing.expires_at || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, expires_at: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700">Explicitly Approved Activities</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {activityCatalog.map((act) => {
                  const checked = (editing.approved_activities || []).includes(act.code);
                  return (
                    <label
                      key={act.code}
                      className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setEditing((p) => ({
                            ...p,
                            approved_activities: checked
                              ? p.approved_activities.filter((c) => c !== act.code)
                              : [...p.approved_activities, act.code],
                          }))
                        }
                      />
                      <span>{act.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === editing.id}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
