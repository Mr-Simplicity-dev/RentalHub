import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FaBell, FaUser, FaSignOutAlt, FaEnvelope } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
  getImpersonationOriginalSession,
  clearImpersonationOriginalSession,
  setAuthSession,
} from '../../services/authStorage';
import RoleBadge from './RoleBadge';

const Header = () => {
  const { user, isAuthenticated, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState({
    unreadMessages: 0,
    pendingVerifications: 0,
    pendingAdminApprovals: 0,
    pendingSupportQueue: 0,
    pendingWithdrawals: 0,
  });
  const { t } = useTranslation();
  const impersonationSession = getImpersonationOriginalSession();
  const isImpersonating = Boolean(impersonationSession);
  const role = String(user?.user_type || '').toLowerCase();

  const roleDashboardPath = useMemo(() => {
    if (role === 'tenant') return '/tenant/dashboard';
    if (role === 'super_admin') return '/super-admin';
    if (role === 'super_support_admin') return '/admin/super-support-dashboard';
    if (role === 'state_support_admin') return '/admin/state-support-dashboard';
    if (role === 'state_admin' || role === 'state_financial_admin') return '/admin';
    if (role === 'super_financial_admin') return '/admin/super-financial-dashboard';
    if (role === 'financial_admin') return '/admin/financial-dashboard';
    if (role === 'lawyer') return '/lawyer';
    if (role === 'state_lawyer') return '/lawyer/state';
    if (role === 'super_lawyer') return '/lawyer/super';
    if (role === 'agent') return '/agent/dashboard';
    return '/dashboard';
  }, [role]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return undefined;

    let isCancelled = false;

    const fetchBadgeCounts = async () => {
      const next = {
        unreadMessages: 0,
        pendingVerifications: 0,
        pendingAdminApprovals: 0,
        pendingSupportQueue: 0,
        pendingWithdrawals: 0,
      };

      try {
        const unreadRes = await api.get('/messages/unread/count');
        next.unreadMessages = Number(unreadRes.data?.data?.unread_count || 0);
      } catch {
        // Ignore badge fetch errors.
      }

      if (role === 'admin') {
        try {
          const adminStatsRes = await api.get('/admin/stats');
          next.pendingVerifications = Number(adminStatsRes.data?.data?.pendingVerifications || 0);
        } catch {
          // Ignore badge fetch errors.
        }
      }

      if (role === 'super_admin') {
        try {
          const pendingAdminsRes = await api.get('/super/pending-admins');
          next.pendingAdminApprovals = Array.isArray(pendingAdminsRes.data?.data)
            ? pendingAdminsRes.data.data.length
            : 0;
        } catch {
          // Ignore badge fetch errors.
        }
      }

      if (role === 'state_support_admin') {
        try {
          const supportQueueRes = await api.get('/state-migrations/support/queue?stage=incoming&status=pending');
          next.pendingSupportQueue = Array.isArray(supportQueueRes.data?.data)
            ? supportQueueRes.data.data.length
            : 0;
        } catch {
          // Ignore badge fetch errors.
        }
      }

      if (role === 'state_admin' || role === 'state_financial_admin') {
        try {
          const withdrawalsRes = await api.get('/state-admin/withdrawals');
          const rows = withdrawalsRes.data?.data?.withdrawals || [];
          next.pendingWithdrawals = rows.filter((row) => String(row.status || '').toLowerCase() === 'pending').length;
        } catch {
          // Ignore badge fetch errors.
        }
      }

      if (!isCancelled) {
        setBadgeCounts(next);
      }
    };

    fetchBadgeCounts();
    const intervalId = setInterval(fetchBadgeCounts, 30000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [isAuthenticated, role, user?.id]);

  const headerAttentionCount =
    badgeCounts.pendingVerifications +
    badgeCounts.pendingAdminApprovals +
    badgeCounts.pendingSupportQueue +
    badgeCounts.pendingWithdrawals;

  const handleLogout = () => {
    clearImpersonationOriginalSession();
    logout();
    navigate('/login');
  };

  const stopImpersonation = () => {
    const originalSession = getImpersonationOriginalSession();
    if (!originalSession?.token || !originalSession?.user) {
      toast.error('Original super admin session was not found');
      return;
    }

    setAuthSession(originalSession.token, originalSession.user);
    updateUser(originalSession.user);
    api.defaults.headers.common['Authorization'] = `Bearer ${originalSession.token}`;
    clearImpersonationOriginalSession();
    toast.success('Returned to Super Admin session');
    navigate('/super-admin?tab=admin');
  };

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      {isImpersonating && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-amber-900 font-medium">
              Impersonation Mode: You are viewing the platform as {user?.full_name || 'selected admin'}.
            </p>
            <button
              type="button"
              onClick={stopImpersonation}
              className="rounded bg-amber-700 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800"
            >
              Return to Super Admin
            </button>
          </div>
        </div>
      )}
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
                <img
                  src="/logo192.png"
                  alt="RentalHub NG"
                  className="h-12 md:h-14 lg:h-16 object-contain"
                />
                <span className="text-xl md:text-2xl font-bold text-gray-900">
                  RentalHub NG
                </span>
              </Link>


          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link to="/properties" className="text-gray-700 hover:text-primary-600">
              {t('header.browse')}
            </Link>
            <Link to="/verify-case" className="text-gray-700 hover:text-primary-600">
              Verify Dispute Evidence
            </Link>

            {isAuthenticated && ['landlord', 'agent'].includes(user?.user_type) && (
              <Link to="/my-properties" className="text-gray-700 hover:text-primary-600">
                {t('header.my_properties')}
              </Link>
            )}

            {isAuthenticated && user?.user_type === 'tenant' && (
              <Link to="/saved-properties" className="text-gray-700 hover:text-primary-600">
                {t('header.saved')}
              </Link>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {/* Messages */}
                <Link to="/messages" className="relative text-gray-700 hover:text-primary-600">
                  <FaEnvelope className="text-xl" />
                  {badgeCounts.unreadMessages > 0 && (
                    <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {badgeCounts.unreadMessages > 99 ? '99+' : badgeCounts.unreadMessages}
                    </span>
                  )}
                </Link>

                {/* Notifications */}
                <Link to="/notifications" className="relative text-gray-700 hover:text-primary-600">
                  <FaBell className="text-xl" />
                  {headerAttentionCount > 0 && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </Link>

                {/* User Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 text-gray-700 hover:text-primary-600"
                  >
                    <FaUser className="text-xl" />
                    <span className="hidden md:block">{user?.full_name}</span>
                    <RoleBadge role={role} compact className="hidden md:inline-flex" />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2">
                      <Link
                        to={roleDashboardPath}
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowUserMenu(false)}
                      >
                        <span className="flex items-center justify-between">
                          <span>{t('header.dashboard')}</span>
                          {headerAttentionCount > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              {headerAttentionCount}
                            </span>
                          )}
                        </span>
                      </Link>

                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowUserMenu(false)}
                      >
                        {t('header.profile')}
                      </Link>

                      <Link
                        to="/applications"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowUserMenu(false)}
                      >
                        {t('header.applications')}
                      </Link>

                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-100 flex items-center space-x-2"
                      >
                        <FaSignOutAlt />
                        <span>{t('header.logout')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <Link to="/login" className="text-gray-700 hover:text-primary-600">
                  {t('header.login')}
                </Link>
                <Link to="/register" className="btn btn-primary">
                  {t('header.register')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
