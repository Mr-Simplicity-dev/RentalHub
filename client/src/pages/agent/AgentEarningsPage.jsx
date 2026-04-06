import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaDollarSign, FaCheckCircle, FaClock, FaHistory } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import Loader from '../../components/common/Loader';

const EarningCard = ({ icon: Icon, label, amount, color = 'indigo' }) => (
  <div className="rounded-2xl border bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">
          {typeof amount === 'number' ? `₦${amount.toLocaleString()}` : amount}
        </p>
      </div>
      <div className={`rounded-xl bg-${color}-100 p-4`}>
        <Icon className={`text-2xl text-${color}-600`} />
      </div>
    </div>
  </div>
);

const CommissionHistory = ({ commissions, loading }) => {
  const getStatusBadge = (status) => {
    const statusConfig = {
      earned: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Earned' },
      verified: { bg: 'bg-green-100', text: 'text-green-700', label: 'Verified' },
      reversed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Reversed' },
      pending_verification: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending Verification' },
    };

    const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };

    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getPaymentStatusBadge = (paymentStatus) => {
    const config = {
      paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Paid' },
      unpaid: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Unpaid' },
      partially_paid: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Partially Paid' },
    };

    const statusConfig = config[paymentStatus] || { bg: 'bg-gray-100', text: 'text-gray-700', label: paymentStatus };

    return (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
        {statusConfig.label}
      </span>
    );
  };

  if (loading) return <Loader />;

  if (commissions.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        <p>No commission history yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Date</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Type</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Amount</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Payment Status</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Description</th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((commission) => (
            <tr key={commission.id} className="border-b hover:bg-gray-50">
              <td className="px-6 py-4 text-sm text-gray-700">
                {new Date(commission.created_at).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{commission.transaction_type}</td>
              <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                <span className={commission.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                  {commission.amount > 0 ? '+' : ''}₦{commission.amount.toLocaleString()}
                </span>
              </td>
              <td className="px-6 py-4 text-sm">{getStatusBadge(commission.status)}</td>
              <td className="px-6 py-4 text-sm">{getPaymentStatusBadge(commission.payment_status)}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{commission.description || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AgentEarningsPage = () => {
  const [earnings, setEarnings] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commissionLoading, setCommissionLoading] = useState(false);

  useEffect(() => {
    loadEarningsData();
  }, []);

  const loadEarningsData = async () => {
    try {
      setLoading(true);
      
      // Get user profile to extract agent ID
      const profileRes = await api.get('/auth/me');
      if (profileRes.data?.success) {
        const agentId = profileRes.data.data.id;

        // Load earnings
        const earningsRes = await api.get(`/commissions/agents/${agentId}/earnings`);
        if (earningsRes.data?.success) {
          setEarnings(earningsRes.data.data[0] || {});
        }

        // Load commission history
        setCommissionLoading(true);
        const historyRes = await api.get(`/commissions/agents/${agentId}/history?limit=20`);
        if (historyRes.data?.success) {
          setCommissions(historyRes.data.data);
        }
        setCommissionLoading(false);
      }
    } catch (error) {
      console.error('Failed to load earnings:', error);
      toast.error('Failed to load earnings data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-green-600 to-emerald-700 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/80">Your Earnings</p>
            <h1 className="mt-2 text-3xl font-bold">Commission Dashboard</h1>
            <p className="mt-2 text-sm text-white/85">
              Track your commissions and earnings from delegated tasks.
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <FaDollarSign className="text-3xl" />
          </div>
        </div>
      </div>

      {/* Earnings Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <EarningCard
          icon={FaDollarSign}
          label="Total Earned"
          amount={earnings?.total_earned || 0}
          color="green"
        />
        <EarningCard
          icon={FaCheckCircle}
          label="Total Paid"
          amount={earnings?.total_paid || 0}
          color="emerald"
        />
        <EarningCard
          icon={FaClock}
          label="Pending Payout"
          amount={earnings?.total_pending || 0}
          color="amber"
        />
        <EarningCard
          icon={FaHistory}
          label="Transactions"
          amount={earnings?.transaction_count || 0}
          color="blue"
        />
      </div>

      {/* Commission History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Commission History</h2>
          <div className="flex gap-2">
            <Link to="/agent/withdrawals" className="btn btn-sm btn-primary">
              + Request Withdrawal
            </Link>
            <button
              onClick={loadEarningsData}
              className="btn btn-sm btn-outline"
            >
              Refresh
            </button>
          </div>
        </div>
        </div>
        <CommissionHistory commissions={commissions} loading={commissionLoading} />
      </div>

      {/* Help Section */}
      <div className="rounded-2xl border bg-blue-50 p-6 text-blue-900">
        <h3 className="font-semibold">Understanding Your Earnings</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li><strong>Total Earned:</strong> All commissions you've earned from completed tasks</li>
          <li><strong>Total Paid:</strong> Commissions that have been processed and paid to you</li>
          <li><strong>Pending Payout:</strong> Verified commissions waiting to be paid out</li>
          <li><strong>Last Payment:</strong> {earnings?.last_payment_date ? new Date(earnings.last_payment_date).toLocaleDateString() : 'No payments yet'}</li>
        </ul>
      </div>
    </div>
  );
};

export default AgentEarningsPage;
