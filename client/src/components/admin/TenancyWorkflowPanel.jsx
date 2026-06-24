import React, { useEffect, useState } from 'react';
import { FaCheckCircle, FaClock, FaSyncAlt, FaTimesCircle } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';

const statusBadge = (status) => {
  if (status === 'pending' || status === 'pending_admin_review') return 'bg-amber-100 text-amber-700';
  if (status === 'enabled') return 'bg-blue-100 text-blue-700';
  if (status === 'rejected' || status === 'landlord_rejected') return 'bg-red-100 text-red-700';
  if (status === 'approved' || status === 'landlord_approved' || status === 'refunded') return 'bg-green-100 text-green-700';
  return 'bg-slate-100 text-slate-700';
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatAmount = (value) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDuration = (days = 0, months = 0) => {
  const parts = [];
  if (Number(months) > 0) parts.push(`${Number(months)} ${Number(months) === 1 ? 'month' : 'months'}`);
  if (Number(days) > 0) parts.push(`${Number(days)} ${Number(days) === 1 ? 'day' : 'days'}`);
  return parts.length ? parts.join(' and ') : 'Not specified';
};

const getCountdown = (value, label) => {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const diff = target.getTime() - Date.now();
  const days = Math.max(1, Math.ceil(Math.abs(diff) / (1000 * 60 * 60 * 24)));
  return diff >= 0 ? `${label} in ${days}d` : `${label} overdue by ${days}d`;
};

const TenancyWorkflowPanel = ({ title = 'Tenancy Refund and Grace Requests' }) => {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [graceRequests, setGraceRequests] = useState([]);
  const [relocationRefunds, setRelocationRefunds] = useState([]);
  const [notes, setNotes] = useState({});

  const loadRequests = async () => {
    setLoading(true);
    try {
      const [graceRes, refundRes] = await Promise.all([
        api.get('/payments/tenancy-adjustments/admin?status=pending_admin_review&limit=20'),
        api.get('/payments/refund/admin/all?category=early_exit_refund&status=pending&limit=20'),
      ]);
      setGraceRequests(graceRes.data?.data || []);
      setRelocationRefunds((refundRes.data?.data || []).filter((item) => item.feature_enabled !== true));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load tenancy workflow requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateNote = (key, value) => {
    setNotes((prev) => ({ ...prev, [key]: value }));
  };

  const reviewGraceRequest = async (requestId, action) => {
    const key = `grace_${requestId}`;
    setActionLoading(`${key}_${action}`);
    try {
      await api.put(`/payments/tenancy-adjustments/admin/${requestId}/review`, {
        action,
        admin_note: notes[key] || undefined,
      });
      toast.success(action === 'enable' ? 'Grace request enabled for landlord review' : 'Grace request rejected');
      await loadRequests();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to review grace request');
    } finally {
      setActionLoading('');
    }
  };

  const reviewRefundRequest = async (refundId, action) => {
    const key = `refund_${refundId}`;
    setActionLoading(`${key}_${action}`);
    try {
      await api.put(`/payments/refund/admin/${refundId}/review`, {
        action,
        admin_note: notes[key] || undefined,
      });
      toast.success(action === 'enable' ? 'Relocation refund enabled for landlord review' : 'Relocation refund rejected');
      await loadRequests();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to review relocation refund');
    } finally {
      setActionLoading('');
    }
  };

  const totalPending = graceRequests.length + relocationRefunds.length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-indigo-700">
            <FaClock />
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Enable tenant-requested expired-rent grace periods and relocation refunds before landlord review.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRequests}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <FaSyncAlt /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        Pending hierarchy enablement: <strong>{totalPending}</strong>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RequestGroup
          title="Tenant Grace Period Requests"
          emptyText="No tenant grace period requests waiting for enablement."
          rows={graceRequests}
          renderRow={(row) => {
            const key = `grace_${row.id}`;
            return (
              <WorkflowCard
                key={key}
                title={row.property_title}
                status={row.status}
                meta={`${row.state_name || 'State N/A'} - ${row.lga_name || 'LGA N/A'}`}
                details={[
                  `Tenant: ${row.tenant_name || 'N/A'}`,
                  `Landlord: ${row.landlord_name || 'N/A'}`,
                  `Rent expired: ${formatDate(row.tenancy_expires_at)}`,
                  `Requested duration: ${formatDuration(row.requested_duration_days, row.requested_duration_months)}`,
                ]}
                note={notes[key] || ''}
                onNoteChange={(value) => updateNote(key, value)}
                onEnable={() => reviewGraceRequest(row.id, 'enable')}
                onReject={() => reviewGraceRequest(row.id, 'reject')}
                enableLoading={actionLoading === `${key}_enable`}
                rejectLoading={actionLoading === `${key}_reject`}
              />
            );
          }}
        />

        <RequestGroup
          title="Relocation Refund Requests"
          emptyText="No relocation refund requests waiting for enablement."
          rows={relocationRefunds}
          renderRow={(row) => {
            const key = `refund_${row.id}`;
            return (
              <WorkflowCard
                key={key}
                title={row.property_title}
                status={row.status}
                meta={`${row.state_name || 'State N/A'} - ${row.lga_name || 'LGA N/A'}`}
                details={[
                  `Tenant: ${row.tenant_name || 'N/A'}`,
                  `Landlord: ${row.landlord_name || 'N/A'}`,
                  `Amount: ${formatAmount(row.amount)}`,
                  `Move-out: ${formatDate(row.requested_move_out_date)}`,
                  getCountdown(row.refund_due_at, 'Refund') || `Refund deadline: ${formatDate(row.refund_due_at)}`,
                ].filter(Boolean)}
                note={notes[key] || ''}
                onNoteChange={(value) => updateNote(key, value)}
                onEnable={() => reviewRefundRequest(row.id, 'enable')}
                onReject={() => reviewRefundRequest(row.id, 'reject')}
                enableLoading={actionLoading === `${key}_enable`}
                rejectLoading={actionLoading === `${key}_reject`}
              />
            );
          }}
        />
      </div>
    </section>
  );
};

const RequestGroup = ({ title, emptyText, rows, renderRow }) => (
  <div className="rounded-lg border border-slate-200">
    <div className="border-b border-slate-200 px-4 py-3">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
    </div>
    <div className="space-y-3 p-4">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        rows.map(renderRow)
      )}
    </div>
  </div>
);

const WorkflowCard = ({
  title,
  status,
  meta,
  details,
  note,
  onNoteChange,
  onEnable,
  onReject,
  enableLoading,
  rejectLoading,
}) => (
  <article className="rounded-lg border border-slate-200 p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h4 className="break-words text-sm font-bold text-slate-900">{title || 'Property request'}</h4>
        <p className="mt-1 text-xs text-slate-500">{meta}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadge(status)}`}>
        {String(status || '').replace(/_/g, ' ')}
      </span>
    </div>

    <div className="mt-3 space-y-1 text-sm text-slate-700">
      {details.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>

    <textarea
      rows={2}
      value={note}
      onChange={(event) => onNoteChange(event.target.value)}
      className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      placeholder="Optional admin/support note..."
    />

    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button
        type="button"
        onClick={onEnable}
        disabled={enableLoading || rejectLoading}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
      >
        <FaCheckCircle /> {enableLoading ? 'Enabling...' : 'Enable'}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={enableLoading || rejectLoading}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        <FaTimesCircle /> {rejectLoading ? 'Rejecting...' : 'Reject'}
      </button>
    </div>
  </article>
);

export default TenancyWorkflowPanel;
