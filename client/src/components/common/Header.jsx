import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FaBell, FaUser, FaSignOutAlt, FaEnvelope, FaBars, FaTimes, FaChevronDown } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
  getImpersonationOriginalSession,
  clearImpersonationOriginalSession,
  setAuthSession,
} from '../../services/authStorage';

const Header = () => {
  const { user, isAuthenticated, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef(null);
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
    if (role === 'fumigation_admin') return '/admin/fumigation-cleaning';
    if (role === 'transportation_admin') return '/admin/transportation';
    if (role === 'lawyer') return '/lawyer';
    if (role === 'state_lawyer') return '/lawyer/state';
    if (role === 'super_lawyer') return '/lawyer/super';
    if (role === 'agent') return '/agent/dashboard';
    return '/dashboard';
  }, [role]);

 // Track scroll for glass effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


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
    <header
      className={`sticky top-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100/50'
          : 'bg-white shadow-sm'
      }`}
    >
      {isImpersonating && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 animate-fadeIn">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-amber-800 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse-soft"></span>
              Impersonation Mode: Viewing as {user?.full_name || 'selected admin'}
            </p>
            <button
              type="button"
              onClick={stopImpersonation}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-all duration-200 hover:shadow-md"
            >
              Return to Super Admin
            </button>
          </div>
        </div>
      )}
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <img
              src="/logo192.png"
              alt="RentalHub NG"
              className="h-10 md:h-12 lg:h-14 object-contain transition-transform duration-300 group-hover:scale-105"
            />
            <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
              RentalHub NG
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            <NavLink to="/properties" label={t('header.browse')} />
            <NavLink to="/verify-case" label="Verify Evidence" />
            {isAuthenticated && ['landlord', 'agent'].includes(user?.user_type) && (
              <NavLink to="/my-properties" label={t('header.my_properties')} />
            )}
            {isAuthenticated && user?.user_type === 'tenant' && (
              <NavLink to="/saved-properties" label={t('header.saved')} />
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center space-x-2 md:space-x-4">
            {isAuthenticated ? (
              <>
                <Link to="/messages" className="relative p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200">
                  <FaEnvelope className="text-lg" />
                  {badgeCounts.unreadMessages > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-scaleIn">
                      {badgeCounts.unreadMessages > 99 ? '99+' : badgeCounts.unreadMessages}
                    </span>
                  )}
                </Link>

                <Link to="/notifications" className="relative p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200">
                  <FaBell className="text-lg" />
                  {headerAttentionCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white animate-pulse-soft" />
                  )}
                </Link>

                {/* User Menu */}
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-semibold shadow-sm">
                      {user?.full_name?.charAt(0)?.toUpperCase() || <FaUser />}
                    </div>
                    <span className="hidden lg:block text-sm font-medium">{user?.full_name}</span>
                    <FaChevronDown className={`hidden lg:block text-xs transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-elevated-lg border border-gray-100 py-2 animate-scaleIn origin-top-right">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900 truncate">{user?.full_name}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                      </div>

                      <Link to={roleDashboardPath} className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors duration-150" onClick={() => setShowUserMenu(false)}>
                        <span>{t('header.dashboard')}</span>
                        {headerAttentionCount > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{headerAttentionCount}</span>
                        )}
                      </Link>

                      <Link to="/profile" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors duration-150" onClick={() => setShowUserMenu(false)}>
                        {t('header.profile')}
                      </Link>

                      <Link to="/applications" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors duration-150" onClick={() => setShowUserMenu(false)}>
                        {t('header.applications')}
                      </Link>

                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button onClick={handleLogout} className="w-full flex items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 gap-2">
                          <FaSignOutAlt className="text-xs" />
                          <span>{t('header.logout')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <Link to="/login" className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-xl transition-all duration-200">
                  {t('header.login')}
                </Link>
                <Link to="/register" className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5">
                  {t('header.register')}
                </Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <FaTimes className="text-lg" /> : <FaBars className="text-lg" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            mobileMenuOpen ? 'max-h-96 opacity-100 pb-4' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="flex flex-col space-y-1 border-t border-gray-100 pt-3">
            <MobileNavLink to="/properties" label={t('header.browse')} />
            <MobileNavLink to="/verify-case" label="Verify Evidence" />
            {isAuthenticated && ['landlord', 'agent'].includes(user?.user_type) && (
              <MobileNavLink to="/my-properties" label={t('header.my_properties')} />
            )}
            {isAuthenticated && user?.user_type === 'tenant' && (
              <MobileNavLink to="/saved-properties" label={t('header.saved')} />
            )}
            {isAuthenticated && (
              <MobileNavLink to={roleDashboardPath} label={t('header.dashboard')} />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

const NavLink = ({ to, label }) => (
  <Link to={to} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200">
    {label}
  </Link>
);

const MobileNavLink = ({ to, label }) => (
  <Link to={to} className="px-4 py-3 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200">
    {label}
  </Link>
);

export default Header;
