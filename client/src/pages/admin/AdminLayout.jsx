import React, { useEffect, useRef, useState, useCallback } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import RoleBadge from '../../components/common/RoleBadge';
import FloatingContactWidget from '../../components/common/FloatingContactWidget';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
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
  FaChartLine,
  FaExclamationTriangle,
  FaBroadcastTower,
  FaClipboardList,
  FaStar,
  FaWallet,
  FaHeadset,
  FaPhone,
  FaUserShield,
  FaUserCircle,
  FaChevronDown,
  FaBars,
  FaTimes,
  FaBell,
  FaIdCard,
  FaFilter,
  FaArrowUp,
} from 'react-icons/fa';

const scrollDashboardToTarget = (hash = '', scrollContainer = null, behavior = 'smooth') => {
  if (typeof window === 'undefined') return;

  window.setTimeout(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView({ behavior, block: 'start' });
        return;
      }
    }

    if (scrollContainer?.scrollTo) {
      scrollContainer.scrollTo({ top: 0, left: 0, behavior });
    }

    window.scrollTo({ top: 0, left: 0, behavior });
  }, 0);
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文' },
];

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const role = (user?.user_type || '').trim().toLowerCase();

  // TEMP default values (until backend supplies them)
  const riskScore = user?.riskScore || 0;
  const ledgerIntegrity = user?.ledgerIntegrity ?? true;
  const isSuperSupportAdmin = role === 'super_support_admin';
  const isStateAdmin = role === 'state_admin';
  const isCoreAdmin = ['admin', 'lga_admin'].includes(role);
  const isSuperAdmin = role === 'super_admin';
  const isFinancialAdmin = role === 'financial_admin';
  const isLgaFinancialAdmin = role === 'lga_financial_admin';
  const isSuperFinancialAdmin = role === 'super_financial_admin';
  const isStateFinancialAdmin = role === 'state_financial_admin';
  const isLgaSupportAdmin = role === 'lga_support_admin';
  const isStateSupportAdmin = role === 'state_support_admin';
  const isRecruitmentAdmin = role === 'recruitment_admin' || user?.is_recruitment_admin === true;
  const isFumigationAdmin = ['fumigation_admin', 'lga_fumigation_admin', 'state_fumigation_admin', 'super_fumigation_admin'].includes(role);
  const isTransportationAdmin = ['transportation_admin', 'lga_transportation_admin', 'state_transportation_admin', 'super_transportation_admin'].includes(role);
  const isStateScopedAdmin = [
    'state_admin',
    'state_financial_admin',
    'state_support_admin',
    'state_lawyer',
    'state_transportation_admin',
    'state_fumigation_admin',
    'admin',
    'lga_admin',
    'lga_support_admin',
    'lga_financial_admin',
    'lga_transportation_admin',
    'lga_fumigation_admin',
  ].includes(role);
  const assignedStateLabel = user?.assigned_state || 'Not Assigned';
  const assignedLgaLabel = user?.assigned_city || '';
    const fumigationBasePath = role === 'super_fumigation_admin'
    ? '/super-admin/fumigation-cleaning'
    : role === 'state_fumigation_admin'
    ? '/admin/fumigation-cleaning/state'
    : '/admin/fumigation-cleaning';
  const transportationBasePath = role === 'super_transportation_admin'
    ? '/super-admin/transportation'
    : role === 'state_transportation_admin'
    ? '/admin/transportation/state'
    : '/admin/transportation';
  const [liveBadges, setLiveBadges] = useState({
    pendingVerifications: 0,
    pendingAdminApprovals: 0,
    pendingSupportQueue: 0,
    pendingWithdrawals: 0,
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const mainContentRef = useRef(null);
  const previousRouteRef = useRef('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [notifUnreadMessages, setNotifUnreadMessages] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const notifRef = useRef(null);
  const notifRefMobile = useRef(null);
  const [activeLanguage, setActiveLanguage] = useState(i18n.language?.split('-')[0] || 'en');

  useEffect(() => {
    setMobileSidebarOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const routeKey = `${location.pathname}${location.search}${location.hash}`;
    if (previousRouteRef.current === routeKey) return;

    previousRouteRef.current = routeKey;

    // Super-admin uses its own tab-based scrolling via loadTab shortcuts
    if (!location.hash && location.pathname === '/super-admin') return;

    scrollDashboardToTarget(location.hash, mainContentRef.current);
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleLanguageChange = (language = i18n.language) => {
      const normalizedLanguage = language?.split('-')[0] || 'en';
      setActiveLanguage(normalizedLanguage);
      document.documentElement.lang = normalizedLanguage;
      document.documentElement.dir = normalizedLanguage === 'ar' ? 'rtl' : 'ltr';
    };
    handleLanguageChange();
    i18n.on('languageChanged', handleLanguageChange);
    return () => { i18n.off('languageChanged', handleLanguageChange); };
  }, []);

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

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get('/notifications', { params: { limit: 10 } });
      if (res.data?.success) setNotifications(res.data.data || []);
    } catch {}
    try {
      const countRes = await api.get('/notifications/unread/count');
      if (countRes.data?.success) setNotifUnreadCount(Number(countRes.data?.data?.unread_count || 0));
    } catch {}
  }, [user?.id]);

  const fetchUnreadMessages = useCallback(async () => {
    if (!user?.id) return;
    try {
      const unreadRes = await api.get('/messages/unread/count');
      setNotifUnreadMessages(Number(unreadRes.data?.data?.unread_count || 0));
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadMessages();
    const intervalId = setInterval(() => {
      fetchNotifications();
      fetchUnreadMessages();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [fetchNotifications, fetchUnreadMessages]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target) && notifRefMobile.current && !notifRefMobile.current.contains(e.target)) setShowNotifications(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markNotifAsRead = async (notifId) => {
    try {
      await api.patch(`/notifications/${notifId}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n)));
      setNotifUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllNotifsAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setNotifUnreadCount(0);
    } catch {}
  };

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
    : isLgaSupportAdmin || isStateSupportAdmin
    ? {
        sidebarBg: 'from-amber-700 to-amber-600',
        activeNav: 'bg-amber-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-amber-50',
        mainBg: 'bg-gradient-to-br from-amber-50 via-white to-amber-100/40',
        panelTitle: isLgaSupportAdmin ? 'LGA Support Console' : 'State Support Console',
      }
    : isFinancialAdmin || isLgaFinancialAdmin
    ? {
        sidebarBg: 'from-emerald-700 to-emerald-600',
        activeNav: 'bg-emerald-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-emerald-50',
        mainBg: 'bg-gradient-to-br from-emerald-50 via-white to-emerald-100/40',
        panelTitle: isLgaFinancialAdmin ? 'LGA Finance Console' : 'Financial Admin Console',
      }
    : isFumigationAdmin
    ? {
        sidebarBg: 'from-rose-700 to-rose-600',
        activeNav: 'bg-rose-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-rose-50',
        mainBg: 'bg-gradient-to-br from-rose-50 via-white to-rose-100/40',
        panelTitle: role === 'lga_fumigation_admin'
          ? 'LGA Fumigation Console'
          : role === 'state_fumigation_admin'
          ? 'State Fumigation Console'
          : role === 'super_fumigation_admin'
          ? 'Super Fumigation Console'
          : 'Fumigation Admin',
      }
    : isTransportationAdmin
    ? {
        sidebarBg: 'from-sky-700 to-sky-600',
        activeNav: 'bg-sky-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-sky-50',
        mainBg: 'bg-gradient-to-br from-sky-50 via-white to-sky-100/40',
        panelTitle: role === 'lga_transportation_admin'
          ? 'LGA Transportation Console'
          : role === 'state_transportation_admin'
          ? 'State Transportation Console'
          : role === 'super_transportation_admin'
          ? 'Super Transportation Console'
          : 'Transportation Admin',
      }
    : isRecruitmentAdmin
    ? {
        sidebarBg: 'from-violet-700 to-violet-600',
        activeNav: 'bg-violet-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-violet-50',
        mainBg: 'bg-gradient-to-br from-violet-50 via-white to-violet-100/40',
        panelTitle: 'Recruitment Admin Console',
      }
    : {
        sidebarBg: 'from-admin-700 to-admin-600',
        activeNav: 'bg-admin-600 text-white',
        hoverNav: 'text-gray-700 hover:bg-admin-50',
        mainBg: 'bg-gradient-to-br from-admin-50 via-white to-admin-100/40',
        panelTitle: isCoreAdmin ? 'LGA Admin Console' : 'Admin Portal',
      };

  const handleLogout = () => {
    setProfileMenuOpen(false);
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
  const supportDashboardPath = isSuperSupportAdmin
    ? '/admin/super-support-dashboard'
    : isStateSupportAdmin
    ? '/admin/state-support-dashboard'
    : '/admin/lga-support-dashboard';
  const supportNavItem = (tab, path = supportDashboardPath) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      location.pathname === path && supportTab === tab
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

        const isSuperAdminNavActive = (tab) =>
      (location.pathname === '/super-admin' && superAdminTab === tab) ||
      (location.pathname === '/super-admin/transportation' && tab === 'transportation') ||
      (location.pathname === '/super-admin/fumigation-cleaning' && tab === 'fumigation-cleaning') ||
      (location.pathname === '/super-admin' && tab === 'admin_monitor' && superAdminTab === 'admin_monitor');

    const superAdminNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      isSuperAdminNavActive(tab)
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

    const superAdminFeaturedNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg border transition-colors ${
      isSuperAdminNavActive(tab)
        ? `${roleTheme.activeNav} border-transparent`
        : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
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

  const stateOpsTab = new URLSearchParams(location.search).get('tab') || 'overview';
  const stateOpsNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      location.pathname === '/admin' && stateOpsTab === tab
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

  const transportationTab = new URLSearchParams(location.search).get('tab') || 'overview';
  const transportationNavItem = (tab) =>
    `flex items-center px-4 py-3 rounded-lg transition-colors ${
      location.pathname === transportationBasePath && transportationTab === tab
        ? roleTheme.activeNav
        : roleTheme.hoverNav
    }`;

  const handleLanguageSelect = (event) => {
    const nextLanguage = event.target.value;
    setActiveLanguage(nextLanguage);
    i18n.changeLanguage(nextLanguage);
  };

  return (
    <div className={`min-h-screen ${roleTheme.mainBg} lg:flex`}>
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close admin menu"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${mobileSidebarOpen ? 'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw]' : 'hidden'} flex-col overflow-y-auto bg-white/95 shadow-xl backdrop-blur lg:sticky lg:top-0 lg:z-0 lg:flex lg:h-screen lg:w-64 lg:max-w-none lg:shadow-lg`}
      >

        <div className="border-b px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-gray-900">{roleTheme.panelTitle}</h2>
              <p className="mt-1 truncate text-xs text-gray-500">
                {user?.full_name || 'Administrator'}
              </p>
              <RoleBadge role={role} className="mt-2" />
              {isStateScopedAdmin && (
                <div className="mt-2 inline-flex max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  <span className="truncate">Scope: {assignedStateLabel}{assignedLgaLabel ? `, ${assignedLgaLabel}` : ''}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Close admin menu"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <FaTimes />
            </button>
          </div>

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

                <NavLink to="/admin/super-support-dashboard?tab=property_requests" className={() => supportNavItem('property_requests')}>
                  <FaHome className="mr-3" />
                  Property Requests
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=audit" className={() => supportNavItem('audit')}>
                  <FaShieldAlt className="mr-3" />
                  Audit Trail
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=tickets" className={() => supportNavItem('tickets')}>
                  <FaLifeRing className="mr-3" />
                  Support Tickets
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=escalations" className={() => supportNavItem('escalations')}>
                  <FaArrowUp className="mr-3" />
                  Escalations
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=alerts" className={() => supportNavItem('alerts')}>
                  <FaEnvelope className="mr-3" />
                  Alerts
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=reports" className={() => supportNavItem('reports')}>
                  <FaFileAlt className="mr-3" />
                  Reports
                </NavLink>

              </div>
            </div>
          )}
        </div>

                <nav
                  className="flex-1 p-4 space-y-6"
                  onClick={(event) => {
                    if (event.target.closest('a')) {
                      setMobileSidebarOpen(false);
                      scrollDashboardToTarget('', mainContentRef.current);
                    }
                  }}
                >

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

                <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">People & Trust</p>

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

                <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">Operations</p>

                <NavLink to="/super-admin?tab=properties" className={() => superAdminNavItem('properties')}>
                  <FaHome className="mr-3" />
                  Properties
                </NavLink>

                <NavLink to="/super-admin?tab=property_requests" className={() => superAdminNavItem('property_requests')}>
                  <FaClipboardList className="mr-3" />
                  Property Requests
                </NavLink>

                <NavLink to="/admin/super-support-dashboard?tab=overview" className={navItem}>
                  <FaHeadset className="mr-3" />
                  Support Governance
                </NavLink>

                <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">Intelligence</p>

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

                <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">Growth</p>

                <NavLink to="/super-admin?tab=broadcast" className={() => superAdminNavItem('broadcast')}>
                  <FaEnvelope className="mr-3" />
                  Broadcast
                </NavLink>

                <NavLink to="/super-admin?tab=ad_spaces" className={() => superAdminNavItem('ad_spaces')}>
                  <FaBroadcastTower className="mr-3" />
                  Ad Spaces
                </NavLink>

                <NavLink to="/super-admin?tab=email_marketing" className={() => superAdminNavItem('email_marketing')}>
                  <FaEnvelope className="mr-3" />
                  Email Marketing
                </NavLink>

                <NavLink to="/super-admin?tab=sms_marketing" className={() => superAdminNavItem('sms_marketing')}>
                  <FaPhone className="mr-3" />
                  SMS Marketing
                </NavLink>

                <NavLink to="/super-admin?tab=platform_ratings" className={() => superAdminFeaturedNavItem('platform_ratings')}>
                  <FaStar className="mr-3" />
                  Service Ratings
                  <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                    Trust
                  </span>
                </NavLink>

                <NavLink to="/super-admin?tab=recruitment" className={() => superAdminNavItem('recruitment')}>
                  <FaUserShield className="mr-3" />
                  Recruitment
                </NavLink>

                <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">Controls</p>

                <NavLink to="/super-admin?tab=pricing" className={() => superAdminNavItem('pricing')}>
                  <FaMoneyBill className="mr-3" />
                  Pricing
                </NavLink>

                <NavLink to="/super-admin?tab=flags" className={() => superAdminNavItem('flags')}>
                  <FaShieldAlt className="mr-3" />
                  Flags
                </NavLink>

                <NavLink to="/admin/seo" className={navItem}>
                  <FaGlobe className="mr-3" />
                  SEO Dashboard
                </NavLink>

                <NavLink to="/super-admin?tab=registration_access" className={() => superAdminNavItem('registration_access')}>
                  <FaMapMarkerAlt className="mr-3" />
                  Registration Access
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

                <NavLink to="/super-admin/transportation" className={() => superAdminNavItem('transportation')}>
                  <FaTruck className="mr-3" />
                  Transportation
                </NavLink>

                <NavLink to="/super-admin/fumigation-cleaning" className={() => superAdminNavItem('fumigation-cleaning')}>
                  <FaSprayCan className="mr-3" />
                  Fumigation
                </NavLink>

                <NavLink to="/super-admin?tab=admin_monitor" className={() => superAdminNavItem('admin_monitor')}>
                  <FaUserShield className="mr-3" />
                  Admin Monitor
                </NavLink>
              </div>
            </div>
          )}

          {isRecruitmentAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                Recruitment
              </p>

              <div className="space-y-2">
                <NavLink to="/admin/recruitment" className={navItem}>
                  <FaUserShield className="mr-3" />
                  Recruitment Dashboard
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
                <NavLink to="/admin?tab=overview" className={() => stateOpsNavItem('overview')}>
                  <FaMapMarkerAlt className="mr-3" />
                  Overview
                </NavLink>

                <NavLink to="/admin?tab=users" className={() => stateOpsNavItem('users')}>
                  <FaUsers className="mr-3" />
                  Users
                </NavLink>

                <NavLink to="/admin?tab=transactions" className={() => stateOpsNavItem('transactions')}>
                  <FaFileAlt className="mr-3" />
                  Transactions
                </NavLink>

                <NavLink to="/admin?tab=commissions" className={() => stateOpsNavItem('commissions')}>
                  <FaMoneyBill className="mr-3" />
                  Commissions
                </NavLink>

                <NavLink to="/admin?tab=withdrawals" className={() => stateOpsNavItem('withdrawals')}>
                  <FaMoneyBill className="mr-3" />
                  Commission Withdrawals
                </NavLink>

                <NavLink to="/admin?tab=property_requests" className={() => stateOpsNavItem('property_requests')}>
                  <FaHome className="mr-3" />
                  Property Requests
                </NavLink>

                <NavLink to="/admin?tab=oversight" className={() => stateOpsNavItem('oversight')}>
                  <FaShieldAlt className="mr-3" />
                  Oversight
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

              <NavLink to="/admin?tab=property_requests" className={navItem}>
                <FaHome className="mr-3" />
                Property Requests
              </NavLink>

              <NavLink to="/admin/transportation" className={navItem}>
                <FaTruck className="mr-3" />
                Transportation
              </NavLink>

                            <NavLink to="/admin/fumigation-cleaning" className={navItem}>
                <FaSprayCan className="mr-3" />
                Fumigation
              </NavLink>

              <NavLink to="/admin/inspections" className={navItem}>
                <FaClipboardList className="mr-3" />
                Inspections
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
                Fumigation & Cleaning
              </p>
              <div className="space-y-2">
                <NavLink to={`${fumigationBasePath}#fumigation-overview`} className={navItem}>
                  <FaSprayCan className="mr-3" />
                  Overview
                </NavLink>
                <NavLink to={`${fumigationBasePath}#fumigation-bookings`} className={navItem}>
                  <FaClipboardList className="mr-3" />
                  Booking Queue
                </NavLink>
                <NavLink to={`${fumigationBasePath}#support-escalations`} className={navItem}>
                  <FaArrowUp className="mr-3" />
                  Support Escalations
                </NavLink>
                <NavLink to={`${fumigationBasePath}#fumigation-filters`} className={navItem}>
                  <FaFilter className="mr-3" />
                  Filters & Exports
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
                <NavLink to={`${transportationBasePath}?tab=overview`} className={() => transportationNavItem('overview')}>
                  <FaTachometerAlt className="mr-3" />
                  Overview
                </NavLink>
                <NavLink to={`${transportationBasePath}?tab=bookings`} className={() => transportationNavItem('bookings')}>
                  <FaClipboardList className="mr-3" />
                  Bookings
                </NavLink>
                <NavLink to={`${transportationBasePath}?tab=services`} className={() => transportationNavItem('services')}>
                  <FaTruck className="mr-3" />
                  Services
                </NavLink>
                <NavLink to={`${transportationBasePath}?tab=alerts`} className={() => transportationNavItem('alerts')}>
                  <FaExclamationTriangle className="mr-3" />
                  Alerts
                </NavLink>
                <NavLink to={`${transportationBasePath}?tab=support-escalations`} className={() => transportationNavItem('support-escalations')}>
                  <FaArrowUp className="mr-3" />
                  Support Escalations
                </NavLink>
                <NavLink to={`${transportationBasePath}?tab=analytics`} className={() => transportationNavItem('analytics')}>
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

              <NavLink to="/admin/evidence-verifications" className={navItem}>
                <FaShieldAlt className="mr-3" />
                Evidence Verification
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

                <NavLink to="/admin/financial-dashboard?tab=support-escalations" className={() => financialNavItem('support-escalations')}>
                  <FaArrowUp className="mr-3" />
                  Support Escalations
                </NavLink>

                <NavLink to="/admin/financial-dashboard?tab=audit-trail" className={() => financialNavItem('audit-trail')}>
                  <FaShieldAlt className="mr-3" />
                  Audit Trail
                </NavLink>
              </div>
            </div>
          )}

          {/* LGA SUPPORT */}
          {isLgaSupportAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                LGA Support
              </p>

              <div className="space-y-2">
                <NavLink to="/admin/lga-support-dashboard?tab=overview" className={() => supportNavItem('overview')}>
                  <FaTachometerAlt className="mr-3" />
                  Overview
                </NavLink>

                <NavLink to="/admin/lga-support-dashboard?tab=property_requests" className={() => supportNavItem('property_requests')}>
                  <FaHome className="mr-3" />
                  Property Requests
                </NavLink>

                <NavLink to="/admin/lga-support-dashboard?tab=tenancy" className={() => supportNavItem('tenancy')}>
                  <FaClipboardList className="mr-3" />
                  Tenancy Actions
                </NavLink>

                <NavLink to="/admin/lga-support-dashboard?tab=tickets" className={() => supportNavItem('tickets')}>
                  <FaLifeRing className="mr-3" />
                  Support Tickets
                  {badgePill(liveBadges.pendingSupportQueue)}
                </NavLink>

                <NavLink to="/admin/lga-support-dashboard?tab=escalations" className={() => supportNavItem('escalations')}>
                  <FaArrowUp className="mr-3" />
                  Escalations
                </NavLink>
              </div>
            </div>
          )}

          {/* LGA FINANCIAL ADMIN NAV */}
          {isLgaFinancialAdmin && (
            <div>
              <p className="text-xs uppercase text-gray-400 font-semibold mb-2">
                LGA Finance
              </p>

              <div className="space-y-2">
                <NavLink to="/admin/financial-dashboard?tab=overview#lga-finance-overview" className={() => financialNavItem('overview')}>
                  <FaMoneyBill className="mr-3" />
                  Overview
                </NavLink>

                <NavLink to="/admin/financial-dashboard?tab=withdrawals#lga-finance-withdrawals" className={() => financialNavItem('withdrawals')}>
                  <FaWallet className="mr-3" />
                  Withdrawal History
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

                <NavLink to="/admin/super-financial-dashboard?panel=support-escalations" className={() => superFinancialNavItem('support-escalations')}>
                  <FaArrowUp className="mr-3" />
                  Support Escalations
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

                  {(isStateAdmin || isStateFinancialAdmin) && (
                   <NavLink to="/admin?tab=property_requests" className={navItem}>
                      <FaHome className="mr-3" />
                      Property Requests
                   </NavLink>
                  )}

                  {isStateSupportAdmin && (
                   <NavLink to="/admin/state-support-dashboard?tab=overview" className={() => supportNavItem('overview')}>
                    <FaTachometerAlt className="mr-3" />
                    Overview
                    {badgePill(liveBadges.pendingSupportQueue)}
                  </NavLink>
                )}

                  {isStateSupportAdmin && (
                   <NavLink to="/admin/state-support-dashboard?tab=queue" className={() => supportNavItem('queue')}>
                    <FaMapMarkerAlt className="mr-3" />
                    Migration Queue
                  </NavLink>
                )}

                  {isStateSupportAdmin && (
                   <NavLink to="/admin/state-support-dashboard?tab=property_requests" className={() => supportNavItem('property_requests')}>
                    <FaHome className="mr-3" />
                    Property Requests
                  </NavLink>
                )}

                  {isStateSupportAdmin && (
                   <NavLink to="/admin/state-support-dashboard?tab=tenancy" className={() => supportNavItem('tenancy')}>
                    <FaClipboardList className="mr-3" />
                    Tenancy Actions
                  </NavLink>
                )}

                  {isStateSupportAdmin && (
                   <NavLink to="/admin/state-support-dashboard?tab=tickets" className={() => supportNavItem('tickets')}>
                    <FaLifeRing className="mr-3" />
                    Support Tickets
                    {badgePill(liveBadges.pendingSupportQueue)}
                  </NavLink>
                )}

                  {isStateSupportAdmin && (
                   <NavLink to="/admin/state-support-dashboard?tab=escalations" className={() => supportNavItem('escalations')}>
                    <FaArrowUp className="mr-3" />
                    Escalations
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
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 hidden items-center justify-between gap-4 border-b border-gray-200 bg-white/95 px-6 py-3 shadow-sm backdrop-blur lg:flex">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{roleTheme.panelTitle}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {assignedLgaLabel || assignedStateLabel || 'Platform dashboard'}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Link
              to="/messages"
              className="relative p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200 shrink-0"
            >
              <FaEnvelope className="text-lg" />
              {notifUnreadMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {notifUnreadMessages > 99 ? '99+' : notifUnreadMessages}
                </span>
              )}
            </Link>

            <div className="relative shrink-0" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
                aria-label={t('header.notifications')}
              >
                <FaBell className="text-lg" />
                {notifUnreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </button>
            </div>
          </div>

          <div className="relative shrink-0" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setProfileMenuOpen((open) => !open)}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-gray-50"
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                {user?.full_name?.charAt(0)?.toUpperCase() || <FaUserCircle />}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[180px] truncate text-sm font-semibold text-gray-900">
                  {user?.full_name || 'Administrator'}
                </span>
                <span className="block max-w-[180px] truncate text-xs text-gray-500">
                  {user?.email || roleTheme.panelTitle}
                </span>
              </span>
              <FaChevronDown
                className={`text-xs text-gray-500 transition-transform ${
                  profileMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {profileMenuOpen && (
              <div
                className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
                role="menu"
              >
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {user?.full_name || 'Administrator'}
                  </p>
                  <p className="truncate text-xs text-gray-500">{user?.email}</p>
                  <RoleBadge role={role} className="mt-2" />
                </div>

                <NavLink
                  to="/profile"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    scrollDashboardToTarget('', mainContentRef.current);
                  }}
                  role="menuitem"
                >
                  <FaUserCircle className="text-xs text-gray-500" />
                  Profile
                </NavLink>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50"
                  role="menuitem"
                >
                  <FaSignOutAlt className="text-xs" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="Open admin menu"
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <FaBars />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold text-gray-900">{roleTheme.panelTitle}</p>
            <p className="truncate text-xs text-gray-500">
              {assignedLgaLabel || assignedStateLabel || user?.full_name || 'Administrator'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link
              to="/messages"
              className="relative p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200 shrink-0"
            >
              <FaEnvelope className="text-base" />
              {notifUnreadMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white ring-2 ring-white">
                  {notifUnreadMessages > 99 ? '99+' : notifUnreadMessages}
                </span>
              )}
            </Link>
            <div className="relative" ref={notifRefMobile}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
                aria-label={t('header.notifications')}
              >
                <FaBell className="text-base" />
                {notifUnreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </button>
            </div>
          </div>
          <RoleBadge role={role} compact className="shrink-0" />
        </header>

        {showNotifications && (
          <div className="fixed left-2 right-2 top-20 z-50 flex max-h-[70vh] w-auto max-w-[calc(100vw-16px)] origin-top-right flex-col rounded-2xl border border-gray-100 bg-white py-2 shadow-elevated-lg lg:left-auto lg:right-4 lg:top-16 lg:w-96">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-900">{t('header.notifications')}</h3>
              {notifUnreadCount > 0 && (
                <button onClick={markAllNotifsAsRead} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                  {t('header.mark_all_read')}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <FaBell className="mx-auto mb-2 text-2xl text-gray-300" />
                  <p className="text-sm text-gray-500">{t('header.no_notifications')}</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`cursor-pointer border-b border-gray-50 px-4 py-3 transition-colors hover:bg-gray-50 ${!notif.is_read ? 'bg-primary-50/40' : ''}`}
                    onClick={() => {
                      setSelectedNotification(notif);
                      if (!notif.is_read) markNotifAsRead(notif.id);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{notif.title}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-600">{notif.message}</p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          {new Date(notif.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {!notif.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
                    </div>
                    {notif.link && (
                      <div className="mt-2 flex justify-end">
                        <Link
                          to={notif.link}
                          onClick={(e) => { e.stopPropagation(); setShowNotifications(false); }}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700"
                        >
                          <FaIdCard className="text-[10px]" />
                          {t('header.take_action')}
                        </Link>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {selectedNotification && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
            onClick={() => setSelectedNotification(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white shadow-elevated-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h3 className="min-w-0 pr-3 text-base font-semibold text-gray-900">{selectedNotification.title}</h3>
                <button onClick={() => setSelectedNotification(null)} className="text-xl leading-none text-gray-400 hover:text-gray-600" aria-label="Close">&times;</button>
              </div>
              <div className="px-6 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{selectedNotification.message}</p>
                <p className="mt-4 text-xs text-gray-400">
                  {new Date(selectedNotification.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {selectedNotification.link && (
                <div className="flex justify-center border-t border-gray-100 px-6 py-4">
                  <Link
                    to={selectedNotification.link}
                    onClick={() => { setSelectedNotification(null); setShowNotifications(false); }}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
                  >
                    <FaIdCard className="text-xs" />
                    {t('header.take_action')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end border-b bg-white px-3 py-1 sm:px-4 sm:py-2">
          <label className="relative block w-[8.25rem] sm:w-full sm:max-w-[12rem]" dir="ltr">
            <span className="sr-only">{t('language.select')}</span>
            <select
              onChange={handleLanguageSelect}
              value={activeLanguage}
              aria-label={t('language.select')}
              className="h-8 w-full appearance-none rounded-md border border-gray-300 bg-white py-1 pl-2.5 pr-7 text-xs leading-5 text-gray-700 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 sm:h-auto sm:rounded-lg sm:py-1.5 sm:pl-3 sm:pr-10 sm:text-sm"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <FaChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 sm:right-3 sm:text-xs"
              aria-hidden="true"
            />
          </label>
        </div>
        <main ref={mainContentRef} className="min-w-0 flex-1 overflow-x-hidden p-4 animate-fadeIn sm:p-6 lg:overflow-y-auto">
          {isStateScopedAdmin && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-800">
              You are viewing scoped admin data for <span className="font-semibold">{assignedStateLabel}{assignedLgaLabel ? `, ${assignedLgaLabel}` : ''}</span>.
            </div>
          )}
          <Outlet />
        </main>
      </div>

    <FloatingContactWidget />
    </div>
  );
};

export default AdminLayout;

