import React, { useState, useEffect, useCallback } from 'react';
import {
  FaTimes,
  FaCheckCircle,
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaSearch,
  FaFilter,
  FaClock,
  FaUser,
  FaHome,
  FaCalendarAlt,
  FaPercent,
  FaCheck,
  FaBan,
  FaSpinner,
  FaRedo,
} from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';

/**
 * RentSavingsWithdrawals — Admin component
 * Manages early withdrawal requests from rent savings plans.
 *
 * Fetches all requests:  GET  /api/rent-savings/admin/early-withdrawal-requests
 * Approve:               PATCH /api/rent-savings/admin/early-withdrawal-requests/:id/approve
 * Reject:                PATCH /api/rent-savings/admin/early-withdrawal-requests/:id/reject
 */
export default function RentSavingsWithdrawals() {
  const [requests, setRequests]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // request id being processed

  // Filter state
  const [statusFilter, setStatusFilter]   = useState('pending');
  const [searchTerm, setSearchTerm]       = useState('');

  // Rejection modal
  const [rejectModal, setRejectModal]     = useState(null); // request object or null
  const [rejectNote, setRejectNote]       = useState('');

  // Approve confirmation
  const [approveModal, setApproveModal]   = useState(null); // request object or null

  // ── Load data ──────────────────────────────────────────
  const loadRequests = useCallback(async (status) => {
    setLoading(true);
    try {
      const params = status ? { status } : {};
      const { data } = await api.get('/rent-savings/admin/early-withdrawal-requests', { params });
      if (data.success) setRequests(data.data);
    } catch (error) {
      toast.error('Failed to load withdrawal requests');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests(statusFilter);
  }, [statusFilter, loadRequests]);

  // ── Handlers ───────────────────────────────────────────
  const handleApprove = async (request) => {
    setActionLoading(request.id);
    try {
      const { data } = await api.patch(
        `/rent-savings/admin/early-withdrawal-requests/${request.id}/approve`
      );
      if (data.success) {
        toast.success(data.message);
        setApproveModal(null);
        loadRequests(statusFilter);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to approve withdrawal');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectNote.trim()) {
      toast.error('A rejection reason is required');
      return;
    }

    setActionLoading(rejectModal.id);
    try {
      const { data } = await api.patch(
        `/rent-savings/admin/early-withdrawal-requests/${rejectModal.id}/reject`,
        { admin_note: rejectNote.trim() }
      );
      if (data.success) {
        toast.success(data.message);
        setRejectModal(null);
        setRejectNote('');
        loadRequests(statusFilter);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reject withdrawal');
    } finally {
      setActionLoading(null);
    }
  };

  const openApproveModal = (request) => {
    setApproveModal(request);
  };

  const openRejectModal = (request) => {
    setRejectModal(request);
    setRejectNote('');
  };

  // ── Filtered list ──────────────────────────────────────
  const filteredRequests = requests.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.tenant_name || '').toLowerCase().includes(term) ||
      (r.tenant_email || '').toLowerCase().includes(term) ||
      (r.property_title || '').toLowerCase().includes(term) ||
      (r.reason || '').toLowerCase().includes(term)
    );
  });

  // ── Helpers ────────────────────────────────────────────
  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const statusBadge = (status) => {
    const map = {
      pending:  'bg-amber-100 text-amber-800 border-amber-200',
      approved: 'bg-green-100 text-green-800 border-green-200',
      rejected: 'bg-red-100 text-red-800 border-red-200',
    };
    return map[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  };

  // ── Summary stats ──────────────────────────────────────
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const totalPendingAmount = requests
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => s + Number(r.requested_amount || 0), 0);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-red-50 to-amber-50">
        <div className="flex items-center gap-3">
          <FaMoneyBillWave className="text-red-500 text-xl" />
          <h2 className="text-lg font-bold text-gray-800">Early Withdrawal Requests</h2>
        </div>
        <button
          onClick={() => loadRequests(statusFilter)}
          disabled={loading}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <FaRedo className={`text-xs ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Bar */}
      {!loading && requests.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-gray-600">
            Total Requests: <strong>{requests.length}</strong>
          </span>
          <span className="text-amber-600">
            Pending: <strong>{pendingCount}</strong>
          </span>
          {pendingCount > 0 && (
            <span className="text-amber-700">
              Total Pending Amount: <strong>₦{formatCurrency(totalPendingAmount)}</strong>
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <FaSearch className="text-gray-400 text-xs" />
          <input
            type="text"
            placeholder="Search tenant, property, reason…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full text-gray-700 placeholder:text-gray-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <FaFilter className="text-gray-400 text-xs" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input text-sm py-2 pr-8 min-w-[140px]"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All Statuses</option>
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto" />
            <p className="text-gray-500 mt-3 text-sm">Loading withdrawal requests…</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-12">
            <FaMoneyBillWave className="text-gray-300 text-4xl mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              {searchTerm
                ? 'No matching requests found'
                : statusFilter === 'pending'
                  ? 'No Pending Withdrawal Requests'
                  : `No ${statusFilter || ''} withdrawal requests`}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              {statusFilter !== 'pending' && !searchTerm
                ? 'Switch to a different status filter above.'
                : searchTerm
                  ? 'Try adjusting your search terms.'
                  : 'Tenant early withdrawal requests will appear here for review.'}
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="btn btn-primary text-sm"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((req) => (
              <div
                key={req.id}
                className={`border rounded-xl p-5 transition-all hover:shadow-md ${
                  req.status === 'pending'
                    ? 'border-amber-200 bg-amber-50/30'
                    : req.status === 'approved'
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-red-200 bg-red-50/30'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Left: Main Info */}
                  <div className="flex-1 min-w-0">
                    {/* Status badge + ID */}
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${statusBadge(req.status)}`}
                      >
                        {req.status === 'pending' && <FaClock className="inline mr-1 text-[10px]" />}
                        {req.status === 'approved' && <FaCheckCircle className="inline mr-1 text-[10px]" />}
                        {req.status === 'rejected' && <FaBan className="inline mr-1 text-[10px]" />}
                        {req.status}
                      </span>
                      <span className="text-xs text-gray-400">Request #{req.id}</span>
                    </div>

                    {/* Tenant & Property */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <FaUser className="text-gray-400 text-xs shrink-0" />
                        <span className="font-medium text-gray-800 truncate">
                          {req.tenant_name || 'Unknown Tenant'}
                        </span>
                        <span className="text-gray-400 text-xs truncate">
                          ({req.tenant_email})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <FaHome className="text-gray-400 text-xs shrink-0" />
                        <span className="text-gray-700 truncate">
                          {req.property_title || `Property #${req.plan_id}`}
                        </span>
                      </div>
                    </div>

                    {/* Amount Details */}
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <p className="text-xs text-gray-500">Requested Amount</p>
                        <p className="text-sm font-bold text-gray-800">
                          ₦{formatCurrency(req.requested_amount)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <FaPercent className="text-red-500 text-[10px]" /> Penalty (5.8%)
                        </p>
                        <p className="text-sm font-bold text-red-600">
                          -₦{formatCurrency(req.penalty_5pct)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <p className="text-xs text-gray-500">Net Payout</p>
                        <p className="text-sm font-bold text-green-600">
                          ₦{formatCurrency(req.net_payout)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <FaCalendarAlt className="text-gray-400 text-[10px]" /> Requested
                        </p>
                        <p className="text-sm font-medium text-gray-700">
                          {formatDateTime(req.requested_at)}
                        </p>
                      </div>
                    </div>

                    {/* Reason */}
                    {req.reason && (
                      <div className="mt-2 bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <p className="text-xs text-gray-500 mb-0.5">Reason</p>
                        <p className="text-sm text-gray-700">{req.reason}</p>
                      </div>
                    )}

                    {/* Admin note (only shown for rejected) */}
                    {req.admin_note && (
                      <div className="mt-2 bg-red-50 rounded-lg border border-red-100 px-3 py-2">
                        <p className="text-xs text-red-600 mb-0.5">Admin Note</p>
                        <p className="text-sm text-gray-700">{req.admin_note}</p>
                      </div>
                    )}

                    {/* Review details */}
                    {req.reviewed_at && (
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-400">
                        <span>
                          Reviewed: {formatDateTime(req.reviewed_at)}
                        </span>
                        {req.reviewed_by && (
                          <span>
                            By: {req.reviewed_by}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  {req.status === 'pending' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => openApproveModal(req)}
                        disabled={actionLoading === req.id}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === req.id ? (
                          <FaSpinner className="animate-spin" />
                        ) : (
                          <FaCheck />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => openRejectModal(req)}
                        disabled={actionLoading === req.id}
                        className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FaBan />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Approve Confirmation Modal ──────────────────── */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center mb-4">
              <FaCheckCircle className="text-green-500 text-4xl mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-800">Confirm Approval</h3>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-green-800">
                You are about to approve an early withdrawal request from{' '}
                <strong>{approveModal.tenant_name}</strong>.
                The net payout will be credited to their wallet immediately.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Requested Amount</span>
                <span className="font-semibold">₦{formatCurrency(approveModal.requested_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">5.8% Penalty (Revenue)</span>
                <span className="font-semibold text-green-600">
                  ₦{formatCurrency(approveModal.penalty_5pct)}
                </span>
              </div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Net Credited to Tenant</span>
                <span className="text-green-600">₦{formatCurrency(approveModal.net_payout)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setApproveModal(null)}
                className="btn w-full"
                disabled={actionLoading === approveModal.id}
              >
                Cancel
              </button>
              <button
                onClick={() => handleApprove(approveModal)}
                disabled={actionLoading === approveModal.id}
                className="btn bg-green-600 text-white w-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {actionLoading === approveModal.id ? (
                  <><FaSpinner className="animate-spin" /> Processing…</>
                ) : (
                  <><FaCheckCircle /> Approve & Release Funds</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ──────────────────────────────── */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center mb-4">
              <FaExclamationTriangle className="text-red-500 text-4xl mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-800">Reject Withdrawal Request</h3>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-red-800">
                You are about to reject the early withdrawal request from{' '}
                <strong>{rejectModal.tenant_name}</strong>.
                A rejection reason is required.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="input w-full"
                rows={4}
                placeholder="Explain why this request is being rejected…"
              />
              <p className="text-xs text-gray-400 mt-1">
                This note will be visible to the tenant via their notification.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setRejectModal(null); setRejectNote(''); }}
                className="btn w-full"
                disabled={actionLoading === rejectModal.id}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectModal.id || !rejectNote.trim()}
                className="btn bg-red-600 text-white w-full hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {actionLoading === rejectModal.id ? (
                  <><FaSpinner className="animate-spin" /> Rejecting…</>
                ) : (
                  <><FaBan /> Reject Request</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
