import React, { useEffect, useState } from 'react';
import { FaUniversity, FaCheck, FaClock, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import Loader from '../../components/common/Loader';

const AgentWithdrawalPage = () => {
  const { t } = useTranslation();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landlordId]);

  const loadData = async () => {
    if (!landlordId) return;

    try {
      setLoading(true);
      
      // Load withdrawal requests
      const requestsResponse = await api.get(`/withdrawals/agents/${agentId}/withdrawal-requests?landlordId=${landlordId}`);
      if (requestsResponse.data?.success) {
        setWithdrawalRequests(requestsResponse.data.data);
      }

      // Load summary
      const summaryResponse = await api.get(`/withdrawals/agents/${agentId}/withdrawal-summary?landlordId=${landlordId}`);
      if (summaryResponse.data?.success) {
        setSummary(summaryResponse.data.data);
      }
    } catch (error) {
      console.error('Failed to load withdrawal data:', error);
      toast.error(t('agent_withdrawal.failed_load'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error(t('agent_withdrawal.valid_amount'));
      return;
    }

    if (!landlordId) {
      toast.error(t('agent_withdrawal.select_landlord'));
      return;
    }

    try {
      setSubmitting(true);
      const response = await api.post(`/withdrawals/agents/${agentId}/withdrawal-requests`, {
        landlordId: parseInt(landlordId),
        amount: parseFloat(formData.amount),
        withdrawalMethod: formData.withdrawalMethod,
        bankAccountId: formData.bankAccountId ? parseInt(formData.bankAccountId) : null,
        requestReason: formData.requestReason,
      });

      if (response.data?.success) {
        toast.success(t('agent_withdrawal.submitted'));
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
      toast.error(error.response?.data?.message || t('agent_withdrawal.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const configs = {
      pending: { icon: FaClock, bg: 'bg-amber-100', text: 'text-amber-700', label: t('agent_withdrawal.status_pending') },
      approved: { icon: FaCheck, bg: 'bg-blue-100', text: 'text-blue-700', label: t('agent_withdrawal.status_approved') },
      processing: { icon: FaClock, bg: 'bg-purple-100', text: 'text-purple-700', label: t('agent_withdrawal.status_processing') },
      completed: { icon: FaCheck, bg: 'bg-green-100', text: 'text-green-700', label: t('agent_withdrawal.status_completed') },
      rejected: { icon: FaTimes, bg: 'bg-red-100', text: 'text-red-700', label: t('agent_withdrawal.status_rejected') },
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
            <h1 className="text-3xl font-bold">{t('agent_withdrawal.title')}</h1>
            <p className="mt-2 text-sm text-white/85">
              {t('agent_withdrawal.subtitle')}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <FaUniversity className="text-3xl" />
          </div>
        </div>
      </div>

      {/* Landlord Selector */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <label className="block text-sm font-semibold text-gray-900">{t('agent_withdrawal.select_landlord_label')}</label>
        <input
          type="number"
          placeholder={t('agent_withdrawal.landlord_id_placeholder')}
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
                <p className="text-sm text-gray-600">{t('agent_withdrawal.pending_requests')}</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  ₦{summary.pending_amount || 0}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-600">{t('agent_withdrawal.approved')}</p>
                <p className="mt-2 text-2xl font-bold text-blue-600">
                  ₦{summary.approved_amount || 0}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-600">{t('agent_withdrawal.processed')}</p>
                <p className="mt-2 text-2xl font-bold text-green-600">
                  ₦{summary.processed_amount || 0}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-600">{t('agent_withdrawal.total_requests')}</p>
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
            {showForm ? t('agent_withdrawal.cancel') : t('agent_withdrawal.new_request')}
          </button>

          {/* Form */}
          {showForm && (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('agent_withdrawal.request_withdrawal')}</h2>
              <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-900">{t('agent_withdrawal.amount_label')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder={t('agent_withdrawal.amount_placeholder')}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900">{t('agent_withdrawal.method_label')}</label>
                  <select
                    value={formData.withdrawalMethod}
                    onChange={(e) => setFormData({ ...formData, withdrawalMethod: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                  >
                    <option value="bank_transfer">{t('agent_withdrawal.method_bank')}</option>
                    <option value="wallet">{t('agent_withdrawal.method_wallet')}</option>
                    <option value="cheque">{t('agent_withdrawal.method_cheque')}</option>
                    <option value="other">{t('agent_withdrawal.method_other')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900">{t('agent_withdrawal.reason_label')}</label>
                  <textarea
                    value={formData.requestReason}
                    onChange={(e) => setFormData({ ...formData, requestReason: e.target.value })}
                    placeholder={t('agent_withdrawal.reason_placeholder')}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                    rows="3"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary w-full"
                >
                  {submitting ? t('agent_withdrawal.processing') : t('agent_withdrawal.submit_request')}
                </button>
              </form>
            </div>
          )}

          {/* Requests List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('agent_withdrawal.your_requests')}</h2>
            {withdrawalRequests.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
                <p>{t('agent_withdrawal.no_requests')}</p>
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
                          {t('agent_withdrawal.requested')}: {new Date(request.requested_date || request.created_at).toLocaleDateString()}
                        </p>
                        {request.reason_for_rejection && (
                          <p className="mt-2 text-sm text-red-600">
                            <strong>{t('agent_withdrawal.rejection_reason')}:</strong> {request.reason_for_rejection}
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
