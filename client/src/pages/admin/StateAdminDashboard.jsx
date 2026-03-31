
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  FaDollarSign,
  FaUsers,
  FaHome,
  FaChartLine,
  FaWallet,
  FaChartBar,
  FaChartPie,
  FaMapMarkerAlt,
  FaUserPlus,
  FaDownload
} from 'react-icons/fa';
import api from '../../services/api';
import AdminLayout from './AdminLayout';

const StateAdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [managedUsers, setManagedUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankDetails, setBankDetails] = useState({
    bank_name: '',
    account_number: '',
    account_name: ''
  });

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        const response = await api.get('/api/users/me');
        if (response.data.data.user_type !== 'state_admin') {
          navigate('/admin/dashboard');
          return;
        }
        await fetchDashboardData();
      } catch (error) {
        navigate('/login');
      }
    };

    initializeDashboard();
  }, [navigate]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const [dashboardRes, transactionsRes, usersRes, withdrawalsRes] = await Promise.all([
        api.get('/api/state-admin/dashboard'),
        api.get('/api/state-admin/transactions?limit=10'),
        api.get('/api/state-admin/managed-users?limit=10'),
        api.get('/api/state-admin/withdrawals')
      ]);

      setDashboardData(dashboardRes.data.data);
      setTransactions(transactionsRes.data.data?.recent_transactions || []);
      setManagedUsers(usersRes.data.data?.users || []);
      setWithdrawals(withdrawalsRes.data.data?.withdrawals || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!withdrawAmount || !bankDetails.bank_name || !bankDetails.account_number || !bankDetails.account_name) {
      alert('Please fill all withdrawal details');
      return;
    }

    try {
      await api.post('/api/state-admin/withdraw', {
        amount: parseFloat(withdrawAmount),
        ...bankDetails
      });
      alert('Withdrawal request submitted successfully');
      setWithdrawAmount('');
      setBankDetails({ bank_name: '', account_number: '', account_name: '' });
      fetchDashboardData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to submit withdrawal request');
    }
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
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  const adminInfo = dashboardData?.admin_info || {};
  const summary = dashboardData?.summary || {};

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">State Admin Dashboard</h1>
              <div className="flex items-center mt-2 text-gray-600">
                <FaMapMarkerAlt className="h-4 w-4 mr-2" />
                <span>{adminInfo.assigned_state}{adminInfo.assigned_city ? `, ${adminInfo.assigned_city}` : ''}</span>
                <span className="mx-2">•</span>
                <span>Commission Rate: {(adminInfo.admin_commission_rate * 100).toFixed(1)}%</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <FaMapMarkerAlt className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Wallet Balance</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(adminInfo.admin_wallet_balance || 0)}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <FaWallet className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                {formatCurrency(summary.weekly_withdrawable || 0)} withdrawable this week
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Commission</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(summary.total_pending_commission || 0)}
                </p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <FaDollarSign className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm text-green-600">
                <FaChartLine className="h-4 w-4 mr-1" />
                <span>Earned this month</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Managed Users</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summary.total_managed_users || 0}
                </p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <FaUsers className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm text-gray-600">
                <FaUserPlus className="h-4 w-4 mr-1" />
                <span>Users referred by you</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Properties</p>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboardData?.property_statistics?.reduce((sum, p) => sum + (p.total_properties || 0), 0) || 0}
                </p>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg">
                <FaHome className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                In your assigned location
              </p>
            </div>
          </div>
        </div>

        {/* Withdrawal Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Request Withdrawal</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (₦)
              </label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter amount"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                value={bankDetails.bank_name}
                onChange={(e) => setBankDetails({...bankDetails, bank_name: e.target.value})}
                className="w-full border rounded px-3 py-2"
                placeholder="e.g., GTBank"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Number
              </label>
              <input
                type="text"
                value={bankDetails.account_number}
                onChange={(e) => setBankDetails({...bankDetails, account_number: e.target.value})}
                className="w-full border rounded px-3 py-2"
                placeholder="10-digit account number"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Name
              </label>
              <input
                type="text"
                value={bankDetails.account_name}
                onChange={(e) => setBankDetails({...bankDetails, account_name: e.target.value})}
                className="w-full border rounded px-3 py-2"
                placeholder="Account holder name"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleWithdrawal}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Request Withdrawal
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Maximum weekly withdrawal: {formatCurrency(summary.weekly_withdrawable || 0)}
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {['overview', 'commissions', 'transactions', 'users', 'withdrawals'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Weekly Earnings Chart */}
                  <div className="bg-white p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Weekly Earnings</h3>
                      <FaChartBar className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dashboardData?.weekly_earnings || []}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip formatter={(value) => formatCurrency(value)} />
                          <Legend />
                          <Line type="monotone" dataKey="total_earnings" stroke="#3b82f6" name="Earnings" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Commission Breakdown */}
                  <div className="bg-white p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Commission Breakdown</h3>
                      <FaChartPie className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dashboardData?.commissions?.filter(c => c.status === 'pending') || []}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${entry.source}: ${formatCurrency(entry.total_amount)}`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="total_amount"
                          >
                            {dashboardData?.commissions?.filter(c => c.status === 'pending').map((entry, index) => (
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
                            Commission
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                              {formatCurrency(transaction.commission_amount || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'commissions' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Commission History</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                                        <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Source
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {dashboardData?.commissions?.map((commission) => (
                        <tr key={commission.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(commission.date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              {commission.source}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(commission.total_amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {(commission.avg_rate * 100).toFixed(1)}%
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              commission.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : commission.status === 'paid'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {commission.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'transactions' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">All Transactions</h3>
                  <div className="flex space-x-2">
                    <select className="border rounded px-3 py-1 text-sm">
                      <option>All Types</option>
                      <option>rent_payment</option>
                      <option>tenant_subscription</option>
                      <option>landlord_listing</option>
                    </select>
                    <input
                      type="date"
                      className="border rounded px-3 py-1 text-sm"
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
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactions.map((transaction) => (
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                            {formatCurrency(transaction.commission_amount || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              transaction.commission_status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : transaction.commission_status === 'paid'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {transaction.commission_status || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Managed Users</h3>
                  <div className="flex space-x-2">
                    <select className="border rounded px-3 py-1 text-sm">
                      <option>All Types</option>
                      <option>tenant</option>
                      <option>landlord</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Joined
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Transactions
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Spent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {managedUsers.map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {user.full_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              user.user_type === 'landlord'
                                ? 'bg-purple-100 text-purple-800'
                                : user.user_type === 'tenant'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.user_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.total_transactions || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(user.total_spent || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'withdrawals' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Withdrawal History</h3>
                  <button
                    onClick={() => {
                      // Export withdrawals to CSV
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
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default StateAdminDashboard;
