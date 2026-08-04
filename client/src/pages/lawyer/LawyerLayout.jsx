import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  FaGavel,
  FaBars,
  FaBell,
  FaCheckCircle,
  FaEnvelope,
  FaExclamationTriangle,
  FaHeadset,
  FaHome,
  FaIdCard,
  FaSignOutAlt,
  FaTachometerAlt,
  FaTimes,
  FaUserCircle,
} from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';

const ROLE_CONFIG = {
  lawyer: {
    homePath: '/lawyer',
    gradient: 'from-sky-700 via-sky-600 to-cyan-600',
    softPanel: 'bg-sky-50 border-sky-200 text-sky-800',
  },
  state_lawyer: {
    homePath: '/lawyer/state',
    gradient: 'from-emerald-700 via-emerald-600 to-teal-600',
    softPanel: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  super_lawyer: {
    homePath: '/lawyer/super',
    gradient: 'from-slate-900 via-slate-800 to-indigo-900',
    softPanel: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  },
};

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

const LAWYER_SUPPORTED_TYPES = ['message', 'case_update', 'verification', 'appeal', 'reminder', 'admin', 'system'];

const getNotificationAction = (link) => {
  if (!link) return { icon: FaIdCard, labelKey: 'take_action' };
  const l = link.toLowerCase();
  if (l.includes('/verification-status')) return { icon: FaIdCard, labelKey: 'verify_now' };
  if (l.includes('tab=verifications')) return { icon: FaCheckCircle, labelKey: 'review_submission' };
  if (l.includes('support') || l.includes('ticket') || l.includes('escalation')) return { icon: FaHeadset, labelKey: 'view_ticket' };
  if (l.includes('refund')) return { icon: FaExclamationTriangle, labelKey: 'view_refund' };
  if (l.includes('/dashboard')) return { icon: FaHome, labelKey: 'go_to_dashboard' };
  return { icon: FaIdCard, labelKey: 'take_action' };
};

const LawyerLayout = () => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const mainContentRef = useRef(null);
  const previousRouteRef = useRef('');

  const role = String(user?.user_type || 'lawyer').trim().toLowerCase();
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.lawyer;
  const roleTitle = t(`lawyer_layout.${role}.title`);
  const roleSubtitle = t(`lawyer_layout.${role}.subtitle`);
  const dashboardLabel = t(`lawyer_layout.${role}.dashboard_label`);
  const roleDisplayLabel = t(`lawyer_layout.${role}.role_label`);

  const menuItems = useMemo(
    () => [
      {
        to: config.homePath,
        label: dashboardLabel,
        icon: FaTachometerAlt,
        end: true,
      },
      {
        to: '/verify-case',
        label: t('lawyer_layout.verify_evidence'),
        icon: FaCheckCircle,
      },
      {
        to: '/messages',
        label: t('lawyer_layout.messages'),
        icon: FaEnvelope,
      },
      {
        to: '/legal-support',
        label: t('lawyer_layout.legal_support'),
        icon: FaGavel,
      },
      {
        to: '/verification-status',
        label: t('lawyer_layout.verification_status'),
        icon: FaIdCard,
      },
      {
        to: '/profile',
        label: t('lawyer_layout.profile'),
        icon: FaUserCircle,
      },
    ],
    [dashboardLabel, config.homePath, t]
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get('/notifications', { params: { limit: 10 } });
      if (res.data?.success) {
        setNotifications(res.data.data || []);
      }
    } catch {}
    try {
      const countRes = await api.get('/notifications/unread/count');
      if (countRes.data?.success) {
        setNotifUnreadCount(Number(countRes.data?.data?.unread_count || 0));
      }
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
    const intervalId = setInterval(fetchNotifications, 30000);
    return () => clearInterval(intervalId);
  }, [fetchNotifications]);

  const markNotifAsRead = async (notifId) => {
    try {
      await api.patch(`/notifications/${notifId}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n)));
      setNotifUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  useEffect(() => {
    const routeKey = `${location.pathname}${location.search}${location.hash}`;
    if (previousRouteRef.current === routeKey) return;

    previousRouteRef.current = routeKey;
    scrollDashboardToTarget(location.hash, mainContentRef.current);
  }, [location.hash, location.pathname, location.search]);

  const linkClassName = ({ isActive }) =>
    `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
      isActive
        ? `bg-gradient-to-r ${config.gradient} text-white shadow-lg`
        : 'text-slate-700 hover:bg-slate-100'
    }`;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className={`rounded-b-[28px] bg-gradient-to-r ${config.gradient} px-5 py-6 text-white`}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">{t('lawyer_layout.legal_console')}</p>
        <h2 className="mt-2 text-2xl font-bold">{roleTitle}</h2>
        <p className="mt-2 text-sm text-white/80">{roleSubtitle}</p>

        <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
          <p className="text-sm font-semibold">{user?.full_name || t('lawyer_layout.lawyer_fallback_name')}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/70">
            {roleDisplayLabel}
          </p>
          {user?.assigned_state ? (
            <div className="mt-3 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              {t('lawyer_layout.scope')}: {user.assigned_state}{user.assigned_city ? `, ${user.assigned_city}` : ''}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className={`rounded-2xl border px-4 py-3 text-sm ${config.softPanel}`}>
          {t('lawyer_layout.sidebar_notice')}
        </div>

        <nav className="mt-5 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={linkClassName}
                onClick={() => {
                  setMobileMenuOpen(false);
                  scrollDashboardToTarget('', mainContentRef.current);
                }}
              >
                <Icon className="text-base" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 px-4 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
        >
          <FaSignOutAlt />
          {t('lawyer_layout.logout')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="lg:hidden">
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('lawyer_layout.lawyer_menu')}</p>
              <p className="text-sm font-semibold text-slate-900">{roleTitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm"
                  aria-label="Notifications"
                >
                  <FaBell />
                  {notifUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                      {notifUnreadCount > 99 ? '99+' : notifUnreadCount}
                    </span>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((current) => !current)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm"
              >
                {mobileMenuOpen ? <FaTimes /> : <FaBars />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen ? (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileMenuOpen(false)}
                className="fixed inset-0 z-40 bg-black/40"
              />
              <motion.aside
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] overflow-hidden bg-white shadow-2xl"
              >
                {sidebarContent}
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex min-h-screen">
        <aside className="hidden w-80 shrink-0 overflow-hidden border-r border-slate-200 bg-white shadow-sm lg:block">
          {sidebarContent}
        </aside>

        <main ref={mainContentRef} className="min-w-0 flex-1 flex flex-col">
          <header className="sticky top-0 z-30 hidden items-center justify-end gap-4 border-b border-slate-200 bg-white/95 px-6 py-3 shadow-sm backdrop-blur lg:flex">
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative rounded-xl p-2.5 text-slate-600 hover:text-primary-600 hover:bg-primary-50 transition"
                aria-label="Notifications"
              >
                <FaBell className="text-lg" />
                {notifUnreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {notifUnreadCount > 99 ? '99+' : notifUnreadCount}
                  </span>
                )}
              </button>
            </div>
          </header>
          <div className="flex-1">
            <Outlet />
          </div>
        </main>
      </div>

      {showNotifications && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowNotifications(false)} />
          <div className="fixed left-2 right-2 top-16 z-50 max-h-[70vh] w-auto max-w-[calc(100vw-16px)] mx-auto flex-col rounded-2xl border border-slate-200 bg-white py-2 shadow-elevated-lg flex sm:left-auto sm:right-4 sm:top-16 sm:w-96 sm:mx-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <FaBell className="mx-auto mb-2 text-2xl text-slate-300" />
                  <p className="text-sm text-slate-500">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`cursor-pointer border-b border-slate-50 px-4 py-3 transition-colors hover:bg-slate-50 ${!notif.is_read ? 'bg-primary-50/40' : ''}`}
                    onClick={() => {
                      setSelectedNotification(notif);
                      if (!notif.is_read) markNotifAsRead(notif.id);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{notif.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-600">{notif.message}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(notif.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {!notif.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
                    </div>
                    {notif.link && (
                      <div className="mt-2 flex justify-end">
                        {(() => {
                          const action = getNotificationAction(notif.link);
                          const ActionIcon = action.icon;
                          return (
                            <Link
                              to={notif.link}
                              onClick={(e) => { e.stopPropagation(); setShowNotifications(false); }}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700"
                            >
                              <ActionIcon className="text-[10px]" />
                              {t(`header.${action.labelKey}`, 'Take Action')}
                            </Link>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {selectedNotification && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSelectedNotification(null)} />
          <div className="fixed left-4 right-4 top-1/2 z-50 max-h-[80vh] -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-2xl mx-auto max-w-md">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{selectedNotification.title}</h3>
              <button onClick={() => setSelectedNotification(null)} className="rounded-full p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <FaTimes />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selectedNotification.message}</p>
              <p className="mt-4 text-xs text-slate-400">
                {new Date(selectedNotification.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {selectedNotification.link && (
              <div className="flex justify-center border-t border-slate-100 px-6 py-4">
                {(() => {
                  const action = getNotificationAction(selectedNotification.link);
                  const ActionIcon = action.icon;
                  return (
                    <Link
                      to={selectedNotification.link}
                      onClick={() => { setSelectedNotification(null); setShowNotifications(false); }}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
                    >
                      <ActionIcon className="text-xs" />
                      {t(`header.${action.labelKey}`, 'Take Action')}
                    </Link>
                  );
                })()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default LawyerLayout;
