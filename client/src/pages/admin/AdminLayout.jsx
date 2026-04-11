import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
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
  FaGlobe
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
  const isStateScopedAdmin = ['state_admin', 'state_financial_admin', 'state_support_admin', 'state_lawyer'].includes(role);
  const assignedStateLabel = user?.assigned_state || 'Not Assigned';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItem = ({ isActive }) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      isActive
        ? 'bg-primary-600 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  const supportTab = new URLSearchParams(location.search).get('tab') || 'overview';
  const supportNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      location.pathname === '/admin/super-support-dashboard' && supportTab === tab
        ? 'bg-primary-600 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen flex bg-gray-100">

      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg flex flex-col">

        <div className="px-6 py-5 border-b">
          <h2 className="text-xl font-bold text-primary-600">Admin Panel</h2>
          <p className="text-xs text-gray-500 mt-1">
            {user?.full_name || 'Administrator'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {role ? role.replace(/_/g, ' ').toUpperCase() : 'ADMIN'}
          </p>
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
              </div>
            </div>
          )}

          {/* CORE */}
          {!isSuperSupportAdmin && !isStateAdmin && (
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

          </div>
          </div>
          )}


          {/* LEGAL */}
          {!isSuperSupportAdmin && !isStateAdmin && (
          <div>

            <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
              Legal
            </p>

            <div className="space-y-2">

              <NavLink to="/admin/verifications" className={navItem}>
                <FaCheckCircle className="mr-3" />
                Identity Verification
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
          {!isSuperSupportAdmin && !isStateAdmin && (
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

          {/* FINANCIAL & STATE ADMIN DASHBOARDS */}
          {(
            role === 'financial_admin' ||
            role === 'super_financial_admin' ||
            role === 'state_financial_admin' ||
            role === 'state_support_admin'
          ) && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                Admin Dashboards
              </p>

              <div className="space-y-2">
                {role === 'financial_admin' && (
                  <NavLink to="/admin/financial-dashboard" className={navItem}>
                    <FaMoneyBill className="mr-3" />
                    Financial Dashboard
                  </NavLink>
                )}

                {role === 'super_financial_admin' && (
                  <NavLink to="/admin/super-financial-dashboard" className={navItem}>
                    <FaMoneyBill className="mr-3" />
                    Super Financial Dashboard
                  </NavLink>
                )}

                {role === 'state_financial_admin' && (
                  <NavLink to="/admin" className={navItem}>
                    <FaMapMarkerAlt className="mr-3" />
                    State Dashboard
                  </NavLink>
                )}

                {role === 'state_financial_admin' && (
                  <NavLink to="/admin/withdrawals" className={navItem}>
                    <FaMoneyBill className="mr-3" />
                    Commission Withdrawals
                  </NavLink>
                )}

                {role === 'state_support_admin' && (
                  <NavLink to="/admin/state-support-dashboard" className={navItem}>
                    <FaLifeRing className="mr-3" />
                    State Support Dashboard
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

