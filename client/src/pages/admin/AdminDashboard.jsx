import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { approvalService } from '../../services/approvalService';
import {
  FaUsers,
  FaHome,
  FaFileAlt,
  FaCheckCircle,
  FaEnvelope,
  FaUserShield,
  FaChartLine,
} from 'react-icons/fa';
import CommissionWithdrawalBanner from '../../components/admin/CommissionWithdrawalBanner';
import PropertyRequestWorkflowPanel from '../../components/admin/PropertyRequestWorkflowPanel';

const AdminDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const activeTab = new URLSearchParams(location.search).get('tab') || 'overview';
  const role = String(user?.user_type || '').trim().toLowerCase();
  const isLgaOperationsAdmin = ['admin', 'lga_admin'].includes(role);
  const isLgaSupportAdmin = role === 'lga_support_admin';
  const dashboardTitle = isLgaSupportAdmin
    ? 'LGA Support Dashboard'
    : isLgaOperationsAdmin
    ? 'LGA Admin Dashboard'
    : 'Admin Dashboard';

  const [stats, setStats] = useState({
    totalUsers: '-',
    totalProperties: '-',
    applications: '-',
    pendingVerifications: '-',
  });

  const [scope, setScope] = useState({ assignedState: null, assignedCity: null });
  const [escalationLoading, setEscalationLoading] = useState('');

  useEffect(() => {
    const loadStats = async () => {
      if (role === 'lga_support_admin') {
        setScope({
          assignedState: user?.assigned_state || null,
          assignedCity: user?.assigned_city || null,
        });
        return;
      }

      try {
        const { data } = await api.get('/admin/stats');

        if (data.success) {
          setStats({
            totalUsers: data.data.totalUsers,
            totalProperties: data.data.totalProperties,
            applications: data.data.applications,
            pendingVerifications: data.data.pendingVerifications,
          });
          if (data.data.scope) {
            setScope(data.data.scope);
          }
        }
      } catch (err) {
        console.error('Failed to load admin stats', err);
      }
    };

    loadStats();
  }, [role, user?.assigned_city, user?.assigned_state]);

  const requestEscalation = async (actionType, summary) => {
    try {
      setEscalationLoading(actionType);
      await approvalService.requestSensitiveActionEscalation({
        actionType,
        summary,
        payload: {
          admin_id: user?.id,
          admin_name: user?.full_name,
          admin_email: user?.email,
          admin_role: user?.user_type,
          assigned_state: scope.assignedState,
          assigned_city: scope.assignedCity,
        },
      });
      toast.success('Escalation request sent to Super Admin');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to send escalation');
    } finally {
      setEscalationLoading('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-admin-50 via-white to-admin-100/40 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {dashboardTitle}
          </h1>
          <p className="mt-1 text-gray-600">
            Welcome, {user?.full_name || 'Administrator'}
          </p>
        </div>

        {Number(stats.pendingVerifications || 0) > 0 && (
          <div className="mb-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4">

              {/* ... existing pending verifications alert ... */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  {stats.pendingVerifications} verification request{Number(stats.pendingVerifications) === 1 ? '' : 's'} need attention
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Process pending identity checks quickly to reduce refund and dispute delays.
                </p>
              </div>
              <a
                href="/admin/verifications"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Review Verifications
              </a>
            </div>
          </div>
        )}

        {['admin', 'lga_admin', 'lga_support_admin'].includes(role) && (scope.assignedState || scope.assignedCity) && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="text-sm font-semibold text-blue-900">Your Jurisdiction</p>
            <p className="mt-1 text-sm font-medium text-blue-800">
              {scope.assignedState}
              {scope.assignedCity ? ` - ${scope.assignedCity} Local Government` : ''}
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-xs text-blue-700">
              You are authorized to work only within this local government area.
            </p>
          </div>
        )}

        {isLgaOperationsAdmin && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Sensitive Actions Require Super Admin Review
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Use these escalation actions to keep approvals auditable and coordinated.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => requestEscalation('high_value_refund', 'Request review for high-value refund approval above local threshold')}
                disabled={escalationLoading !== ''}
                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {escalationLoading === 'high_value_refund' ? 'Sending...' : 'Escalate High-Value Refund'}
              </button>
              <button
                type="button"
                onClick={() => requestEscalation('property_delist', 'Request review before delisting a high-impact property')}
                disabled={escalationLoading !== ''}
                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {escalationLoading === 'property_delist' ? 'Sending...' : 'Escalate Property Delist'}
              </button>
              <button
                type="button"
                onClick={() => requestEscalation('admin_account_change', 'Request review for admin account suspension/reactivation decision')}
                disabled={escalationLoading !== ''}
                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {escalationLoading === 'admin_account_change' ? 'Sending...' : 'Escalate Admin Account Change'}
              </button>
            </div>
          </div>
        )}

        {/* Commission Withdrawal Banner */}
        <div className="mb-6">
          <CommissionWithdrawalBanner />
        </div>

        {activeTab === 'property_requests' && (
          <PropertyRequestWorkflowPanel
            mode="state"
            title="LGA Tenant Property Requests"
          />
        )}

        {activeTab !== 'property_requests' && (
          <>
        <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            icon={<FaUsers className="text-blue-500" />}
          />
          <StatCard
            title="Total Properties"
            value={stats.totalProperties}
            icon={<FaHome className="text-green-500" />}
          />
          <StatCard
            title="Applications"
            value={stats.applications}
            icon={<FaFileAlt className="text-purple-500" />}
          />
          <StatCard
            title="Pending Verifications"
            value={stats.pendingVerifications}
            icon={<FaCheckCircle className="text-yellow-500" />}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-7">
          <QuickCard title="Manage Users" href="/admin/users" />
          <QuickCard
            title="Verify NIN/Passport"
            href="/admin/verifications"
            badge={Number(stats.pendingVerifications || 0) > 0 ? `${stats.pendingVerifications} pending` : ''}
          />
          <QuickCard title="View Properties" href="/admin/properties" />
          <QuickCard title="View Applications" href="/admin/applications" />
          <QuickCard
            title="Lawyer Invites"
            href="/admin/lawyer-invites"
            icon={<FaEnvelope className="text-sky-500" />}
          />
          <QuickCard
            title="Agent Management"
            href="/admin/agents"
            icon={<FaUserShield className="text-indigo-500" />}
          />
          <QuickCard
            title="Compliance"
            href="/admin/compliance"
            icon={<FaChartLine className="text-emerald-500" />}
          />
        </div>
          </>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon }) => (
  <div className="card">
    <div className="flex items-center justify-between">
      <div>
        <p className="mb-1 text-sm text-gray-600">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <div className="text-4xl">{icon}</div>
    </div>
  </div>
);

const QuickCard = ({ title, href, icon = null, badge = '' }) => (
  <a href={href} className="card block text-center">
    {badge && (
      <div className="mb-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
        {badge}
      </div>
    )}
    {icon && <div className="mb-2 flex justify-center text-2xl">{icon}</div>}
    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    <p className="mt-1 text-sm text-gray-600">Open</p>
  </a>
);

export default AdminDashboard;
