import React, { useEffect, useState } from 'react';
import { FaBank, FaCheck, FaClock, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import Loader from '../../components/common/Loader';

const AgentWithdrawalPage = () => {
  const [agentId] = useState(parseInt(localStorage.getItem('userId') || 0));
  const [landlordId, setLandlordId] = useState('');
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    withdrawalMethod: 'bank_transfer',
    bankAccountId: '',
    requestReason: '',
  });

  useEffect(() => {
    loadData();
  }, [landlordId]);

  const loadData = async () => {
    if (!landlordId) return;

    try {
      setLoading(true);
      
      // Load withdrawal requests
      const requestsResponse = await api.get(`/api/withdrawals/agents/${agentId}/withdrawal-requests?landlordId=${landlordId}`);
      if (requestsResponse.data?.success) {
        setWithdrawalRequests(requestsResponse.data.data);
      }

      // Load summary
      const summaryResponse = await api.get(`/api/withdrawals/agents/${agentId}/withdrawal-summary?landlordId=${landlordId}`);
      if (summaryResponse.data?.success) {
        setSummary(summaryResponse.data.data);
      }
    } catch (error) {
      console.error('Failed to load withdrawal data:', error);
      toast.error('Failed to load withdrawal information');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!landlordId) {
      toast.error('Please select a landlord');
      return;
    }

    try {
      setSubmitting(true);
      const response = await api.post(`/api/withdrawals/agents/${agentId}/withdrawal-requests`, {
        landlordId: parseInt(landlordId),
        amount: parseFloat(formData.amount),
        withdrawalMethod: formData.withdrawalMethod,
        bankAccountId: formData.bankAccountId ? parseInt(formData.bankAccountId) : null,
        requestReason: formData.requestReason,
      });

      if (response.data?.success) {
        toast.success('Withdrawal request submitted successfully');
        setShowForm(false);
        setFormData({
          amount: '',
          withdrawalMethod: 'bank_transfer',
          bankAccountId: '',
          requestReason: '',
        });
        loadData();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit withdrawal request');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const configs = {
      pending: { icon: FaClock, bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
      approved: { icon: FaCheck, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Approved' },
      processing: { icon: FaClock, bg: 'bg-purple-100', text: 'text-purple-700', label: 'Processing' },
      completed: { icon: FaCheck, bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
      rejected: { icon: FaTimes, bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
    };
    const config = configs[status] || configs.pending;
    const IconComponent = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
        <IconComponent className="text-sm" /> {config.label}
      </span>
    );
  };

  if (loading && landlordId) return <Loader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Withdrawal Requests</h1>
            <p className="mt-2 text-sm text-white/85">
              Request payouts for your earned commissions
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <FaBank className="text-3xl" />
          </div>
        </div>
      </div>

      {/* Landlord Selector */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <label className="block text-sm font-semibold text-gray-900">Select Landlord</label>
        <input
          type="number"
          placeholder="Enter landlord ID"
          value={landlordId}
          onChange={(e) => setLandlordId(e.target.value)}
          className="mt-2 w-full max-w-xs rounded-lg border border-gray-300 px-4 py-2"
        />
      </div>

      {landlordId && (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-600">Pending Requests</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  ₦{summary.pending_amount || 0}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-600">Approved</p>
                <p className="mt-2 text-2xl font-bold text-blue-600">
                  ₦{summary.approved_amount || 0}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-600">Processed</p>
                <p className="mt-2 text-2xl font-bold text-green-600">
                  ₦{summary.processed_amount || 0}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {summary.total_requests || 0}
                </p>
              </div>
            </div>
          )}

          {/* New Request Button */}
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary"
          >
            {showForm ? 'Cancel' : '+ New Withdrawal Request'}
          </button>

          {/* Form */}
          {showForm && (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Request Withdrawal</h2>
              <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-900">Amount (₦)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900">Withdrawal Method</label>
                  <select
                    value={formData.withdrawalMethod}
                    onChange={(e) => setFormData({ ...formData, withdrawalMethod: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="wallet">Wallet</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900">Reason (Optional)</label>
                  <textarea
                    value={formData.requestReason}
                    onChange={(e) => setFormData({ ...formData, requestReason: e.target.value })}
                    placeholder="Why are you requesting this withdrawal?"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                    rows="3"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary w-full"
                >
                  {submitting ? 'Processing...' : 'Submit Request'}
                </button>
              </form>
            </div>
          )}

          {/* Requests List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Your Withdrawal Requests</h2>
            {withdrawalRequests.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
                <p>No withdrawal requests yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {withdrawalRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-gray-900">
                            ₦{parseFloat(request.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </h3>
                          {getStatusBadge(request.status)}
                        </div>
                        <p className="mt-1 text-sm text-gray-600 capitalize">{request.withdrawal_method}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          Requested: {new Date(request.requested_date || request.created_at).toLocaleDateString()}
                        </p>
                        {request.reason_for_rejection && (
                          <p className="mt-2 text-sm text-red-600">
                            <strong>Rejection Reason:</strong> {request.reason_for_rejection}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AgentWithdrawalPage;
