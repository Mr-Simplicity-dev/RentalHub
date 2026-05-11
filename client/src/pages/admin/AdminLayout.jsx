import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import RoleBadge from '../../components/common/RoleBadge';
import {
  FaTachometerAlt,
  FaUsers,
  FaHome,
  FaFileAlt,
  FaCheckCircle,
  FaEnvelope,
  FaShieldAlt,
  FaLock,
  FaSignOutAlt,
  FaMoneyBill,
  FaMapMarkerAlt,
  FaLifeRing,
  FaGlobe,
  FaTruck,
  FaSprayCan,
  FaSearch,
  FaChartLine,
  FaExclamationTriangle,
  FaCog,
  FaFlag,
  FaBroadcastTower,
  FaGavel,
  FaChartBar,
  FaClipboardList,
  FaWallet,
  FaHeadset,
  FaExchangeAlt,
  FaBan,
  FaUserShield,
} from 'react-icons/fa';

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = (user?.user_type || '').trim().toLowerCase();

  // TEMP default values (until backend supplies them)
  const riskScore = user?.riskScore || 0;
  const ledgerIntegrity = user?.ledgerIntegrity ?? true;
  const isSuperSupportAdmin = role === 'super_support_admin';
  const isStateAdmin = role === 'state_admin';
  const isCoreAdmin = role === 'admin';
  const isSuperAdmin = role === 'super_admin';
  const isFinancialAdmin = role === 'financial_admin';
  const isSuperFinancialAdmin = role === 'super_financial_admin';
  const isStateFinancialAdmin = role === 'state_financial_admin';
  const isStateSupportAdmin = role === 'state_support_admin';
  const isFumigationAdmin = role === 'fumigation_admin';
  const isTransportationAdmin = role === 'transportation_admin';
  const isStateScopedAdmin = ['state_admin', 'state_financial_admin', 'state_support_admin', 'state_lawyer'].includes(role);
  const assignedStateLabel = user?.assigned_state || 'Not Assigned';
  const [liveBadges, setLiveBadges] = useState({
    pendingVerifications: 0,
    pendingAdminApprovals: 0,
    pendingSupportQueue: 0,
    pendingWithdrawals: 0,
  });

  useEffect(() => {
    if (!user?.id) return undefined;

    let isCancelled = false;

    const loadBadges = async () => {
      const next = {
        pendingVerifications: 0,
        pendingAdminApprovals: 0,
        pendingSupportQueue: 0,
        pendingWithdrawals: 0,
      };

      if (isCoreAdmin) {
        try {
          const statsRes = await api.get('/admin/stats');
          next.pendingVerifications = Number(statsRes.data?.data?.pendingVerifications || 0);
        } catch {
          // Ignore badge load failures.
        }
      }

      if (isSuperAdmin) {
        try {
          const pendingAdminsRes = await api.get('/super/pending-admins');
          next.pendingAdminApprovals = Array.isArray(pendingAdminsRes.data?.data)
            ? pendingAdminsRes.data.data.length
            : 0;
        } catch {
          // Ignore badge load failures.
        }
      }

      if (isStateSupportAdmin) {
        try {
          const queueRes = await api.get('/state-migrations/support/queue?stage=incoming&status=pending');
          next.pendingSupportQueue = Array.isArray(queueRes.data?.data)
            ? queueRes.data.data.length
            : 0;
        } catch {
          // Ignore badge load failures.
        }
      }

      if (isStateAdmin || isStateFinancialAdmin) {
        try {
          const withdrawalsRes = await api.get('/state-admin/withdrawals');
          const rows = withdrawalsRes.data?.data?.withdrawals || [];
          next.pendingWithdrawals = rows.filter((row) => String(row.status || '').toLowerCase() === 'pending').length;
        } catch {
          // Ignore badge load failures.
        }
      }

      if (!isCancelled) {
        setLiveBadges(next);
      }
    };

    loadBadges();
    const intervalId = setInterval(loadBadges, 30000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [
    isCoreAdmin,
    isSuperAdmin,
    isStateSupportAdmin,
    isStateAdmin,
    isStateFinancialAdmin,
    user?.id,
  ]);

  const badgePill = (count, tone = 'red') => {
    if (!count || count < 1) return null;
    const toneClass = tone === 'amber'
      ? 'bg-amber-500 text-white'
      : tone === 'blue'
      ? 'bg-blue-500 text-white'
      : 'bg-red-500 text-white';

    return (
      <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}>
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  const roleTheme = isStateAdmin || isStateFinancialAdmin
    ? {
        sidebarBg: 'from-state-700 to-state-600',
        activeNav: 'bg-state-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-state-50',
        mainBg: 'bg-gradient-to-br from-state-50 via-white to-state-100/40',
        panelTitle: 'State Admin Console',
      }
    : isStateSupportAdmin
    ? {
        sidebarBg: 'from-amber-700 to-amber-600',
        activeNav: 'bg-amber-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-amber-50',
        mainBg: 'bg-gradient-to-br from-amber-50 via-white to-amber-100/40',
        panelTitle: 'State Support Console',
      }
    : isFumigationAdmin
    ? {
        sidebarBg: 'from-rose-700 to-rose-600',
        activeNav: 'bg-rose-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-rose-50',
        mainBg: 'bg-gradient-to-br from-rose-50 via-white to-rose-100/40',
        panelTitle: 'Fumigation Admin',
      }
    : isTransportationAdmin
    ? {
        sidebarBg: 'from-sky-700 to-sky-600',
        activeNav: 'bg-sky-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-sky-50',
        mainBg: 'bg-gradient-to-br from-sky-50 via-white to-sky-100/40',
        panelTitle: 'Transportation Admin',
      }
    : {
        sidebarBg: 'from-admin-700 to-admin-600',
        activeNav: 'bg-admin-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-admin-50',
        mainBg: 'bg-gradient-to-br from-admin-50 via-white to-admin-100/40',
        panelTitle: 'Admin Portal',
      };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItem = ({ isActive }) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      isActive
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

  const supportTab = new URLSearchParams(location.search).get('tab') || 'overview';
  const superAdminTab = new URLSearchParams(location.search).get('tab') || 'overview';
  const supportNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      location.pathname === '/admin/super-support-dashboard' && supportTab === tab
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

    const superAdminNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      (location.pathname === '/super-admin' && superAdminTab === tab) ||
      (location.pathname === '/super-admin/transportation' && tab === 'transportation') ||
      (location.pathname === '/super-admin/fumigation-cleaning' && tab === 'fumigation-cleaning')
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;
    const superFinancialPanel = new URLSearchParams(location.search).get('panel') || 'overview';
  const superFinancialNavItem = (panel) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      location.pathname === '/admin/super-financial-dashboard' && superFinancialPanel === panel
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

    const financialTab = new URLSearchParams(location.search).get('tab') || 'overview';
  const financialNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      location.pathname === '/admin/financial-dashboard' && financialTab === tab
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

  const transportationTab = new URLSearchParams(location.search).get('tab') || 'overview';
  const transportationNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      location.pathname === '/admin/transportation' && transportationTab === tab
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

  return (
    <div className={`min-h-screen flex ${roleTheme.mainBg}`}>

      {/* Sidebar */}
      <aside className="w-64 bg-white/95 shadow-lg flex flex-col backdrop-blur">

        <div className="px-6 py-5 border-b">
          <h2 className="text-xl font-bold text-gray-900">{roleTheme.panelTitle}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {user?.full_name || 'Administrator'}
          </p>
          <RoleBadge role={role} className="mt-2" />
          {isStateScopedAdmin && (
            <div className="mt-2 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              Scope: {assignedStateLabel}
            </div>
          )}

                              {/* SUPER SUPPORT */}
          {isSuperSupportAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                Super Support
              </p>

              <div className="space-y-2">
                <NavLink to="/admin/super-support-dashboard?tab=overview" className={() => supportNavItem('overview')}>
                  <FaGlobe className="mr-3" />
                  Dashboard
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=queue" className={() => supportNavItem('queue')}>
                  <FaMapMarkerAlt className="mr-3" />
                  Migration Queue
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=audit" className={() => supportNavItem('audit')}>
                  <FaShieldAlt className="mr-3" />
                  Audit Trail
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=tickets" className={() => supportNavItem('tickets')}>
                  <FaLifeRing className="mr-3" />
                  Support Tickets
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=alerts" className={() => supportNavItem('alerts')}>
                  <FaEnvelope className="mr-3" />
                  Alerts
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=reports" className={() => supportNavItem('reports')}>
                  <FaFileAlt className="mr-3" />
                  Reports
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=settings" className={() => supportNavItem('settings')}>
                  <FaLock className="mr-3" />
                  Settings
                </NavLink>
              </div>
            </div>
          )}
        </div>

                <nav className="flex-1 p-4 space-y-6">

          {/* SUPER ADMIN */}
          {isSuperAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                Super Admin
              </p>

              <div className="space-y-2">
                <NavLink to="/super-admin?tab=overview" className={() => superAdminNavItem('overview')}>
                  <FaTachometerAlt className="mr-3" />
                  Overview
                </NavLink>

                <NavLink to="/super-admin?tab=users" className={() => superAdminNavItem('users')}>
                  <FaUsers className="mr-3" />
                  Users
                </NavLink>

                <NavLink to="/super-admin?tab=verifications" className={() => superAdminNavItem('verifications')}>
                  <FaCheckCircle className="mr-3" />
                  Verifications
                </NavLink>

                <NavLink to="/super-admin?tab=lawyer_invites" className={() => superAdminNavItem('lawyer_invites')}>
                  <FaEnvelope className="mr-3" />
                  Lawyer Invites
                </NavLink>

                <NavLink to="/super-admin?tab=platform_lawyers" className={() => superAdminNavItem('platform_lawyers')}>
                  <FaUsers className="mr-3" />
                  Platform Lawyers
                </NavLink>

                <NavLink to="/super-admin?tab=platform_agents" className={() => superAdminNavItem('platform_agents')}>
                  <FaUsers className="mr-3" />
                  Platform Agents
                </NavLink>

                <NavLink to="/super-admin?tab=lawyer_activity" className={() => superAdminNavItem('lawyer_activity')}>
                  <FaFileAlt className="mr-3" />
                  Lawyer Activity
                </NavLink>

                <NavLink to="/super-admin?tab=properties" className={() => superAdminNavItem('properties')}>
                  <FaHome className="mr-3" />
                  Properties
                </NavLink>

                <NavLink to="/super-admin?tab=analytics" className={() => superAdminNavItem('analytics')}>
                  <FaShieldAlt className="mr-3" />
                  Analytics
                </NavLink>

                <NavLink to="/super-admin?tab=reports" className={() => superAdminNavItem('reports')}>
                  <FaFileAlt className="mr-3" />
                  Reports
                </NavLink>

                <NavLink to="/super-admin?tab=logs" className={() => superAdminNavItem('logs')}>
                  <FaLock className="mr-3" />
                  Logs
                </NavLink>

                <NavLink to="/super-admin?tab=broadcast" className={() => superAdminNavItem('broadcast')}>
                  <FaEnvelope className="mr-3" />
                  Broadcast
                </NavLink>

                <NavLink to="/super-admin?tab=ad_spaces" className={() => superAdminNavItem('ad_spaces')}>
                  <FaBroadcastTower className="mr-3" />
                  Ad Spaces
                </NavLink>

                <NavLink to="/super-admin?tab=pricing" className={() => superAdminNavItem('pricing')}>
                  <FaMoneyBill className="mr-3" />
                  Pricing
                </NavLink>

                <NavLink to="/super-admin?tab=flags" className={() => superAdminNavItem('flags')}>
                  <FaShieldAlt className="mr-3" />
                  Flags
                </NavLink>

                <NavLink to="/super-admin?tab=fraud" className={() => superAdminNavItem('fraud')}>
                  <FaShieldAlt className="mr-3" />
                  Fraud
                </NavLink>

                <NavLink to="/super-admin?tab=admin" className={() => superAdminNavItem('admin')}>
                  <FaUsers className="mr-3" />
                  Admin
                  {badgePill(liveBadges.pendingAdminApprovals, 'amber')}
                </NavLink>

                <NavLink to="/super-admin?tab=transportation" className={() => superAdminNavItem('transportation')}>
                  <FaTruck className="mr-3" />
                  Transportation
                </NavLink>

                <NavLink to="/super-admin?tab=fumigation-cleaning" className={() => superAdminNavItem('fumigation-cleaning')}>
                  <FaSprayCan className="mr-3" />
                  Fumigation
                </NavLink>
              </div>
            </div>
          )}

          {/* STATE ADMIN */}
          {isStateAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                State Admin
              </p>

              <div className="space-y-2">
                <NavLink to="/admin" end className={navItem}>
                  <FaMapMarkerAlt className="mr-3" />
                  State Dashboard
                </NavLink>

                <NavLink to="/admin/users" className={navItem}>
                  <FaUsers className="mr-3" />
                  Users
                </NavLink>

                <NavLink to="/admin/properties" className={navItem}>
                  <FaHome className="mr-3" />
                  Properties
                </NavLink>

                <NavLink to="/admin/applications" className={navItem}>
                  <FaFileAlt className="mr-3" />
                  Applications
                </NavLink>

                <NavLink to="/admin/withdrawals" className={navItem}>
                  <FaMoneyBill className="mr-3" />
                  Commission Withdrawals
                </NavLink>

                <NavLink to="/admin/transportation/state" className={navItem}>
                  <FaTruck className="mr-3" />
                  Transportation Monitor
                </NavLink>
              </div>
            </div>
          )}

          {/* CORE */}
          {isCoreAdmin && (
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
              Core
            </p>

            <div className="space-y-2">

              <NavLink to="/admin" end className={navItem}>
                <FaTachometerAlt className="mr-3" />
                Dashboard
              </NavLink>

              <NavLink to="/admin/users" className={navItem}>
                <FaUsers className="mr-3" />
                Users
              </NavLink>

              <NavLink to="/admin/properties" className={navItem}>
                <FaHome className="mr-3" />
                Properties
              </NavLink>

              <NavLink to="/admin/applications" className={navItem}>
                <FaFileAlt className="mr-3" />
                Applications
              </NavLink>

              <NavLink to="/admin/transportation" className={navItem}>
                <FaTruck className="mr-3" />
                Transportation
              </NavLink>

                            <NavLink to="/admin/fumigation-cleaning" className={navItem}>
                <FaSprayCan className="mr-3" />
                Fumigation
              </NavLink>

              <NavLink to="/admin/agents" className={navItem}>
                <FaUserShield className="mr-3" />
                Agent Management
              </NavLink>

          </div>
          </div>
          )}

                    {/* FUMIGATION ADMIN */}
          {isFumigationAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                Fumigation Admin
              </p>
              <div className="space-y-2">
                <NavLink to="/admin/fumigation-cleaning" className={navItem}>
                  <FaSprayCan className="mr-3" />
                  Fumigation Dashboard
                </NavLink>
              </div>
            </div>
          )}

          {/* TRANSPORTATION ADMIN */}
          {isTransportationAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                Transportation Admin
              </p>
              <div className="space-y-2">
                <NavLink to="/admin/transportation?tab=overview" className={() => transportationNavItem('overview')}>
                  <FaTachometerAlt className="mr-3" />
                  Overview
                </NavLink>
                <NavLink to="/admin/transportation?tab=bookings" className={() => transportationNavItem('bookings')}>
                  <FaClipboardList className="mr-3" />
                  Bookings
                </NavLink>
                <NavLink to="/admin/transportation?tab=services" className={() => transportationNavItem('services')}>
                  <FaTruck className="mr-3" />
                  Services
                </NavLink>
                <NavLink to="/admin/transportation?tab=alerts" className={() => transportationNavItem('alerts')}>
                  <FaExclamationTriangle className="mr-3" />
                  Alerts
                </NavLink>
                <NavLink to="/admin/transportation?tab=analytics" className={() => transportationNavItem('analytics')}>
                  <FaChartLine className="mr-3" />
                  Analytics
                </NavLink>
              </div>
            </div>
          )}


          {/* LEGAL */}
          {isCoreAdmin && (
          <div>

            <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
              Legal
            </p>

            <div className="space-y-2">

              <NavLink to="/admin/verifications" className={navItem}>
                <FaCheckCircle className="mr-3" />
                Identity Verification
                {badgePill(liveBadges.pendingVerifications, 'amber')}
              </NavLink>

              <NavLink to="/admin/lawyer-invites" className={navItem}>
                <FaEnvelope className="mr-3" />
                Lawyer Invites
              </NavLink>

              <NavLink to="/admin/compliance" className={navItem}>
                <FaShieldAlt className="mr-3" />
                Compliance & Risk

                {riskScore > 12 && (
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    High
                  </span>
                )}
              </NavLink>

            </div>

          </div>
          )}


          {/* MONITORING */}
          {isCoreAdmin && (
          <div>

            <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
              Monitoring
            </p>

            <div className="space-y-2">

              <NavLink to="/admin/ledger" className={navItem}>
                <FaLock className="mr-3" />
                Ledger Integrity

                {!ledgerIntegrity && (
                  <span className="ml-auto bg-red-600 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
                    !
                  </span>
                )}

              </NavLink>

            </div>

          </div>
          )}

                    {/* FINANCIAL ADMIN NAV */}
          {isFinancialAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                Financial Admin
              </p>

              <div className="space-y-2">
                <NavLink to="/admin/financial-dashboard?tab=overview" className={() => financialNavItem('overview')}>
                  <FaMoneyBill className="mr-3" />
                  Overview
                </NavLink>

                <NavLink to="/admin/financial-dashboard?tab=transactions" className={() => financialNavItem('transactions')}>
                  <FaFileAlt className="mr-3" />
                  Transactions
                </NavLink>

                <NavLink to="/admin/financial-dashboard?tab=state-admins" className={() => financialNavItem('state-admins')}>
                  <FaUsers className="mr-3" />
                  State Admins
                </NavLink>

                <NavLink to="/admin/financial-dashboard?tab=frozen-funds" className={() => financialNavItem('frozen-funds')}>
                  <FaLock className="mr-3" />
                  Frozen Funds
                </NavLink>

                <NavLink to="/admin/financial-dashboard?tab=withdrawals" className={() => financialNavItem('withdrawals')}>
                  <FaMoneyBill className="mr-3" />
                  Withdrawals
                </NavLink>

                <NavLink to="/admin/financial-dashboard?tab=audit-trail" className={() => financialNavItem('audit-trail')}>
                  <FaShieldAlt className="mr-3" />
                  Audit Trail
                </NavLink>
              </div>
            </div>
          )}

          {/* SUPER FINANCIAL ADMIN NAV */}
          {isSuperFinancialAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                Super Financial
              </p>

              <div className="space-y-2">
                <NavLink to="/admin/super-financial-dashboard?panel=overview" className={() => superFinancialNavItem('overview')}>
                  <FaMoneyBill className="mr-3" />
                  Overview
                </NavLink>

                <NavLink to="/admin/super-financial-dashboard?panel=transactions" className={() => superFinancialNavItem('transactions')}>
                  <FaFileAlt className="mr-3" />
                  Transactions
                </NavLink>

                <NavLink to="/admin/super-financial-dashboard?panel=state-performance" className={() => superFinancialNavItem('state-performance')}>
                  <FaUsers className="mr-3" />
                  State Performance
                </NavLink>

                <NavLink to="/admin/super-financial-dashboard?panel=withdrawals" className={() => superFinancialNavItem('withdrawals')}>
                  <FaMoneyBill className="mr-3" />
                  Personal Withdrawals
                </NavLink>

                <NavLink to="/admin/super-financial-dashboard?panel=frozen-funds" className={() => superFinancialNavItem('frozen-funds')}>
                  <FaLock className="mr-3" />
                  Frozen Funds
                </NavLink>
              </div>
            </div>
          )}

          {/* STATE FINANCIAL & SUPPORT NAV */}
          {(isStateFinancialAdmin || isStateSupportAdmin) && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">State Operations</p>

              <div className="space-y-2">
                {isStateFinancialAdmin && (
                  <NavLink to="/admin" className={navItem}>
                    <FaMapMarkerAlt className="mr-3" />
                    State Dashboard
                  </NavLink>
                )}

                {isStateFinancialAdmin && (
                  <NavLink to="/admin/withdrawals" className={navItem}>
                    <FaMoneyBill className="mr-3" />
                    Commission Withdrawals
                    {badgePill(liveBadges.pendingWithdrawals, 'blue')}
                  </NavLink>
                )}

                {isStateSupportAdmin && (
                  <NavLink to="/admin/state-support-dashboard" className={navItem}>
                    <FaLifeRing className="mr-3" />
                    State Support Dashboard
                    {badgePill(liveBadges.pendingSupportQueue)}
                  </NavLink>
                )}

                {(isStateFinancialAdmin || isStateSupportAdmin) && (
                  <NavLink to="/admin/transportation/state" className={navItem}>
                    <FaTruck className="mr-3" />
                    Transportation Monitor
                  </NavLink>
                )}

              </div>
            </div>
          )}

        </nav>


        <div className="p-4 border-t">

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
          >
            <FaSignOutAlt className="mr-2" />
            Logout
          </button>

        </div>

      </aside>


      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 overflow-y-auto animate-fadeIn">
        {isStateScopedAdmin && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-800">
            You are viewing state-scoped admin data for <span className="font-semibold">{assignedStateLabel}</span>.
          </div>
        )}
        <Outlet />
      </main>

    </div>
  );
};

export default AdminLayout;

