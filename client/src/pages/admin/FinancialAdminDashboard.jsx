import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  FaDollarSign,
  FaUsers,
  FaCreditCard,
  FaChartLine,
  FaExclamationTriangle,
  FaShieldAlt,
  FaChartBar,
  FaChartPie,
  FaDownload
} from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';
import Button from '../../components/common/Button';
import InputDialog from '../../components/common/InputDialog';
import AdminWithdrawalModal from '../../components/admin/AdminWithdrawalModal';
import useRetryableAction from '../../hooks/useRetryableAction';

const FinancialAdminDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [frozenFunds, setFrozenFunds] = useState([]);
  const [stateAdmins, setStateAdmins] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [profile, setProfile] = useState(null);
  const [withdrawableSnapshot, setWithdrawableSnapshot] = useState({
    withdrawable_amount: 0,
    total_earned: 0,
  });
  const [activeTab, setActiveTab] = useState(() => {
    return new URLSearchParams(location.search).get('tab') || 'overview';
  });
  const [showFreezeDialog, setShowFreezeDialog] = useState(false);
  const [freezeInputs, setFreezeInputs] = useState({
    user_id: '',
    amount: '',
    reason: '',
  });
  const [showPersonalWithdrawDialog, setShowPersonalWithdrawDialog] = useState(false);

  const freezeFundsAction = useRetryableAction(
    async (inputs) => {


      await api.post('/financial-admin/funds/freeze', {
        user_id: Number(inputs.user_id),
        amount: parseFloat(inputs.amount),
        reason: String(inputs.reason || '').trim(),
      });
    },
    {
      maxRetries: 2,
      context: 'financial_admin',
      onSuccess: async () => {
        toast.success('Funds frozen successfully');
        setShowFreezeDialog(false);
        setFreezeInputs({ user_id: '', amount: '', reason: '' });
        await fetchDashboardData();
      },
      onError: (error) => {
        toast.error(error?.message || 'Failed to freeze funds');
      },
    }
  );

  const personalWithdrawAction = useRetryableAction(
    async (inputs) => {
      await api.post('/financial-admin/withdraw/request', {
        amount: parseFloat(inputs.amount),
        bank_name: String(inputs.bank_name || '').trim(),
        bank_code: String(inputs.bank_code || '').trim(),
        account_number: String(inputs.account_number || '').trim(),
        account_name: String(inputs.account_name || '').trim(),
      });
    },
    {
      maxRetries: 2,
      context: 'financial_admin',
      onSuccess: async () => {
        toast.success('Personal commission withdrawal request submitted');
        setShowPersonalWithdrawDialog(false);
        if (profile?.user_type === 'lga_financial_admin') {
          await fetchLgaFinanceData();
        } else {
          await fetchDashboardData();
        }
      },
      onError: (error) => {
        toast.error(error?.message || 'Failed to submit withdrawal request');
      },
    }
  );

  useEffect(() => {
    const initializeDashboard = async () => {
      try {

        const response = await api.get('/auth/me');
        const me = response.data.data;
        setProfile(me);

        if (!['financial_admin', 'lga_financial_admin'].includes(me.user_type)) {
          navigate('/admin');
          return;
        }

        if (me.user_type === 'lga_financial_admin') {
          await fetchLgaFinanceData();
        } else {
          await fetchDashboardData();
        }
      } catch (error) {
        navigate('/login');
      }
    };

        initializeDashboard();
  }, [navigate]);

  // Sync internal activeTab with URL search params for sidebar highlighting
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabFromUrl = params.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // When activeTab changes, update URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentTab = params.get('tab') || 'overview';
    if (activeTab !== currentTab) {
      params.set('tab', activeTab);
      navigate({ search: params.toString() }, { replace: true });
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const [statsRes, transactionsRes, frozenRes, adminsRes, withdrawalsRes] = await Promise.all([
                api.get(`/financial-admin/stats/realtime`),
        api.get(`/financial-admin/transactions?limit=10&page=1`),
        api.get('/financial-admin/funds/frozen'),
        api.get('/financial-admin/performance/state-admins'),
        api.get('/financial-admin/withdrawals/history')
      ]);

      setStats(statsRes.data.data);
      setTransactions(transactionsRes.data.data);
      setFrozenFunds(frozenRes.data.data);
      setStateAdmins(adminsRes.data.data);
      setWithdrawals(withdrawalsRes.data.data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLgaFinanceData = async () => {
    try {
      const [withdrawableRes, withdrawalsRes] = await Promise.all([
                api.get('/financial-admin/commissions/withdrawable'),
        api.get('/financial-admin/withdrawals/history'),
      ]);

      setWithdrawableSnapshot(withdrawableRes.data?.data || {
        withdrawable_amount: 0,
        total_earned: 0,
      });
      setWithdrawals(withdrawalsRes.data?.data || []);
    } catch (error) {
      console.error('Error fetching LGA finance dashboard data:', error);
      toast.error(error.response?.data?.message || 'Failed to load LGA finance dashboard');
    } finally {
      setLoading(false);
    }
  };

  const openFreezeDialog = () => {
    setFreezeInputs({ user_id: '', amount: '', reason: '' });
    setShowFreezeDialog(true);
  };

  const handleFreezeFunds = async (inputs) => {
    const userId = Number(inputs.user_id);
    const amount = Number(inputs.amount);
    const reason = String(inputs.reason || '').trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      toast.error('Please enter a valid user ID');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!reason) {
      toast.error('Please provide a reason');
      return;
    }

    setFreezeInputs({
      user_id: String(userId),
      amount: String(amount),
      reason,
    });

    await freezeFundsAction.execute({
      user_id: userId,
      amount,
      reason,
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (profile?.user_type === 'lga_financial_admin') {
    const withdrawalTotal = withdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pendingCount = withdrawals.filter((item) => String(item.status || '').toLowerCase() === 'pending').length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100/40 p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">LGA Financial Admin Dashboard</h1>
                <p className="mt-1 text-sm text-gray-600">
                  Monitor your assigned LGA finance activity and manage your commission withdrawals.
                </p>
                <div className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {profile.assigned_state || 'Unassigned State'}{profile.assigned_city ? `, ${profile.assigned_city} LGA` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPersonalWithdrawDialog(true)}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Request Withdrawal
              </button>
            </div>
          </div>

          <div id="lga-finance-overview" className="fin-admin-payments-section grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-white p-5 shadow">
              <p className="text-sm font-medium text-gray-600">Withdrawable Balance</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {formatCurrency(withdrawableSnapshot.withdrawable_amount || 0)}
              </p>
            </div>
            <div className="rounded-lg bg-white p-5 shadow">
              <p className="text-sm font-medium text-gray-600">Total Earned</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {formatCurrency(withdrawableSnapshot.total_earned || 0)}
              </p>
            </div>
            <div className="rounded-lg bg-white p-5 shadow">
              <p className="text-sm font-medium text-gray-600">Withdrawal Requests</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{withdrawals.length}</p>
              <p className="mt-1 text-xs text-amber-700">{pendingCount} pending</p>
            </div>
          </div>

          <div id="lga-finance-withdrawals" className="fin-admin-reports-section rounded-lg bg-white p-6 shadow">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Withdrawal History</h2>
                <p className="text-sm text-gray-500">
                  Total requested: {formatCurrency(withdrawalTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={fetchLgaFinanceData}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Bank</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {withdrawals.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                        No withdrawal requests yet.
                      </td>
                    </tr>
                  ) : (
                    withdrawals.map((withdrawal) => (
                      <tr key={withdrawal.id}>
                        <td className="px-4 py-3 text-gray-600">{formatDate(withdrawal.requested_at || withdrawal.created_at)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(withdrawal.amount)}</td>
                        <td className="px-4 py-3 text-gray-600">{withdrawal.bank_name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold capitalize text-gray-700">
                            {withdrawal.status || 'pending'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <AdminWithdrawalModal
            isOpen={showPersonalWithdrawDialog}
            onClose={() => setShowPersonalWithdrawDialog(false)}
            onSubmit={async (formData) => {
              await personalWithdrawAction.execute(formData);
            }}
            isLoading={personalWithdrawAction.isLoading}
            confirmLabel="Submit Withdrawal Request"
          />
        </div>
      </div>
    );
  }

    return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100/40 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Financial Admin Dashboard</h1>
              <p className="text-gray-600">Monitor all financial transactions and manage funds</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('transactions')}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  View Transactions
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('frozen-funds')}
                  className="fin-admin-refunds-section rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  View Frozen Funds
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('withdrawals')}
                  className="fin-admin-settlements-section rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  View Withdrawal History
                </button>
                <button
                  type="button"
                  onClick={openFreezeDialog}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  Freeze Funds
                </button>
                <button
                  type="button"
                  onClick={() => setShowPersonalWithdrawDialog(true)}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Request Personal Withdrawal
                </button>
              </div>
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-emerald-800">
                    Withdrawal Access: Enabled. You can request your personal commission withdrawal from this dashboard.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('withdrawals')}
                    className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Open Withdrawal History
                  </button>
                </div>
              </div>
            </div>
            <div className="hidden shrink-0 sm:flex sm:items-center">
              <div className="bg-blue-50 p-3 rounded-lg">
                <FaShieldAlt className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="fin-admin-payments-section grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Volume (7 Days)</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(stats?.week?.week_amount || 0)}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <FaDollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm text-green-600">
                <FaChartLine className="h-4 w-4 mr-1" />
                <span>+12.5% from last week</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Today's Transactions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.today?.reduce((sum, t) => sum + (t.today_count || 0), 0)}
                </p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <FaCreditCard className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {formatCurrency(stats?.today?.reduce((sum, t) => sum + (t.today_amount || 0), 0))} total
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">State Admins</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stateAdmins?.length || 0}
                </p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <FaUsers className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {formatCurrency(stateAdmins?.reduce((sum, a) => sum + (a.total_pending || 0), 0))} pending commissions
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Frozen Funds</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(frozenFunds?.reduce((sum, f) => sum + (f.amount || 0), 0))}
                </p>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <FaExclamationTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {frozenFunds?.length || 0} active freezes
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="fin-admin-reports-section bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {['overview', 'transactions', 'state-admins', 'frozen-funds', 'withdrawals', 'audit-trail'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Transaction Volume Chart */}
                  <div className="bg-white p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Transaction Volume (30 Days)</h3>
                      <FaChartBar className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats?.month || []}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip formatter={(value) => formatCurrency(value)} />
                          <Legend />
                          <Line type="monotone" dataKey="month_amount" stroke="#3b82f6" name="Amount" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Top States Chart */}
                  <div className="bg-white p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Top Performing States</h3>
                      <FaChartPie className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats?.top_states || []}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${entry.state}: ${formatCurrency(entry.total_amount)}`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="total_amount"
                          >
                            {stats?.top_states?.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Recent Transactions */}
                <div className="bg-white p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Recent Transactions</h3>
                    <button
                      onClick={() => setActiveTab('transactions')}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      View All
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            User
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            State
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {transactions.slice(0, 5).map((transaction) => (
                          <tr key={transaction.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(transaction.created_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {transaction.user_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {transaction.user_email}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                {transaction.payment_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {formatCurrency(transaction.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {transaction.property_state || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                transaction.payment_status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : transaction.payment_status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {transaction.payment_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'transactions' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">All Transactions</h3>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select className="rounded border px-3 py-1 text-sm">
                      <option>All Types</option>
                      <option>rent_payment</option>
                      <option>tenant_subscription</option>
                      <option>landlord_subscription</option>
                      <option>landlord_listing</option>
                    </select>
                    <input
                      type="date"
                      className="rounded border px-3 py-1 text-sm"
                      placeholder="Start Date"
                    />
                    <input
                      type="date"
                      className="rounded border px-3 py-1 text-sm"
                      placeholder="End Date"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Commission
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Wallet Credit
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {transaction.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(transaction.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {transaction.user_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {transaction.user_email}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              {transaction.payment_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(transaction.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(transaction.commission_amount || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="font-semibold">
                              {formatCurrency(transaction.wallet_credit_amount || 0)}
                            </div>
                            {(Number(transaction.wallet_pending_amount || 0) > 0 ||
                              Number(transaction.wallet_cleared_amount || 0) > 0) && (
                              <div className="mt-1 text-xs text-gray-500">
                                Pending: {formatCurrency(transaction.wallet_pending_amount || 0)}
                                {' '}| Cleared: {formatCurrency(transaction.wallet_cleared_amount || 0)}
                              </div>
                            )}
                            {transaction.wallet_owner_name && (
                              <div className="mt-1 text-xs text-gray-500">
                                To: {transaction.wallet_owner_name}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              transaction.payment_status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : transaction.payment_status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {transaction.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'state-admins' && (
              <div className="fin-admin-settlements-section space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">State Admin Performance</h3>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select className="rounded border px-3 py-1 text-sm">
                      <option>All States</option>
                      <option>Lagos</option>
                      <option>Abuja</option>
                      <option>Rivers</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Admin
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Location
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Commission Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Pending
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Paid
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Managed Users
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {stateAdmins.map((admin) => (
                        <tr key={admin.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {admin.full_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {admin.email}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {admin.assigned_state}
                            {admin.assigned_city && `, ${admin.assigned_city}`}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {(admin.admin_commission_rate * 100).toFixed(1)}%
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(admin.pending_commission || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(admin.paid_commission || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {admin.managed_users || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              admin.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {admin.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'frozen-funds' && (
              <div className="fin-admin-refunds-section space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">Frozen Funds</h3>
                  <Button onClick={openFreezeDialog} variant="danger" size="small">
                    Freeze Funds
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reason
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Frozen By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {frozenFunds.map((fund) => (
                        <tr key={fund.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {fund.user_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {fund.user_email}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(fund.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {fund.reason}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {fund.frozen_by_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(fund.frozen_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              fund.status === 'frozen'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {fund.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'withdrawals' && (
              <div className="fin-admin-settlements-section space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">Withdrawal History</h3>
                  <button
                    onClick={() => {
                      const csvContent = "data:text/csv;charset=utf-8," 
                        + "Date,Amount,Bank,Account Number,Status\n"
                        + withdrawals.map(w => 
                            `${formatDate(w.requested_at)},${w.amount},${w.bank_name},${w.account_number},${w.status}`
                          ).join("\n");
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", "withdrawals.csv");
                      document.body.appendChild(link);
                      link.click();
                    }}
                    className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                  >
                    <FaDownload className="h-4 w-4 mr-1" />
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Bank
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Account Number
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Processed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {withdrawals.map((withdrawal) => (
                        <tr key={withdrawal.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(withdrawal.requested_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(withdrawal.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {withdrawal.bank_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {withdrawal.account_number}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              withdrawal.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : withdrawal.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : withdrawal.status === 'failed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {withdrawal.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {withdrawal.processed_at ? formatDate(withdrawal.processed_at) : 'Pending'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'audit-trail' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">Transaction Audit Trail</h3>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select className="rounded border px-3 py-1 text-sm">
                      <option>All Actions</option>
                      <option>funds_frozen</option>
                      <option>commission_earned</option>
                      <option>withdrawal_requested</option>
                    </select>
                    <input
                      type="date"
                      className="rounded border px-3 py-1 text-sm"
                      placeholder="Start Date"
                    />
                    <input
                      type="date"
                      className="border rounded px-3 py-1 text-sm"
                      placeholder="End Date"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Admin
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Audit trail data would go here */}
                      <tr>
                        <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                          Audit trail data will appear here when available
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <InputDialog
          isOpen={showFreezeDialog}
          onConfirm={handleFreezeFunds}
          onCancel={() => setShowFreezeDialog(false)}
          title="Freeze User Funds"
          message="Enter the user ID, amount, and reason for this freeze action."
          type="danger"
          confirmText="Freeze Funds"
          cancelText="Cancel"
          isLoading={freezeFundsAction.isLoading}
          initialValues={freezeInputs}
          inputs={[
            {
              name: 'user_id',
              label: 'User ID',
              type: 'number',
              placeholder: 'Enter user ID',
              required: true,
              validate: (value) => {
                const num = Number(value);
                return Number.isInteger(num) && num > 0
                  ? true
                  : 'Please enter a valid user ID';
              },
            },
            {
              name: 'amount',
              label: 'Amount (NGN)',
              type: 'number',
              placeholder: 'Enter amount to freeze',
              required: true,
              validate: (value) => {
                const num = Number(value);
                return Number.isFinite(num) && num > 0
                  ? true
                  : 'Please enter a valid amount';
              },
            },
            {
              name: 'reason',
              label: 'Reason',
              type: 'textarea',
              placeholder: 'Enter reason for freezing these funds',
              rows: 3,
              required: true,
              validate: (value) => String(value || '').trim().length > 0
                ? true
                : 'Reason is required',
            },
          ]}
        />

        <AdminWithdrawalModal
          isOpen={showPersonalWithdrawDialog}
          onClose={() => setShowPersonalWithdrawDialog(false)}
          onSubmit={async (formData) => {
            await personalWithdrawAction.execute(formData);
          }}
          isLoading={personalWithdrawAction.isLoading}
          confirmLabel="Submit Withdrawal Request"
                />
        </div>
      </div>
    </div>
  );
};

export default FinancialAdminDashboard;
