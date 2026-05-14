import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  FaBell,
  FaCheckCircle,
  FaExclamationTriangle,
  FaMapMarkerAlt,
  FaPaperPlane,
  FaSearch,
  FaSyncAlt,
  FaTimesCircle,
} from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

const SUPPORT_ROLES = ['super_admin', 'super_support_admin', 'state_support_admin', 'lga_support_admin'];
const STATE_ACTION_ROLES = ['state_admin', 'state_financial_admin', 'admin', 'lga_admin'];

const statusLabels = {
  pending_support_review: 'Pending Support Review',
  approved_assigned: 'Approved and Assigned',
  rejected: 'Rejected',
  sourcing: 'Sourcing',
  lga_coverage_missing: 'LGA Coverage Missing',
  fulfilled: 'Fulfilled',
};

const statusClass = (status) => {
  if (status === 'fulfilled') return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  if (status === 'lga_coverage_missing') return 'bg-orange-100 text-orange-700';
  if (status === 'sourcing') return 'bg-blue-100 text-blue-700';
  if (status === 'approved_assigned') return 'bg-indigo-100 text-indigo-700';
  return 'bg-amber-100 text-amber-700';
};

const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || amount === '') return '-';
  return `N${Number(amount).toLocaleString()}`;
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const PropertyRequestWorkflowPanel = ({ mode = 'auto', title = 'Tenant Property Requests' }) => {
  const { user } = useAuth();
  const role = String(user?.user_type || '').toLowerCase();
  const canSupportReview = SUPPORT_ROLES.includes(role);
  const canStateAction = STATE_ACTION_ROLES.includes(role);
  const resolvedMode = mode === 'auto'
    ? canSupportReview
      ? 'support'
      : 'state'
    : mode;

  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState(
    resolvedMode === 'support' ? 'pending_support_review' : 'approved_assigned'
  );
  const [actionId, setActionId] = useState(null);
  const [notificationForms, setNotificationForms] = useState({});

  const statusOptions = useMemo(() => {
    if (resolvedMode === 'support') {
      return [
        ['pending_support_review', 'Pending Review'],
        ['approved_assigned', 'Approved'],
        ['rejected', 'Rejected'],
        ['sourcing', 'Sourcing'],
        ['lga_coverage_missing', 'LGA Missing'],
        ['fulfilled', 'Fulfilled'],
        ['all', 'All'],
      ];
    }

    return [
      ['approved_assigned', 'Assigned'],
      ['sourcing', 'Sourcing'],
      ['lga_coverage_missing', 'LGA Missing'],
      ['fulfilled', 'Fulfilled'],
      ['all', 'All'],
    ];
  }, [resolvedMode]);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/property-alerts/admin/requests', {
        params: { status, limit: 75 },
      });
      setRequests(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load property requests');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const reviewRequest = async (request, decision) => {
    const reviewNote = window.prompt(
      decision === 'approved'
        ? 'Optional note for the state admin'
        : 'Reason for rejecting this request'
    );

    if (reviewNote === null) return;

    try {
      setActionId(request.id);
      await api.patch(`/property-alerts/admin/requests/${request.id}/support-review`, {
        decision,
        review_note: reviewNote || undefined,
      });
      toast.success(
        decision === 'approved'
          ? 'Request approved and sent to the state team'
          : 'Request rejected'
      );
      await loadRequests();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Request review failed');
    } finally {
      setActionId(null);
    }
  };

  const updateStateAction = async (request, action) => {
    const promptByAction = {
      sourcing: 'Add sourcing note for this request',
      lga_missing: 'Explain the LGA coverage issue',
      fulfilled: 'Add fulfillment note',
    };
    const note = window.prompt(promptByAction[action] || 'Add note');

    if (note === null) return;

    try {
      setActionId(request.id);
      await api.patch(`/property-alerts/admin/requests/${request.id}/state-action`, {
        action,
        note: note || undefined,
      });
      toast.success('Property request updated');
      await loadRequests();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update property request');
    } finally {
      setActionId(null);
    }
  };

  const getNotificationForm = (requestId) => notificationForms[requestId] || {
    admin_scope: 'request_lga',
    state_names: '',
    lga_names: '',
  };

  const updateNotificationForm = (requestId, patch) => {
    setNotificationForms((prev) => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] || {
          admin_scope: 'request_lga',
          state_names: '',
          lga_names: '',
        }),
        ...patch,
      },
    }));
  };

  const parseCsv = (value) =>
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const resendNotifications = async (request, target) => {
    const form = getNotificationForm(request.id);

    try {
      setActionId(request.id);
      const response = await api.post(`/property-alerts/admin/requests/${request.id}/resend-notifications`, {
        target,
        admin_scope: form.admin_scope,
        state_names: parseCsv(form.state_names),
        lga_names: parseCsv(form.lga_names),
      });
      const sent = response.data?.data?.sent ?? 0;
      const skipped = response.data?.data?.skipped ?? 0;
      toast.success(`Notification sent to ${sent} recipient${sent === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Notification failed');
    } finally {
      setActionId(null);
    }
  };

  const pendingCount = requests.filter((item) => item.workflow_status === 'pending_support_review').length;
  const lgaMissingCount = requests.filter((item) => item.workflow_status === 'lga_coverage_missing').length;
  const canNotifyLandlords = ['admin', 'lga_admin', 'lga_support_admin', 'state_admin', 'state_financial_admin', 'state_support_admin', 'super_admin', 'super_support_admin'].includes(role);
  const canNotifyLgaAdmins = ['state_admin', 'state_financial_admin', 'state_support_admin', 'super_admin', 'super_support_admin'].includes(role);
  const isSuperNotificationRole = ['super_admin', 'super_support_admin'].includes(role);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">
            Review tenant requests, route approved requests to the state team, and track LGA coverage gaps.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRequests}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <FaSyncAlt size={14} /> Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Visible Requests</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{requests.length}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">Pending Support</p>
          <p className="mt-1 text-xl font-bold text-amber-800">{pendingCount}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
          <p className="text-xs text-orange-700">LGA Missing</p>
          <p className="mt-1 text-xl font-bold text-orange-800">{lgaMissingCount}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {statusOptions.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
              status === value
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {loading && (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Loading property requests...
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No property requests in this queue.
          </div>
        )}

        {!loading && requests.map((request) => (
          <article key={request.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {request.full_name}
                  </h4>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(request.workflow_status)}`}>
                    {statusLabels[request.workflow_status] || request.workflow_status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {request.email}{request.phone ? ` | ${request.phone}` : ''}
                </p>
              </div>

              <div className="text-right text-xs text-slate-500">
                <p>Submitted {formatDate(request.created_at)}</p>
                {request.assigned_admin_name && (
                  <p className="mt-1 text-indigo-700">Assigned: {request.assigned_admin_name}</p>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Location</p>
                <p className="mt-1 font-medium text-slate-900">
                  {request.state_name || 'Unknown'}{request.lga_name ? `, ${request.lga_name}` : ''}
                </p>
                {request.city && <p className="text-xs text-slate-500">{request.city}</p>}
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Property</p>
                <p className="mt-1 font-medium capitalize text-slate-900">{request.property_type}</p>
                <p className="text-xs text-slate-500">
                  {request.bedrooms || 0}+ bed | {request.bathrooms || 0}+ bath
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Budget</p>
                <p className="mt-1 font-medium text-slate-900">
                  {formatCurrency(request.min_price)} - {formatCurrency(request.max_price)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">State Update</p>
                <p className="mt-1 font-medium text-slate-900">
                  {request.state_admin_status
                    ? statusLabels[request.state_admin_status] || request.state_admin_status
                    : 'Not started'}
                </p>
              </div>
            </div>

            {(request.support_note || request.state_admin_note) && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                {request.support_note && <p><strong>Support:</strong> {request.support_note}</p>}
                {request.state_admin_note && <p className="mt-1"><strong>State admin:</strong> {request.state_admin_note}</p>}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {canSupportReview && request.workflow_status === 'pending_support_review' && (
                <>
                  <button
                    type="button"
                    disabled={actionId === request.id}
                    onClick={() => reviewRequest(request, 'approved')}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    <FaCheckCircle /> Approve and Send to State
                  </button>
                  <button
                    type="button"
                    disabled={actionId === request.id}
                    onClick={() => reviewRequest(request, 'rejected')}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    <FaTimesCircle /> Reject
                  </button>
                </>
              )}

              {canStateAction && ['approved_assigned', 'sourcing', 'lga_coverage_missing'].includes(request.workflow_status) && (
                <>
                  <button
                    type="button"
                    disabled={actionId === request.id}
                    onClick={() => updateStateAction(request, 'sourcing')}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-600 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                  >
                    <FaSearch /> Mark Sourcing
                  </button>
                  <button
                    type="button"
                    disabled={actionId === request.id}
                    onClick={() => updateStateAction(request, 'lga_missing')}
                    className="inline-flex items-center gap-2 rounded-lg border border-orange-500 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                  >
                    <FaExclamationTriangle /> LGA Coverage Missing
                  </button>
                  <button
                    type="button"
                    disabled={actionId === request.id}
                    onClick={() => updateStateAction(request, 'fulfilled')}
                    className="inline-flex items-center gap-2 rounded-lg border border-green-600 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-60"
                  >
                    <FaMapMarkerAlt /> Mark Fulfilled
                  </button>
                </>
              )}
            </div>

            {(canNotifyLandlords || canNotifyLgaAdmins) && ['approved_assigned', 'sourcing', 'lga_coverage_missing'].includes(request.workflow_status) && (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Notification Controls</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Send bell alerts to the right people for this request.
                    </p>
                  </div>
                  {canNotifyLandlords && (
                    <button
                      type="button"
                      disabled={actionId === request.id}
                      onClick={() => resendNotifications(request, 'landlords')}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <FaBell /> Notify Landlords
                    </button>
                  )}
                </div>

                {canNotifyLgaAdmins && (
                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[180px_1fr_1fr_auto]">
                    <select
                      value={getNotificationForm(request.id).admin_scope}
                      onChange={(event) => updateNotificationForm(request.id, { admin_scope: event.target.value })}
                      className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700"
                    >
                      <option value="request_lga">Request LGA admin</option>
                      <option value="all_state_lgas">All LGA admins in state</option>
                      <option value="specific_lga">Specific LGA admin</option>
                    </select>

                    {isSuperNotificationRole && (
                      <input
                        type="text"
                        value={getNotificationForm(request.id).state_names}
                        onChange={(event) => updateNotificationForm(request.id, { state_names: event.target.value })}
                        placeholder="States, comma separated (blank uses request state)"
                        className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700"
                      />
                    )}

                    <input
                      type="text"
                      value={getNotificationForm(request.id).lga_names}
                      onChange={(event) => updateNotificationForm(request.id, { lga_names: event.target.value })}
                      placeholder="LGAs, comma separated"
                      disabled={getNotificationForm(request.id).admin_scope === 'all_state_lgas'}
                      className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 disabled:bg-slate-100"
                    />

                    <button
                      type="button"
                      disabled={actionId === request.id}
                      onClick={() => resendNotifications(request, 'lga_admins')}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      <FaPaperPlane /> Notify LGA Admins
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};

export default PropertyRequestWorkflowPanel;
