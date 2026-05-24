import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FaBell, FaUser, FaSignOutAlt, FaEnvelope, FaBars, FaTimes, FaChevronDown, FaIdCard, FaTachometerAlt, FaFileAlt } from 'react-icons/fa';
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
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [notifUnreadCount, setNotifUnreadCount] = useState(0);
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [showAvatarPopup, setShowAvatarPopup] = useState(false);
    const notifRef = useRef(null);
  const { t } = useTranslation();
  const impersonationSession = getImpersonationOriginalSession();
  const isImpersonating = Boolean(impersonationSession);
  const role = String(user?.user_type || '').toLowerCase();

  const roleDashboardPath = useMemo(() => {
    if (role === 'tenant') return '/tenant/dashboard';
    if (role === 'super_admin') return '/super-admin';
    if (role === 'super_support_admin') return '/admin/super-support-dashboard';
    if (role === 'state_support_admin') return '/admin/state-support-dashboard';
    if (role === 'lga_support_admin') return '/admin?tab=property_requests';
    if (role === 'state_admin' || role === 'state_financial_admin' || role === 'admin' || role === 'lga_admin') return '/admin';
    if (role === 'super_financial_admin') return '/admin/super-financial-dashboard';
    if (role === 'financial_admin' || role === 'lga_financial_admin') return '/admin/financial-dashboard';
    if (role === 'super_fumigation_admin') return '/admin/fumigation-cleaning/super';
    if (role === 'state_fumigation_admin') return '/admin/fumigation-cleaning/state';
    if (role === 'fumigation_admin' || role === 'lga_fumigation_admin') return '/admin/fumigation-cleaning';
    if (role === 'super_transportation_admin') return '/admin/transportation/super';
    if (role === 'state_transportation_admin') return '/admin/transportation/state';
    if (role === 'transportation_admin' || role === 'lga_transportation_admin') return '/admin/transportation';
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

    // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
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

      if (role === 'admin' || role === 'lga_admin') {
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

      // Fetch user notifications (reminders from admin)
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    try {
      const res = await api.get('/notifications', { params: { limit: 10 } });
      if (res.data?.success) {
        setNotifications(res.data.data || []);
      }
    } catch {
      // Ignore errors
    }
    try {
      const countRes = await api.get('/notifications/unread/count');
      if (countRes.data?.success) {
        setNotifUnreadCount(Number(countRes.data?.data?.unread_count || 0));
      }
    } catch {
      // Ignore errors
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    fetchNotifications();
    const intervalId = setInterval(fetchNotifications, 30000);
    return () => clearInterval(intervalId);
  }, [fetchNotifications]);

  const markNotifAsRead = async (notifId) => {
    try {
      await api.patch(`/notifications/${notifId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
      setNotifUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore
    }
  };

  const markAllNotifsAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setNotifUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch {
      // Ignore
    }
  };

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

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleRegisterNavigation = (event) => {
    event.preventDefault();
    setMobileMenuOpen(false);
    setShowUserMenu(false);
    setShowNotifications(false);
    navigate(`/register?restart=${Date.now()}`);
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

  // return (
  //   <header
  //     className={`sticky top-0 z-50 transition-all duration-500 ${
  //       scrolled
  //         ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100/50'
  //         : 'bg-white shadow-sm'
  //     }`}
  //   >
  //     {isImpersonating && (
  //       <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 animate-fadeIn">
  //         <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 text-sm">
  //           <p className="text-amber-800 font-medium flex items-center gap-2">
  //             <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse-soft"></span>
  //             Impersonation Mode: Viewing as {user?.full_name || 'selected admin'}
  //           </p>
  //           <button
  //             type="button"
  //             onClick={stopImpersonation}
  //             className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-all duration-200 hover:shadow-md"
  //           >
  //             Return to Super Admin
  //           </button>
  //         </div>
  //       </div>
  //     )}
  //     <div className="container mx-auto px-4">
  //       <div className="flex items-center justify-between gap-2 h-16 md:h-20">
  //         {/* Logo */}
  //         <Link to="/" className="flex min-w-0 items-center gap-2 group sm:gap-3">
  //           <img
  //             src="/logo192.png"
  //             alt="RentalHub NG"
  //             className="h-9 shrink-0 object-contain transition-transform duration-300 group-hover:scale-105 md:h-12 lg:h-14"
  //           />
  //           <span className="hidden truncate bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-xl font-bold text-transparent sm:block md:text-2xl">
  //             RentalHub NG
  //           </span>
  //         </Link>

  //         {/* Desktop Navigation */}
  //         <nav className="hidden md:flex items-center space-x-1">
  //           <NavLink to="/properties" label={t('header.browse')} />
  //           <NavLink to="/verify-case" label="Verify Evidence" />
  //           {isAuthenticated && ['landlord', 'agent'].includes(user?.user_type) && (
  //             <NavLink to="/my-properties" label={t('header.my_properties')} />
  //           )}
  //           {isAuthenticated && user?.user_type === 'tenant' && (
  //             <NavLink to="/saved-properties" label={t('header.saved')} />
  //           )}
  //         </nav>

  //         {/* Right side */}
  //         <div className="flex shrink-0 items-center gap-1.5 md:gap-4">
  //           {isAuthenticated ? (
  //             <>
  //               <Link to="/messages" className="relative p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200">
  //                 <FaEnvelope className="text-lg" />
  //                 {badgeCounts.unreadMessages > 0 && (
  //                   <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-scaleIn">
  //                     {badgeCounts.unreadMessages > 99 ? '99+' : badgeCounts.unreadMessages}
  //                   </span>
  //                 )}
  //               </Link>

  //                                               {/* Notification Bell */}
  //               <div className="relative" ref={notifRef}>
  //                 <button
  //                   onClick={() => setShowNotifications(!showNotifications)}
  //                   className="relative p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
  //                   aria-label="Notifications"
  //                 >
  //                   <FaBell className="text-lg" />
  //                   {(notifUnreadCount > 0 || headerAttentionCount > 0) && (
  //                     <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white animate-pulse-soft" />
  //                   )}
  //                 </button>

  //                 {showNotifications && (
  //                   <div className="fixed left-4 right-4 top-20 z-50 flex max-h-[70vh] w-auto origin-top-right animate-scaleIn flex-col rounded-2xl border border-gray-100 bg-white py-2 shadow-elevated-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
  //                     <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
  //                       <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
  //                       {notifUnreadCount > 0 && (
  //                         <button
  //                           onClick={markAllNotifsAsRead}
  //                           className="text-xs font-medium text-primary-600 hover:text-primary-700"
  //                         >
  //                           Mark all as read
  //                         </button>
  //                       )}
  //                     </div>
  //                     <div className="overflow-y-auto flex-1">
  //                       {notifications.length === 0 ? (
  //                         <div className="px-4 py-8 text-center">
  //                           <FaBell className="mx-auto text-gray-300 text-2xl mb-2" />
  //                           <p className="text-sm text-gray-500">No notifications yet</p>
  //                         </div>
  //                       ) : (
  //                                                   notifications.map((notif) => (
  //                           <div
  //                             key={notif.id}
  //                             className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
  //                               !notif.is_read ? 'bg-primary-50/40' : ''
  //                             }`}
  //                             onClick={() => {
  //                               setSelectedNotification(notif);
  //                               if (!notif.is_read) markNotifAsRead(notif.id);
  //                             }}
  //                           >
  //                             <div className="flex items-start gap-3">
  //                               <div className="flex-1 min-w-0">
  //                                 <p className="text-sm font-medium text-gray-900">{notif.title}</p>
  //                                 <p className="text-xs text-gray-600 mt-0.5 truncate">{notif.message}</p>
  //                                 <p className="text-[10px] text-gray-400 mt-1">
  //                                   {new Date(notif.created_at).toLocaleDateString(undefined, {
  //                                     month: 'short',
  //                                     day: 'numeric',
  //                                     hour: '2-digit',
  //                                     minute: '2-digit',
  //                                   })}
  //                                 </p>
  //                               </div>
  //                               {!notif.is_read && (
  //                                 <span className="shrink-0 w-2 h-2 rounded-full bg-primary-500 mt-2" />
  //                               )}
  //                             </div>
  //                             {notif.link && (
  //                               <div className="mt-2 flex justify-end">
  //                                 <Link
  //                                   to={notif.link}
  //                                   onClick={(e) => {
  //                                     e.stopPropagation();
  //                                     setShowNotifications(false);
  //                                   }}
  //                                   className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
  //                                 >
  //                                   <FaIdCard className="text-[10px]" />
  //                                   Take Action
  //                                 </Link>
  //                               </div>
  //                             )}
  //                           </div>
  //                         ))
  //                       )}
  //                     </div>
  //                   </div>
  //                 )}
  //               </div>

  //               {/* Full Message Modal */}
  //               {selectedNotification && (
  //                 <div
  //                   className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
  //                   onClick={() => setSelectedNotification(null)}
  //                 >
  //                   <div
  //                     className="bg-white rounded-2xl shadow-elevated-lg border border-gray-100 max-w-lg w-full mx-4 animate-scaleIn"
  //                     onClick={(e) => e.stopPropagation()}
  //                   >
  //                     <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
  //                       <h3 className="text-base font-semibold text-gray-900">
  //                         {selectedNotification.title}
  //                       </h3>
  //                       <button
  //                         onClick={() => setSelectedNotification(null)}
  //                         className="text-gray-400 hover:text-gray-600 text-xl leading-none"
  //                       >
  //                         &times;
  //                       </button>
  //                     </div>
  //                     <div className="px-6 py-4">
  //                       <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
  //                         {selectedNotification.message}
  //                       </p>
  //                       <p className="text-xs text-gray-400 mt-4">
  //                         {new Date(selectedNotification.created_at).toLocaleDateString(undefined, {
  //                           month: 'long',
  //                           day: 'numeric',
  //                           year: 'numeric',
  //                           hour: '2-digit',
  //                           minute: '2-digit',
  //                         })}
  //                       </p>
  //                     </div>
  //                                           {selectedNotification.link && (
  //                       <div className="px-6 py-4 border-t border-gray-100 flex justify-center">
  //                         <Link
  //                           to={selectedNotification.link}
  //                           onClick={() => {
  //                             setSelectedNotification(null);
  //                             setShowNotifications(false);
  //                           }}
  //                           className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
  //                         >
  //                           <FaIdCard className="text-xs" />
  //                           Take Action
  //                         </Link>
  //                       </div>
  //                     )}
  //                   </div>
  //                 </div>
  //               )}

  //               {/* Avatar Popup Modal */}
  //               {showAvatarPopup && user?.passport_photo_url && (
  //                 <div
  //                   className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
  //                   onClick={() => setShowAvatarPopup(false)}
  //                 >
  //                   <div
  //                     className="relative max-w-xl w-full mx-4 animate-scaleIn"
  //                     onClick={(e) => e.stopPropagation()}
  //                   >
  //                     <button
  //                       onClick={() => setShowAvatarPopup(false)}
  //                       className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-gray-800 text-lg leading-none"
  //                     >
  //                       &times;
  //                     </button>
  //                     <img
  //                       src={user.passport_photo_url}
  //                       alt="Profile"
  //                       className="w-full h-auto rounded-2xl shadow-2xl border-4 border-white"
  //                     />
  //                   </div>
  //                 </div>
  //               )}

  //                               {/* User Menu */}
  //               <div className="relative" ref={menuRef}>
  //                 <button
  //                   onClick={() => setShowUserMenu(prev => !prev)}
  //                   className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
  //                 >
  //                   <div
  //                     className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-semibold shadow-sm"
  //                   >
  //                     {user?.passport_photo_url ? (
  //                       <img
  //                         src={user.passport_photo_url}
  //                         alt=""
  //                         className="w-full h-full object-cover cursor-pointer"
  //                         onClick={(e) => {
  //                           e.stopPropagation();
  //                           setShowAvatarPopup(true);
  //                         }}
  //                       />
  //                     ) : (
  //                       user?.full_name?.charAt(0)?.toUpperCase() || <FaUser />
  //                     )}
  //                   </div>
  //                   <span className="hidden lg:block text-sm font-medium">{user?.full_name}</span>
  //                   <FaChevronDown className={`hidden lg:block text-xs transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
  //                 </button>

  //                 {showUserMenu && (
  //                   <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-elevated-lg border border-gray-100 py-2 animate-scaleIn origin-top-right">
  //                                           <div className="px-4 py-3 border-b border-gray-100">
  //                                             <p className="text-sm font-semibold text-gray-900 truncate">{user?.full_name}</p>
  //                                             <p className="text-xs text-gray-500 truncate">
  //                                               {user?.email?.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) =>
  //                                                 `${first}${'*'.repeat(Math.min(middle.length, 4))}${domain}`
  //                                               )}
  //                                             </p>
  //                                           </div>

  //                                           <Link to={roleDashboardPath} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors duration-150" onClick={() => setShowUserMenu(false)}>
  //                                               <FaTachometerAlt className="text-xs text-primary-500" />
  //                                               <span className="flex-1">{t('header.dashboard')}</span>
  //                       {headerAttentionCount > 0 && (
  //                         <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{headerAttentionCount}</span>
  //                       )}
  //                     </Link>

  //                     <Link to="/profile" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors duration-150" onClick={() => setShowUserMenu(false)}>
  //                                               <FaUser className="text-xs text-primary-500" />
  //                                               <span>{t('header.profile')}</span>
  //                     </Link>

  //                     <Link to="/applications" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors duration-150" onClick={() => setShowUserMenu(false)}>
  //                                               <FaFileAlt className="text-xs text-primary-500" />
  //                                               <span>{t('header.applications')}</span>
  //                     </Link>

  //                     <Link to="/verification-status" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors duration-150" onClick={() => setShowUserMenu(false)}>
  //                       <FaIdCard className="text-xs text-primary-500" />
  //                       <span>Verification</span>
  //                     </Link>

  //                     <div className="border-t border-gray-100 mt-1 pt-1">
  //                       <button onClick={handleLogout} className="w-full flex items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 gap-2">
  //                         <FaSignOutAlt className="text-xs" />
  //                         <span>{t('header.logout')}</span>
  //                       </button>
  //                     </div>
  //                   </div>
  //                 )}
  //               </div>
  //             </>
  //           ) : (
  //             <div className="hidden items-center gap-2 sm:flex md:gap-3">
  //               <Link to="/login" className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-xl transition-all duration-200">
  //                 {t('header.login')}
  //               </Link>
  //               <Link to="/register" className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5">
  //                 {t('header.register')}
  //               </Link>
  //             </div>
  //           )}

  //           {/* Mobile menu toggle */}
  //           <button
  //             onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
  //             className="md:hidden p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
  //             aria-label="Toggle mobile menu"
  //           >
  //             {mobileMenuOpen ? <FaTimes className="text-lg" /> : <FaBars className="text-lg" />}
  //           </button>
  //         </div>
  //       </div>

  //       {/* Mobile Menu */}
  //       <div
  //         className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
  //           mobileMenuOpen ? 'max-h-96 opacity-100 pb-4' : 'max-h-0 opacity-0'
  //         }`}
  //       >
  //         <div className="flex flex-col space-y-1 border-t border-gray-100 pt-3">
  //           <MobileNavLink to="/properties" label={t('header.browse')} />
  //           <MobileNavLink to="/verify-case" label="Verify Evidence" />
  //           {isAuthenticated && ['landlord', 'agent'].includes(user?.user_type) && (
  //             <MobileNavLink to="/my-properties" label={t('header.my_properties')} />
  //           )}
  //           {isAuthenticated && user?.user_type === 'tenant' && (
  //             <MobileNavLink to="/saved-properties" label={t('header.saved')} />
  //           )}
  //           {isAuthenticated && (
  //             <MobileNavLink to={roleDashboardPath} label={t('header.dashboard')} />
  //           )}
  //           {!isAuthenticated && (
  //             <>
  //               <MobileNavLink to="/login" label={t('header.login')} />
  //               <MobileNavLink to="/register" label={t('header.register')} />
  //             </>
  //           )}
  //         </div>
  //       </div>
  //     </div>
  //   </header>
  // );

  // ONLY THE RESPONSIVE FIXES WERE ADDED
// NO LOGIC OR FUNCTIONALITY WAS REMOVED

return (
  <header
    className={`sticky top-0 z-50 w-full transition-all duration-500 ${
      scrolled
        ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100/50'
        : 'bg-white shadow-sm'
    }`}
  >
    {isImpersonating && (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 animate-fadeIn overflow-x-hidden">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-amber-800 font-medium flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse-soft"></span>
            <span className="truncate">
              Impersonation Mode: Viewing as {user?.full_name || 'selected admin'}
            </span>
          </p>

          <button
            type="button"
            onClick={stopImpersonation}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-all duration-200 hover:shadow-md shrink-0"
          >
            Return to Super Admin
          </button>
        </div>
      </div>
    )}

    {/* FIXED */}
    <div className="container mx-auto w-full max-w-full px-3 sm:px-4">
      {/* FIXED */}
      <div className="flex w-full min-w-0 items-center justify-between gap-2 h-16 md:h-20">

        {/* Logo */}
        <Link
          to="/"
          className="flex min-w-0 max-w-[55%] sm:max-w-none items-center gap-2 group sm:gap-3"
        >
          <img
            src="/logo192.png"
            alt="RentalHub NG"
            className="h-9 shrink-0 object-contain transition-transform duration-300 group-hover:scale-105 md:h-12 lg:h-14"
          />

          {/* FIXED */}
          <span className="hidden truncate bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-xl font-bold text-transparent sm:block md:text-2xl">
            RentalHub NG
          </span>
        </Link>

        {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center space-x-1">
                  <NavLink to="/properties" label={t('header.browse')} />
                  <NavLink to="/list-property" label={t('footer.list')} />
                  <NavLink to="/about" label={t('footer.about_us')} />
          <NavLink to="/verify-case" label={t('header.verify_evidence')} />

          {isAuthenticated &&
            ['landlord', 'agent'].includes(user?.user_type) && (
              <NavLink
                to="/my-properties"
                label={t('header.my_properties')}
              />
            )}

          {isAuthenticated && user?.user_type === 'tenant' && (
            <NavLink
              to="/saved-properties"
              label={t('header.saved')}
            />
          )}
        </nav>

        {/* Right side */}
        {/* FIXED */}
        <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5 md:gap-4">

          {isAuthenticated ? (
            <>
              <Link
                to="/messages"
                className="relative p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200 shrink-0"
              >
                <FaEnvelope className="text-lg" />

                {badgeCounts.unreadMessages > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-scaleIn">
                    {badgeCounts.unreadMessages > 99
                      ? '99+'
                      : badgeCounts.unreadMessages}
                  </span>
                )}
              </Link>

              {/* Notification Bell */}
              <div className="relative shrink-0" ref={notifRef}>
                <button
                  onClick={() =>
                    setShowNotifications(!showNotifications)
                  }
                  className="relative p-2.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200"
                  aria-label={t('header.notifications')}
                >
                  <FaBell className="text-lg" />

                  {(notifUnreadCount > 0 ||
                    headerAttentionCount > 0) && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white animate-pulse-soft" />
                  )}
                </button>

                {showNotifications && (
                  <div className="fixed left-2 right-2 top-20 z-50 flex max-h-[70vh] w-auto max-w-[calc(100vw-16px)] origin-top-right animate-scaleIn flex-col rounded-2xl border border-gray-100 bg-white py-2 shadow-elevated-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                      <h3 className="text-sm font-semibold text-gray-900">{t('header.notifications')}</h3>
                      {notifUnreadCount > 0 && (
                        <button
                          onClick={markAllNotifsAsRead}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
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
                            className={`cursor-pointer border-b border-gray-50 px-4 py-3 transition-colors hover:bg-gray-50 ${
                              !notif.is_read ? 'bg-primary-50/40' : ''
                            }`}
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
                                  {new Date(notif.created_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                              {!notif.is_read && (
                                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                              )}
                            </div>

                            {notif.link && (
                              <div className="mt-2 flex justify-end">
                                <Link
                                  to={notif.link}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowNotifications(false);
                                  }}
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
              </div>

              {/* User Menu */}
              <div className="relative shrink-0" ref={menuRef}>
                <button
                  onClick={() =>
                    setShowUserMenu((prev) => !prev)
                  }
                  className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200 max-w-full"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-semibold shadow-sm shrink-0">
                    {user?.passport_photo_url ? (
                      <img
                        src={user.passport_photo_url}
                        alt=""
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAvatarPopup(true);
                        }}
                      />
                    ) : (
                      user?.full_name?.charAt(0)?.toUpperCase() || (
                        <FaUser />
                      )
                    )}
                  </div>

                  {/* FIXED */}
                  <span className="hidden lg:block text-sm font-medium truncate max-w-[140px]">
                    {user?.full_name}
                  </span>

                  <FaChevronDown
                    className={`hidden lg:block text-xs transition-transform duration-200 ${
                      showUserMenu ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 z-50 mt-2 w-56 max-w-[90vw] bg-white rounded-2xl shadow-elevated-lg border border-gray-100 py-2 animate-scaleIn origin-top-right">
                    <div className="border-b border-gray-100 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-gray-900">{user?.full_name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {user?.email?.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) =>
                          `${first}${'*'.repeat(Math.min(middle.length, 4))}${domain}`
                        )}
                      </p>
                    </div>

                    <Link
                      to={roleDashboardPath}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-primary-50 hover:text-primary-700"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <FaTachometerAlt className="text-xs text-primary-500" />
                      <span className="flex-1">{t('header.dashboard')}</span>
                      {headerAttentionCount > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          {headerAttentionCount}
                        </span>
                      )}
                    </Link>

                    <Link
                      to="/profile"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-primary-50 hover:text-primary-700"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <FaUser className="text-xs text-primary-500" />
                      <span>{t('header.profile')}</span>
                    </Link>

                    <Link
                      to="/applications"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-primary-50 hover:text-primary-700"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <FaFileAlt className="text-xs text-primary-500" />
                      <span>{t('header.applications')}</span>
                    </Link>

                    <Link
                      to="/verification-status"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-primary-50 hover:text-primary-700"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <FaIdCard className="text-xs text-primary-500" />
                      <span>{t('header.verification')}</span>
                    </Link>

                    <div className="mt-1 border-t border-gray-100 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 transition-colors duration-150 hover:bg-red-50"
                      >
                        <FaSignOutAlt className="text-xs" />
                        <span>{t('header.logout')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {selectedNotification && (
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
                  onClick={() => setSelectedNotification(null)}
                >
                  <div
                    className="w-full max-w-lg animate-scaleIn rounded-2xl border border-gray-100 bg-white shadow-elevated-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                      <h3 className="min-w-0 pr-3 text-base font-semibold text-gray-900">
                        {selectedNotification.title}
                      </h3>
                      <button
                        onClick={() => setSelectedNotification(null)}
                        className="text-xl leading-none text-gray-400 hover:text-gray-600"
                        aria-label="Close notification"
                      >
                        &times;
                      </button>
                    </div>

                    <div className="px-6 py-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                        {selectedNotification.message}
                      </p>
                      <p className="mt-4 text-xs text-gray-400">
                        {new Date(selectedNotification.created_at).toLocaleDateString(undefined, {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    {selectedNotification.link && (
                      <div className="flex justify-center border-t border-gray-100 px-6 py-4">
                        <Link
                          to={selectedNotification.link}
                          onClick={() => {
                            setSelectedNotification(null);
                            setShowNotifications(false);
                          }}
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

              {showAvatarPopup && user?.passport_photo_url && (
                <div
                  className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
                  onClick={() => setShowAvatarPopup(false)}
                >
                  <div
                    className="relative w-full max-w-xl animate-scaleIn"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setShowAvatarPopup(false)}
                      className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg leading-none text-gray-600 shadow-md hover:text-gray-800"
                      aria-label="Close avatar preview"
                    >
                      &times;
                    </button>
                    <img
                      src={user.passport_photo_url}
                      alt="Profile"
                      className="h-auto w-full rounded-2xl border-4 border-white shadow-2xl"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* FIXED */
            <div className="hidden items-center gap-2 sm:flex md:gap-3 shrink-0">
              <Link
                to="/login"
                className="px-3 md:px-4 py-2 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 rounded-xl transition-all duration-200 whitespace-nowrap"
              >
                {t('header.login')}
              </Link>

              <Link
                to="/register"
                onClick={handleRegisterNavigation}
                className="px-4 md:px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 whitespace-nowrap"
              >
                {t('header.register')}
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200 shrink-0"
            aria-label={t('header.toggle_mobile_menu')}
          >
            {mobileMenuOpen ? (
              <FaTimes className="text-lg" />
            ) : (
              <FaBars className="text-lg" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen
            ? 'max-h-96 opacity-100 pb-4'
            : 'max-h-0 opacity-0'
        }`}
      >
        <div className="flex flex-col space-y-1 border-t border-gray-100 pt-3">
                    <MobileNavLink
                      to="/properties"
                      label={t('header.browse')}
                      onClick={closeMobileMenu}
                    />

                    <MobileNavLink
                      to="/list-property"
                      label={t('footer.list')}
                      onClick={closeMobileMenu}
                    />

                    <MobileNavLink
                      to="/about"
                      label={t('footer.about_us')}
                      onClick={closeMobileMenu}
                    />

          <MobileNavLink
            to="/verify-case"
            label={t('Verify Evidence')}
            onClick={closeMobileMenu}
          />

          {isAuthenticated &&
            ['landlord', 'agent'].includes(user?.user_type) && (
              <MobileNavLink
                to="/my-properties"
                label={t('header.my_properties')}
                onClick={closeMobileMenu}
              />
            )}

          {isAuthenticated &&
            user?.user_type === 'tenant' && (
              <MobileNavLink
                to="/saved-properties"
                label={t('header.saved')}
                onClick={closeMobileMenu}
              />
            )}

          {isAuthenticated && (
            <MobileNavLink
              to={roleDashboardPath}
              label={t('header.dashboard')}
              onClick={closeMobileMenu}
            />
          )}

          {!isAuthenticated && (
            <>
              <MobileNavLink
                to="/login"
                label={t('header.login')}
                onClick={closeMobileMenu}
              />

              <MobileNavLink
                to="/register"
                label={t('header.register')}
                onClick={handleRegisterNavigation}
              />
            </>
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

const MobileNavLink = ({ to, label, onClick }) => (
  <Link to={to} onClick={onClick} className="px-4 py-3 text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200">
    {label}
  </Link>
);

export default Header;
