import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBell,
  FaCalendarDay,
  FaCalendarWeek,
  FaChartLine,
  FaCheckCircle,
  FaClock,
  FaCog,
  FaDownload,
  FaExclamationTriangle,
  FaEye,
  FaFileInvoice,
  FaHistory,
  FaMoneyBill,
  FaRandom,
  FaRegStar,
  FaSyncAlt,
  FaTimesCircle,
  FaUserShield,
} from 'react-icons/fa';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';

// Utility functions
const badgeClass = (status) => {
  if (status === 'approved' || status === 'success' || status === 'active') return 'bg-green-100 text-green-700';
  if (status === 'rejected' || status === 'failed' || status === 'inactive') return 'bg-red-100 text-red-700';
  if (status === 'pending' || status === 'warning') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SuperSupportAdminDashboard = () => {
  const location = useLocation();
  // State management
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    overview: {},
    migrationQueue: [],
    auditLogs: [],
    supportTickets: [],
    systemAlerts: [],
    performanceMetrics: {},
    userActivity: [],
    financialOverview: {},
  });

  const [filters, setFilters] = useState({
    status: 'all',
    dateRange: 'today',
    state: '',
    userType: '',
    priority: '',
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const isModalOpen = showModal;

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      status: 'all',
      dateRange: 'today',
      state: '',
      userType: '',
      priority: '',
      search: '',
    });
  };

  const openModal = (type, item = null) => {
    setModalType(type);
    setSelectedItem(item);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalType('');
    setSelectedItem(null);
  };

  const queueStats = useMemo(() => {
    const queue = dashboardData?.migrationQueue || [];
    return {
      total: queue.length,
      pending: queue.filter((item) => item.status === 'pending').length,
      approved: queue.filter((item) => item.status === 'approved').length,
      rejected: queue.filter((item) => item.status === 'rejected').length,
      outgoingPending: queue.filter((item) => item.outgoing_status === 'pending').length,
      incomingPending: queue.filter((item) => item.incoming_status === 'pending').length,
    };
  }, [dashboardData?.migrationQueue]);

  const ticketStats = useMemo(() => {
    const tickets = dashboardData?.supportTickets || [];
    return {
      total: tickets.length,
      open: tickets.filter((ticket) => ticket.status === 'open').length,
      inProgress: tickets.filter((ticket) => ticket.status === 'in_progress').length,
      resolved: tickets.filter((ticket) => ticket.status === 'resolved').length,
      highPriority: tickets.filter((ticket) => ticket.priority === 'high' || ticket.priority === 'urgent').length,
    };
  }, [dashboardData?.supportTickets]);

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // Load multiple data sources in parallel
      const [queueRes, auditRes, ticketsRes, alertsRes, metricsRes] = await Promise.all([
        api.get(`/state-migrations/support/queue?stage=all&status=${filters.status}`),
        api.get(`/state-migrations/support/audit?status=${filters.status}`),
        api.get('/support/tickets?priority=high&status=open'),
        api.get('/system/alerts'),
        api.get('/dashboard/metrics'),
      ]);

      setDashboardData({
        overview: {
          totalRequests: queueRes.data?.data?.length || 0,
          pendingApprovals: queueRes.data?.data?.filter(item => item.status === 'pending').length || 0,
          resolvedTickets: ticketsRes.data?.data?.filter(ticket => ticket.status === 'resolved').length || 0,
          activeAlerts: alertsRes.data?.data?.length || 0,
          systemHealth: '98%',
          responseTime: '2.4s',
        },
        migrationQueue: queueRes.data?.data || [],
        auditLogs: auditRes.data?.data || [],
        supportTickets: ticketsRes.data?.data || [],
        systemAlerts: alertsRes.data?.data || [],
        performanceMetrics: metricsRes.data?.data || {},
        userActivity: [],
        financialOverview: {
          totalRevenue: 45000000,
          pendingPayments: 12000000,
          processedPayments: 33000000,
          avgTransaction: 150000,
        },
      });
    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    const allowedTabs = ['overview', 'queue', 'audit', 'tickets', 'alerts', 'reports', 'settings'];
    if (tab && allowedTabs.includes(tab)) {
      setActiveTab(tab);
      return;
    }
    setActiveTab('overview');
  }, [location.search]);

  // Quick action handlers
  const handleQuickAction = async (action, data) => {
    try {
      switch (action) {
        case 'approve':
          await api.patch(`/state-migrations/${data.id}/super-review`, {
            decision: 'approved',
            review_note: 'Approved via quick action',
          });
          toast.success('Request approved successfully');
          break;
        case 'reject':
          await api.patch(`/state-migrations/${data.id}/super-review`, {
            decision: 'rejected',
            review_note: 'Rejected via quick action',
          });
          toast.success('Request rejected successfully');
          break;
        case 'escalate':
          await api.post('/support/tickets/escalate', { ticketId: data.id });
          toast.success('Ticket escalated');
          break;
        case 'resolve':
          await api.patch(`/support/tickets/${data.id}/resolve`);
          toast.success('Ticket resolved');
          break;
        default:
          break;
      }
      loadDashboardData();
    } catch (error) {
      toast.error('Action failed');
    }
  };

  // Export functions
  const exportData = (type) => {
    let data = [];
    let filename = '';
    
    switch (type) {
      case 'queue':
        data = dashboardData.migrationQueue;
        filename = 'migration-queue-export.csv';
        break;
      case 'audit':
        data = dashboardData.auditLogs;
        filename = 'audit-logs-export.csv';
        break;
      case 'tickets':
        data = dashboardData.supportTickets;
        filename = 'support-tickets-export.csv';
        break;
      default:
        return;
    }

    if (!data.length) {
      toast.error('No data available for export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const commissionCheck = useMemo(() => {
    const totalRevenue = Number(dashboardData?.financialOverview?.totalRevenue || 0);
    const pending = Number(dashboardData?.financialOverview?.pendingPayments || 0);
    const ratio = totalRevenue > 0 ? (pending / totalRevenue) * 100 : 0;

    if (ratio >= 25) {
      return {
        label: 'Commission Check: Needs Attention',
        chipClass: 'bg-red-100 text-red-700',
        toneClass: 'border-red-200 bg-red-50',
      };
    }

    if (ratio >= 10) {
      return {
        label: 'Commission Check: Monitor',
        chipClass: 'bg-amber-100 text-amber-700',
        toneClass: 'border-amber-200 bg-amber-50',
      };
    }

    return {
      label: 'Commission Check: Healthy',
      chipClass: 'bg-green-100 text-green-700',
      toneClass: 'border-green-200 bg-green-50',
    };
  }, [dashboardData]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading support dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div className={`rounded-xl border p-4 ${commissionCheck.toneClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Commission Health</p>
            <p className="mt-1 text-sm text-slate-700">Quick indicator for pending vs processed commission-related payouts.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${commissionCheck.chipClass}`}>
              {commissionCheck.label}
            </span>
            <button
              onClick={() => setActiveTab('tickets')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Review Withdrawal Tickets
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg bg-white/70 p-3">
            <p className="text-xs text-slate-500">Pending Payout Exposure</p>
            <p className="mt-1 font-semibold text-slate-900">{formatCurrency(dashboardData?.financialOverview?.pendingPayments || 0)}</p>
          </div>
          <div className="rounded-lg bg-white/70 p-3">
            <p className="text-xs text-slate-500">Processed Payouts</p>
            <p className="mt-1 font-semibold text-slate-900">{formatCurrency(dashboardData?.financialOverview?.processedPayments || 0)}</p>
          </div>
          <div className="rounded-lg bg-white/70 p-3">
            <p className="text-xs text-slate-500">Total Revenue Baseline</p>
            <p className="mt-1 font-semibold text-slate-900">{formatCurrency(dashboardData?.financialOverview?.totalRevenue || 0)}</p>
          </div>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Super Support Dashboard</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Operational overview for queue approvals, ticket resolution, and system alert monitoring.
                </p>
              </div>
              <button
                onClick={loadDashboardData}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FaSyncAlt size={14} /> Refresh Overview
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Total Migration Requests</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardData?.overview?.totalRequests || 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-amber-50 p-4">
                <p className="text-xs font-medium text-amber-700">Pending Approvals</p>
                <p className="mt-2 text-2xl font-bold text-amber-800">{dashboardData?.overview?.pendingApprovals || 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-green-50 p-4">
                <p className="text-xs font-medium text-green-700">Resolved Tickets</p>
                <p className="mt-2 text-2xl font-bold text-green-800">{dashboardData?.overview?.resolvedTickets || 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-red-50 p-4">
                <p className="text-xs font-medium text-red-700">Active Alerts</p>
                <p className="mt-2 text-2xl font-bold text-red-800">{dashboardData?.overview?.activeAlerts || 0}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">System Health</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{dashboardData?.overview?.systemHealth || 'N/A'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">Avg Response Time</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{dashboardData?.overview?.responseTime || 'N/A'}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('queue')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open Migration Queue
              </button>
              <button
                onClick={() => setActiveTab('tickets')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open Support Tickets
              </button>
              <button
                onClick={() => setActiveTab('alerts')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open System Alerts
              </button>
            </div>
          </div>
        </div>
      )}

     {/* Migration Queue Tab */}
        {activeTab === 'queue' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                       <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Migration Queue</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportData('queue')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FaDownload size={14} /> Export CSV
                </button>
                <button
                  onClick={loadDashboardData}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FaSyncAlt size={14} /> Refresh
                </button>
              </div>
            </div>

            {/* Queue Filters */}
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending Only</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>

                <select
                  value={filters.state}
                  onChange={(e) => handleFilterChange('state', e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">All States</option>
                  <option value="Abia">Abia</option>
                  <option value="Adamawa">Adamawa</option>
                  <option value="Akwa Ibom">Akwa Ibom</option>
                  <option value="Anambra">Anambra</option>
                  <option value="Bauchi">Bauchi</option>
                  <option value="Bayelsa">Bayelsa</option>
                  <option value="Benue">Benue</option>
                  <option value="Borno">Borno</option>
                  <option value="Cross River">Cross River</option>
                  <option value="Delta">Delta</option>
                  <option value="Ebonyi">Ebonyi</option>
                  <option value="Edo">Edo</option>
                  <option value="Ekiti">Ekiti</option>
                  <option value="Enugu">Enugu</option>
                  <option value="FCT">FCT</option>
                  <option value="Gombe">Gombe</option>
                  <option value="Imo">Imo</option>
                  <option value="Jigawa">Jigawa</option>
                  <option value="Kaduna">Kaduna</option>
                  <option value="Kano">Kano</option>
                  <option value="Katsina">Katsina</option>
                  <option value="Kebbi">Kebbi</option>
                  <option value="Kogi">Kogi</option>
                  <option value="Kwara">Kwara</option>
                  <option value="Lagos">Lagos</option>
                  <option value="Nasarawa">Nasarawa</option>
                  <option value="Niger">Niger</option>
                  <option value="Ogun">Ogun</option>
                  <option value="Ondo">Ondo</option>
                  <option value="Osun">Osun</option>
                  <option value="Oyo">Oyo</option>
                  <option value="Plateau">Plateau</option>
                  <option value="Rivers">Rivers</option>
                  <option value="Sokoto">Sokoto</option>
                  <option value="Taraba">Taraba</option>
                  <option value="Yobe">Yobe</option>
                  <option value="Zamfara">Zamfara</option>
                  </select>

                <select
                  value={filters.userType}
                  onChange={(e) => handleFilterChange('userType', e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">All User Types</option>
                  <option value="tenant">Tenant</option>
                  <option value="landlord">Landlord</option>
                  <option value="agent">Agent</option>
                  <option value="lawyer">Lawyer</option>
                </select>

                <button
                  onClick={resetFilters}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            {/* Queue Statistics */}
            <div className="mb-6 grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Total</p>
                <p className="text-lg font-bold text-slate-900">{queueStats.total}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Pending</p>
                <p className="text-lg font-bold text-amber-600">{queueStats.pending}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Approved</p>
                <p className="text-lg font-bold text-green-600">{queueStats.approved}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Rejected</p>
                <p className="text-lg font-bold text-red-600">{queueStats.rejected}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Outgoing Pending</p>
                <p className="text-lg font-bold text-blue-600">{queueStats.outgoingPending}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Incoming Pending</p>
                <p className="text-lg font-bold text-purple-600">{queueStats.incomingPending}</p>
              </div>
            </div>

            {/* Queue Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Applicant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Route
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {dashboardData.migrationQueue.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-sm text-slate-500">
                        No migration requests found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    dashboardData.migrationQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.user_name}</p>
                            <p className="text-xs text-slate-500">{item.user_type}</p>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FaRandom className="text-slate-400" size={12} />
                            <span className="text-sm text-slate-900">
                              {item.from_state} → {item.to_state}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{item.reason}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass(item.status)}`}>
                              Final: {item.status}
                            </span>
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass(item.outgoing_status)}`}>
                              Out: {item.outgoing_status}
                            </span>
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass(item.incoming_status)}`}>
                              In: {item.incoming_status}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openModal('view-details', item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <FaEye size={12} /> View
                            </button>
                            {item.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleQuickAction('approve', item)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                                >
                                  <FaCheckCircle size={12} /> Approve
                                </button>
                                <button
                                  onClick={() => handleQuickAction('reject', item)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                                >
                                  <FaTimesCircle size={12} /> Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {dashboardData.migrationQueue.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Showing {dashboardData.migrationQueue.length} of {queueStats.total} requests
                </p>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Previous
                  </button>
                  <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit Trail Tab */}
        {activeTab === 'audit' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Audit Trail</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportData('audit')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FaDownload size={14} /> Export CSV
                </button>
                <button
                  onClick={loadDashboardData}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FaSyncAlt size={14} /> Refresh
                </button>
              </div>
            </div>

            {/* Audit Filters */}
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Search by applicant name..."
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                />
                <select
                  value={filters.dateRange}
                  onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="all">All Time</option>
                </select>
                <button
                  onClick={resetFilters}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Audit Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Applicant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Route
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Actor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {dashboardData.auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-sm text-slate-500">
                        No audit logs found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    dashboardData.auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FaClock className="text-slate-400" size={12} />
                            <span className="text-sm text-slate-900">{formatDate(log.created_at)}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="text-sm font-medium text-slate-900">{log.applicant_name}</p>
                          <p className="text-xs text-slate-500">ID: {log.applicant_id}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="text-sm text-slate-900">
                            {log.from_state} → {log.to_state}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 capitalize">
                              {log.action.replace(/_/g, ' ')}
                            </span>
                            {log.direction && (
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                {log.direction}
                              </span>
                            )}
                            {log.decision && (
                              <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass(log.decision)}`}>
                                {log.decision}
                              </span>
                            )}
                          </div>
                          {log.review_note && (
                            <p className="mt-1 text-xs text-slate-500">{log.review_note}</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs">
                            <FaUserShield className="text-slate-500" size={12} />
                            <span className="font-medium text-slate-700">{log.actor_name || 'System'}</span>
                            <span className="text-slate-500">({log.actor_role || 'system'})</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {dashboardData.auditLogs.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Showing {dashboardData.auditLogs.length} audit logs
                </p>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Previous
                  </button>
                  <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Support Tickets Tab */}
        {activeTab === 'tickets' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Support Tickets</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportData('tickets')}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FaDownload size={14} /> Export CSV
                </button>
                <button
                  onClick={loadDashboardData}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FaSyncAlt size={14} /> Refresh
                </button>
              </div>
            </div>

            {/* Ticket Statistics */}
            <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Total Tickets</p>
                <p className="text-lg font-bold text-slate-900">{ticketStats.total}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Open</p>
                <p className="text-lg font-bold text-amber-600">{ticketStats.open}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">In Progress</p>
                <p className="text-lg font-bold text-blue-600">{ticketStats.inProgress}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">Resolved</p>
                <p className="text-lg font-bold text-green-600">{ticketStats.resolved}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-medium text-slate-500">High Priority</p>
                <p className="text-lg font-bold text-red-600">{ticketStats.highPriority}</p>
              </div>
            </div>

            {/* Ticket Filters */}
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select
                  value={filters.priority}
                  onChange={(e) => handleFilterChange('priority', e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">All Priorities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>

                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>

                <input
                  type="text"
                  placeholder="Search by ticket ID or subject..."
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                />

                <button
                  onClick={resetFilters}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Tickets Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Ticket ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Subject
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {dashboardData.supportTickets.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-sm text-slate-500">
                        No support tickets found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    dashboardData.supportTickets.map((ticket) => (
                      <tr key={ticket.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <code className="text-sm font-medium text-slate-900">#{ticket.id}</code>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-slate-900">{ticket.subject}</p>
                          <p className="text-xs text-slate-500 truncate max-w-xs">{ticket.description}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            ticket.priority === 'high' || ticket.priority === 'urgent' 
                              ? 'bg-red-100 text-red-800'
                              : ticket.priority === 'medium'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            ticket.status === 'open'
                              ? 'bg-amber-100 text-amber-800'
                              : ticket.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {ticket.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                          {formatDate(ticket.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openModal('view-ticket', ticket)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <FaEye size={12} /> View
                            </button>
                            {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                              <>
                                <button
                                  onClick={() => handleQuickAction('resolve', ticket)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                                >
                                  <FaCheckCircle size={12} /> Resolve
                                </button>
                                {ticket.priority !== 'urgent' && (
                                  <button
                                    onClick={() => handleQuickAction('escalate', ticket)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                                  >
                                    <FaExclamationTriangle size={12} /> Escalate
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {dashboardData.supportTickets.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Showing {dashboardData.supportTickets.length} tickets
                </p>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Previous
                  </button>
                  <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">System Alerts</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openModal('configure-alerts')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FaCog size={14} /> Configure
                </button>
                <button
                  onClick={loadDashboardData}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FaSyncAlt size={14} /> Refresh
                </button>
              </div>
            </div>

            {/* Alerts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboardData.systemAlerts.length === 0 ? (
                <div className="col-span-full rounded-lg border border-dashed border-slate-300 p-8 text-center">
                  <FaBell className="mx-auto text-slate-400" size={32} />
                  <p className="mt-2 text-sm text-slate-500">No active system alerts</p>
                  <p className="text-xs text-slate-400">System is operating normally</p>
                </div>
              ) : (
                dashboardData.systemAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`rounded-lg border p-4 ${
                      alert.severity === 'critical'
                        ? 'border-red-300 bg-red-50'
                        : alert.severity === 'warning'
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-blue-300 bg-blue-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          {alert.severity === 'critical' ? (
                            <FaExclamationTriangle className="text-red-600" size={16} />
                          ) : alert.severity === 'warning' ? (
                            <FaExclamationTriangle className="text-amber-600" size={16} />
                          ) : (
                            <FaBell className="text-blue-600" size={16} />
                          )}
                          <span className={`text-sm font-medium ${
                            alert.severity === 'critical'
                              ? 'text-red-800'
                              : alert.severity === 'warning'
                              ? 'text-amber-800'
                              : 'text-blue-800'
                          }`}>
                            {alert.title}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{alert.description}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(alert.created_at)} • Source: {alert.source}
                        </p>
                      </div>
                      <button
                        onClick={() => openModal('alert-details', alert)}
                        className="text-slate-500 hover:text-slate-700"
                      >
                        <FaEye size={14} />
                      </button>
                    </div>
                    {alert.resolution && (
                      <div className="mt-3 rounded bg-white/50 p-2">
                        <p className="text-xs font-medium text-slate-700">Resolution:</p>
                        <p className="text-xs text-slate-600">{alert.resolution}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Reports & Analytics</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openModal('generate-report')}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  <FaFileInvoice size={14} /> Generate Report
                </button>
              </div>
            </div>

            {/* Report Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Monthly Performance</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">98.2%</p>
                  </div>
                  <FaChartLine className="text-green-600" size={20} />
                </div>
                <div className="mt-3">
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div className="h-full w-4/5 rounded-full bg-green-500"></div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Above target by 3.2%</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Response Time Avg</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">2.4s</p>
                  </div>
                  <FaClock className="text-blue-600" size={20} />
                </div>
                <div className="mt-3">
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div className="h-full w-3/4 rounded-full bg-blue-500"></div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">18% improvement</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">User Satisfaction</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">4.8/5.0</p>
                  </div>
                  <FaRegStar className="text-amber-600" size={20} />
                </div>
                <div className="mt-3">
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div className="h-full w-9/10 rounded-full bg-amber-500"></div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Based on 1,234 reviews</p>
                </div>
              </div>
            </div>

            {/* Report Types */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Quick Reports</h4>
                <div className="space-y-2">
                  {[
                    { name: 'Daily Migration Summary', icon: FaCalendarDay },
                    { name: 'Weekly Performance Report', icon: FaCalendarWeek },
                    { name: 'Monthly Audit Trail', icon: FaHistory },
                    { name: 'Quarterly Financial Review', icon: FaMoneyBill },
                  ].map((report, index) => (
                    <button
                      key={index}
                      onClick={() => openModal('view-report', report)}
                      className="flex w-full items-center justify-between rounded-lg                       border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2">
                        <report.icon className="text-slate-500" size={14} />
                        <span>{report.name}</span>
                      </div>
                      <FaDownload className="text-slate-400" size={12} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Custom Reports</h4>
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-900">Generate Custom Report</p>
                    <p className="text-xs text-slate-500 mt-1">Create reports with custom filters and date ranges</p>
                    <button
                      onClick={() => openModal('custom-report')}
                      className="mt-2 w-full rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      Configure Report
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-900">Schedule Reports</p>
                    <p className="text-xs text-slate-500 mt-1">Automate report generation and delivery</p>
                    <button
                      onClick={() => openModal('schedule-report')}
                      className="mt-2 w-full rounded-lg border border-primary-600 px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50"
                    >
                      Set Schedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">System Settings</h3>
              <button
                onClick={loadDashboardData}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FaSyncAlt size={14} /> Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* System Configuration */}
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">System Configuration</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Auto-approval threshold</span>
                      <span className="text-sm font-medium text-slate-900">85% confidence</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Audit retention period</span>
                      <span className="text-sm font-medium text-slate-900">90 days</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Response time SLA</span>
                      <span className="text-sm font-medium text-slate-900">4 hours</span>
                    </div>
                    <button
                      onClick={() => openModal('system-config')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit Configuration
                    </button>
                  </div>
                </div>

                {/* Notification Settings */}
                <div className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Notification Settings</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Email notifications</span>
                      <div className="relative inline-block w-10 h-6">
                        <input type="checkbox" className="sr-only" defaultChecked />
                        <div className="block w-10 h-6 rounded-full bg-green-500"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">SMS alerts</span>
                      <div className="relative inline-block w-10 h-6">
                        <input type="checkbox" className="sr-only" />
                        <div className="block w-10 h-6 rounded-full bg-slate-300"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Push notifications</span>
                      <div className="relative inline-block w-10 h-6">
                        <input type="checkbox" className="sr-only" defaultChecked />
                        <div className="block w-10 h-6 rounded-full bg-green-500"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform"></div>
                      </div>
                    </div>
                    <button
                      onClick={() => openModal('notification-settings')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Configure Notifications
                    </button>
                  </div>
                </div>
              </div>

              {/* User Management & Security */}
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">User Management</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Active admin users</span>
                      <span className="text-sm font-medium text-slate-900">24</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Last user activity</span>
                      <span className="text-sm font-medium text-slate-900">2 minutes ago</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Failed login attempts</span>
                      <span className="text-sm font-medium text-slate-900">3 (last 24h)</span>
                    </div>
                    <button
                      onClick={() => openModal('user-management')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Manage Users
                    </button>
                  </div>
                </div>

                {/* Security Settings */}
                <div className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Security Settings</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Two-factor authentication</span>
                      <div className="relative inline-block w-10 h-6">
                        <input type="checkbox" className="sr-only" defaultChecked />
                        <div className="block w-10 h-6 rounded-full bg-green-500"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Session timeout</span>
                      <span className="text-sm font-medium text-slate-900">30 minutes</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">IP whitelisting</span>
                      <div className="relative inline-block w-10 h-6">
                        <input type="checkbox" className="sr-only" />
                        <div className="block w-10 h-6 rounded-full bg-slate-300"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform"></div>
                      </div>
                    </div>
                    <button
                      onClick={() => openModal('security-settings')}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Security Configuration
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
        )}

        {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            {modalType === 'view-details' && selectedItem && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Migration Request Details</h3>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Applicant</p>
                    <p className="text-sm text-slate-900">{selectedItem.user_name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Route</p>
                    <p className="text-sm text-slate-900">{selectedItem.from_state} → {selectedItem.to_state}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Reason</p>
                    <p className="text-sm text-slate-900">{selectedItem.reason}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Status</p>
                    <div className="flex gap-2 mt-1">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass(selectedItem.status)}`}>
                        Final: {selectedItem.status}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass(selectedItem.outgoing_status)}`}>
                        Outgoing: {selectedItem.outgoing_status}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass(selectedItem.incoming_status)}`}>
                        Incoming: {selectedItem.incoming_status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={closeModal}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  {selectedItem.status === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          handleQuickAction('approve', selectedItem);
                          closeModal();
                        }}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          handleQuickAction('reject', selectedItem);
                          closeModal();
                        }}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {modalType === 'view-ticket' && selectedItem && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Support Ticket Details</h3>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Ticket ID</p>
                    <p className="text-sm font-medium text-slate-900">#{selectedItem.id}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Subject</p>
                    <p className="text-sm text-slate-900">{selectedItem.subject}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Description</p>
                    <p className="text-sm text-slate-900">{selectedItem.description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Priority</p>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        selectedItem.priority === 'high' || selectedItem.priority === 'urgent' 
                          ? 'bg-red-100 text-red-800'
                          : selectedItem.priority === 'medium'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {selectedItem.priority}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Status</p>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        selectedItem.status === 'open'
                          ? 'bg-amber-100 text-amber-800'
                          : selectedItem.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {selectedItem.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={closeModal}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  {selectedItem.status !== 'resolved' && selectedItem.status !== 'closed' && (
                    <>
                      <button
                        onClick={() => {
                          handleQuickAction('resolve', selectedItem);
                          closeModal();
                        }}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Mark as Resolved
                      </button>
                      {selectedItem.priority !== 'urgent' && (
                        <button
                          onClick={() => {
                            handleQuickAction('escalate', selectedItem);
                            closeModal();
                          }}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                        >
                          Escalate
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Add other modal types as needed */}

            <button
              onClick={closeModal}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <FaTimesCircle size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperSupportAdminDashboard;
