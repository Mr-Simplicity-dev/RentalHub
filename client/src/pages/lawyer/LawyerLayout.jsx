import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  FaBalanceScale,
  FaBars,
  FaCheckCircle,
  FaEnvelope,
  FaIdCard,
  FaSignOutAlt,
  FaTachometerAlt,
  FaTimes,
  FaUserCircle,
} from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';

const ROLE_CONFIG = {
  lawyer: {
    title: 'LGA Lawyer Workspace',
    subtitle: 'Local-government legal review, disputes, evidence, and case-note coordination',
    homePath: '/lawyer',
    dashboardLabel: 'LGA Lawyer Dashboard',
    gradient: 'from-sky-700 via-sky-600 to-cyan-600',
    softPanel: 'bg-sky-50 border-sky-200 text-sky-800',
  },
  state_lawyer: {
    title: 'State Lawyer Workspace',
    subtitle: 'Assigned-state legal review and dispute operations',
    homePath: '/lawyer/state',
    dashboardLabel: 'State Lawyer Dashboard',
    gradient: 'from-emerald-700 via-emerald-600 to-teal-600',
    softPanel: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  super_lawyer: {
    title: 'Super Lawyer Workspace',
    subtitle: 'Cross-state review and escalated legal coordination',
    homePath: '/lawyer/super',
    dashboardLabel: 'Super Lawyer Dashboard',
    gradient: 'from-slate-900 via-slate-800 to-indigo-900',
    softPanel: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  },
};

const LawyerLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = String(user?.user_type || 'lawyer').trim().toLowerCase();
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.lawyer;

  const menuItems = useMemo(
    () => [
      {
        to: config.homePath,
        label: config.dashboardLabel,
        icon: FaTachometerAlt,
        end: true,
      },
      {
        to: '/verify-case',
        label: 'Verify Evidence',
        icon: FaCheckCircle,
      },
      {
        to: '/messages',
        label: 'Messages',
        icon: FaEnvelope,
      },
      {
        to: '/lawyers',
        label: 'Public Directory',
        icon: FaBalanceScale,
      },
      {
        to: '/verification-status',
        label: 'Verification Status',
        icon: FaIdCard,
      },
      {
        to: '/profile',
        label: 'Profile',
        icon: FaUserCircle,
      },
    ],
    [config.dashboardLabel, config.homePath]
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClassName = ({ isActive }) =>
    `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
      isActive
        ? `bg-gradient-to-r ${config.gradient} text-white shadow-lg`
        : 'text-slate-700 hover:bg-slate-100'
    }`;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className={`rounded-b-[28px] bg-gradient-to-r ${config.gradient} px-5 py-6 text-white`}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Legal Console</p>
        <h2 className="mt-2 text-2xl font-bold">{config.title}</h2>
        <p className="mt-2 text-sm text-white/80">{config.subtitle}</p>

        <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
          <p className="text-sm font-semibold">{user?.full_name || 'Lawyer'}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/70">
            {role === 'lawyer' ? 'LGA Lawyer' : String(role || 'lawyer').replace(/_/g, ' ')}
          </p>
          {user?.assigned_state ? (
            <div className="mt-3 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              Scope: {user.assigned_state}{user.assigned_city ? `, ${user.assigned_city}` : ''}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className={`rounded-2xl border px-4 py-3 text-sm ${config.softPanel}`}>
          This menu is separate from `AdminLayout` so lawyer routing and logic stay unchanged.
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
                onClick={() => setMobileMenuOpen(false)}
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
          Logout
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lawyer Menu</p>
              <p className="text-sm font-semibold text-slate-900">{config.title}</p>
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

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default LawyerLayout;
