import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaBell,
  FaClipboardCheck,
  FaCopy,
  FaCheck,
  FaEnvelope,
  FaFileAlt,
  FaHome,
  FaMoneyBillWave,
  FaPhone,
  FaPlus,
  FaShareAlt,
  FaSignOutAlt,
  FaSyncAlt,
  FaTimes,
  FaUserCircle,
  FaWallet,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import HeadphoneSupportButton from '../../components/calls/HeadphoneSupportButton';

const formatNaira = (amount) => {
  const numeric = Number(amount || 0);
  return `₦${numeric.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const MarketingAgentDashboard = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Copy feedback
  const [copiedField, setCopiedField] = useState('');

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);

  // Respondent search filter
  const [respondentQuery, setRespondentQuery] = useState('');
  const [respondentStatus, setRespondentStatus] = useState('all');

  // Commission withdrawal modal
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    bank_name: '',
    account_number: '',
    account_name: '',
  });

  const loadNotifications = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        api.get('/notifications', { params: { limit: 10 } }),
        api.get('/notifications/unread/count'),
      ]);
      const items =
        listRes?.data?.data?.notifications ||
        listRes?.data?.notifications ||
        listRes?.data?.data ||
        [];
      setNotifications(Array.isArray(items) ? items : []);
      const count =
        countRes?.data?.data?.count ??
        countRes?.data?.count ??
        countRes?.data?.unreadCount ??
        0;
      setNotifUnreadCount(Number(count || 0));
    } catch {
      // Notification polling failures should not disrupt the dashboard
    }
  }, []);

  const loadDashboard = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const [overviewRes, inviteRes] = await Promise.allSettled([
        api.get('/survey/marketing-agent/overview'),
        api.get('/survey/marketing-agent/invite'),
      ]);

      if (overviewRes.status === 'fulfilled') {
        setData(overviewRes.value?.data?.data || null);
      } else {
        setError(
          overviewRes.reason?.response?.data?.message || 'Failed to load marketing dashboard overview'
        );
      }

      if (inviteRes.status === 'fulfilled') {
        setInvite(inviteRes.value?.data?.data || null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(false);
    loadNotifications();
  }, [loadDashboard, loadNotifications]);

  useEffect(() => {
    if (!showNotifications) return undefined;
    const handleOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showNotifications]);

  const markNotifAsRead = async (notifId) => {
    try {
      await api.patch(`/notifications/${notifId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
      setNotifUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore transient error
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCopy = async (value, field) => {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
      setCopiedField(field);
      toast.success(field === 'link' ? 'Invite link copied!' : 'Referral code copied!');
      setTimeout(() => setCopiedField(''), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const handleShareInvite = async () => {
    if (!invite?.invite_url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join RentalHub Nigeria',
          text: `Register on RentalHub with my agent referral code ${invite.referral_code || ''}`,
          url: invite.invite_url,
        });
        return;
      } catch {
        // user cancelled share sheet — fallback not needed
        return;
      }
    }
    handleCopy(invite.invite_url, 'link');
  };

  const stats = data?.stats || { captured: 0, in_progress: 0, with_email: 0, with_phone: 0 };
  const commissions = data?.commissions || {
    total_earned: 0,
    qualified_count: 0,
    reversed_count: 0,
    wallet_balance: 0,
    commissions: [],
  };

  const filteredResponses = useMemo(() => {
    const rows = Array.isArray(data?.responses) ? data.responses : [];
    const q = respondentQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (respondentStatus === 'completed' && !r.completed_at) return false;
      if (respondentStatus === 'draft' && r.completed_at) return false;
      if (!q) return true;
      return (
        String(r.respondent_name || '').toLowerCase().includes(q) ||
        String(r.respondent_code || '').toLowerCase().includes(q) ||
        String(r.respondent_phone || '').toLowerCase().includes(q) ||
        String(r.agent_lga || '').toLowerCase().includes(q)
      );
    });
  }, [data?.responses, respondentQuery, respondentStatus]);

  const handleWithdrawSubmit = async (event) => {
    event.preventDefault();
    setWithdrawError('');
    const numericAmount = Number(withdrawForm.amount);
    const available = Number(commissions.wallet_balance || 0);

    if (!Number.isFinite(numericAmount) || numericAmount < 1) {
      setWithdrawError('Enter a valid withdrawal amount greater than ₦0.');
      return;
    }
    if (numericAmount > available) {
      setWithdrawError(`Amount exceeds your available wallet balance (${formatNaira(available)}).`);
      return;
    }
    if (!withdrawForm.bank_name.trim()) {
      setWithdrawError('Please enter your bank name.');
      return;
    }
    if (!/^\d{10}$/.test(withdrawForm.account_number.trim())) {
      setWithdrawError('Account number must be exactly 10 digits.');
      return;
    }
    if (!withdrawForm.account_name.trim()) {
      setWithdrawError('Please enter the bank account name.');
      return;
    }

    setWithdrawSubmitting(true);
    try {
      await api.post('/payments/wallet/withdraw', {
        amount: numericAmount,
        bank_name: withdrawForm.bank_name.trim(),
        account_number: withdrawForm.account_number.trim(),
        account_name: withdrawForm.account_name.trim(),
      });
      toast.success('Withdrawal request submitted successfully!');
      setWithdrawOpen(false);
      setWithdrawForm({ amount: '', bank_name: '', account_number: '', account_name: '' });
      loadDashboard(true);
    } catch (err) {
      setWithdrawError(
        err?.response?.data?.message || 'Unable to submit withdrawal request right now.'
      );
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const territoryLabel = [user?.assigned_lga, user?.assigned_state].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dedicated Marketing Agent Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Brand */}
          <Link to="/marketing-agent/dashboard" className="flex min-w-0 items-center gap-2.5">
            <img
              src="/rentalhub-mark.svg"
              alt="RentalHub"
              className="h-9 w-9 shrink-0 rounded-xl object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">RentalHub</p>
              <p className="truncate text-[11px] font-medium text-emerald-700">
                Marketing Agent Workspace
              </p>
            </div>
          </Link>

          {/* Core Agent Navigation Links */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Marketing Agent navigation">
            <Link
              to="/properties"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-primary-50 hover:text-primary-700"
            >
              <FaHome className="text-primary-600" /> Property Market
            </Link>
            <Link
              to="/messages"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-primary-50 hover:text-primary-700"
            >
              <FaEnvelope className="text-slate-500" /> Messages
            </Link>
            <Link
              to="/profile"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-primary-50 hover:text-primary-700"
            >
              <FaUserCircle className="text-slate-500" /> Profile
            </Link>
          </nav>

          {/* Utility Controls: Headphone right beside Notification Bell + Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Mobile Property Market shortcut */}
            <Link
              to="/properties"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:hidden"
              aria-label="Property Market"
            >
              <FaHome className="text-primary-600" />
              <span className="hidden xs:inline">Market</span>
            </Link>

            {/* Headphone icon right beside Notification Bell */}
            <HeadphoneSupportButton />

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                data-testid="marketing-notifications-button"
                onClick={() => setShowNotifications((prev) => !prev)}
                className="relative rounded-xl p-2.5 text-slate-600 transition hover:bg-primary-50 hover:text-primary-600"
                aria-label={t('header.notifications', 'Notifications')}
              >
                <FaBell className="text-lg" />
                {notifUnreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {notifUnreadCount > 99 ? '99+' : notifUnreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="fixed left-3 right-3 top-16 z-50 mx-auto flex max-h-[70vh] max-w-sm flex-col rounded-2xl border border-slate-200 bg-white py-2 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-88 sm:max-w-none">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                    <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Close notifications"
                    >
                      <FaTimes className="text-xs" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <FaBell className="mx-auto mb-2 text-2xl text-slate-300" />
                        <p className="text-sm text-slate-500">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={() => {
                            if (!notif.is_read) markNotifAsRead(notif.id);
                          }}
                          className={`block w-full border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                            !notif.is_read ? 'bg-primary-50/40' : ''
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900">
                            {notif.title || 'Update'}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                            {notif.message || notif.body || ''}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Logout Button */}
            <button
              type="button"
              data-testid="marketing-logout-button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 sm:text-sm"
            >
              <FaSignOutAlt />
              <span className="hidden sm:inline">{t('common.logout', 'Logout')}</span>
            </button>
          </div>
        </div>

        {/* Mobile Quick Links Bar */}
        <div className="flex items-center justify-around border-t border-slate-100 bg-slate-50/80 px-2 py-1.5 text-xs font-semibold text-slate-700 md:hidden">
          <Link to="/properties" className="inline-flex items-center gap-1.5 px-2 py-1 hover:text-primary-700">
            <FaHome /> Property Market
          </Link>
          <Link to="/messages" className="inline-flex items-center gap-1.5 px-2 py-1 hover:text-primary-700">
            <FaEnvelope /> Messages
          </Link>
          <Link to="/profile" className="inline-flex items-center gap-1.5 px-2 py-1 hover:text-primary-700">
            <FaUserCircle /> Profile
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Welcome & Primary CTA */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t('marketing_agent.title', 'Marketing Agent Dashboard')}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t(
                'marketing_agent.subtitle',
                'Welcome, {{name}}. Conduct field surveys, share your invite link, and track your commissions.',
                { name: user?.full_name || 'Agent' }
              )}
              {territoryLabel ? ` • ${territoryLabel}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
            >
              <FaSyncAlt className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/survey?agent=1')}
              className="marketing-agent-conduct-button inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <FaPlus /> {t('marketing_agent.conduct', 'Conduct Survey')}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Loading your workspace…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Commission Wallet + Referral Invite Row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Commission Wallet Card */}
              <section className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-sm lg:col-span-5">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-100">
                      <FaWallet /> Commission Wallet
                    </p>
                    <span className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold">
                      {commissions.qualified_count || 0} qualified
                    </span>
                  </div>
                  <p
                    data-testid="marketing-wallet-balance"
                    className="mt-3 text-3xl font-extrabold tracking-tight"
                  >
                    {formatNaira(commissions.wallet_balance)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-emerald-100">
                    <span>
                      Total Earned:{' '}
                      <strong className="text-white">{formatNaira(commissions.total_earned)}</strong>
                    </span>
                    <span>
                      Reversed:{' '}
                      <strong className="text-white">{commissions.reversed_count || 0}</strong>
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    data-testid="withdraw-commission-button"
                    onClick={() => {
                      setWithdrawError('');
                      setWithdrawOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-emerald-800 shadow-xs transition hover:bg-emerald-50"
                  >
                    <FaMoneyBillWave /> Withdraw Commission
                  </button>
                </div>
              </section>

              {/* Referral & Invite Link Card */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Your Agent Referral & Signup Link
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Share this link with landlords and tenants. Accounts created through it are
                      credited to you automatically.
                    </p>
                  </div>
                  {invite?.referral_code && (
                    <button
                      type="button"
                      onClick={() => handleCopy(invite.referral_code, 'code')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-mono text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      {copiedField === 'code' ? <FaCheck /> : <FaCopy />}
                      {invite.referral_code}
                    </button>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    readOnly
                    data-testid="marketing-invite-url"
                    value={invite?.invite_url || 'Invite link unavailable right now'}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-700 outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!invite?.invite_url}
                      onClick={() => handleCopy(invite?.invite_url, 'link')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      {copiedField === 'link' ? <FaCheck /> : <FaCopy />}
                      {copiedField === 'link' ? 'Copied' : 'Copy Link'}
                    </button>
                    <button
                      type="button"
                      disabled={!invite?.invite_url}
                      onClick={handleShareInvite}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      <FaShareAlt /> Share
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* Survey Stats Grid */}
            <section
              className="marketing-agent-stats-section grid grid-cols-2 gap-4 sm:grid-cols-4"
              data-tour-id="stat-grid"
            >
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                  <FaClipboardCheck className="text-emerald-500" />{' '}
                  {t('marketing_agent.captured', 'Captured')}
                </p>
                <p className="mt-1.5 text-2xl font-bold text-slate-900">{stats.captured}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                  <FaFileAlt className="text-amber-500" />{' '}
                  {t('marketing_agent.in_progress', 'In progress')}
                </p>
                <p className="mt-1.5 text-2xl font-bold text-slate-900">{stats.in_progress}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                  <FaEnvelope className="text-blue-500" />{' '}
                  {t('marketing_agent.with_email', 'With email')}
                </p>
                <p className="mt-1.5 text-2xl font-bold text-slate-900">{stats.with_email}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                  <FaPhone className="text-purple-500" />{' '}
                  {t('marketing_agent.with_phone', 'With phone')}
                </p>
                <p className="mt-1.5 text-2xl font-bold text-slate-900">{stats.with_phone}</p>
              </div>
            </section>

            {/* Responses by LGA Chart */}
            {data?.by_lga?.length > 0 && (
              <section className="marketing-agent-lga-chart rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <p className="mb-3 text-sm font-bold text-slate-800">
                  {t('marketing_agent.by_lga', 'Responses by LGA')}
                </p>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={data.by_lga}>
                    <XAxis dataKey="lga" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            )}

            {/* Commission History Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <h2 className="text-sm font-bold text-slate-800">Commission History</h2>
                <span className="text-xs font-medium text-slate-500">
                  {(commissions.commissions || []).length} records
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Referred User
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Account Type
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Stage
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Amount
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Status
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(commissions.commissions || []).map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {c.new_user_name || '—'}
                        </td>
                        <td className="px-4 py-2.5 capitalize text-slate-600">
                          {c.account_type || '—'}
                        </td>
                        <td className="px-4 py-2.5 capitalize text-slate-600">
                          {String(c.stage || '—').replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-emerald-700">
                          {formatNaira(c.amount)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${
                              c.status === 'qualified'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {c.status || 'pending'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {formatDate(c.qualified_at)}
                        </td>
                      </tr>
                    ))}
                    {!(commissions.commissions || []).length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                          No commission payouts yet. Share your referral link above to start earning.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Captured Respondents Table */}
            <section className="marketing-agent-responses-table overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <h2 className="text-sm font-bold text-slate-800">
                  {t('marketing_agent.my_responses', 'My captured respondents')}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={respondentQuery}
                    onChange={(e) => setRespondentQuery(e.target.value)}
                    placeholder="Filter by name, code, phone, LGA…"
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-primary-500"
                  />
                  <select
                    value={respondentStatus}
                    onChange={(e) => setRespondentStatus(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none"
                  >
                    <option value="all">All statuses</option>
                    <option value="completed">Completed</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Code
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Type
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Respondent
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Phone
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        LGA
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredResponses.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                          {r.respondent_code}
                        </td>
                        <td className="px-4 py-2.5 capitalize text-slate-600">{r.survey_type}</td>
                        <td className="px-4 py-2.5 text-slate-800">{r.respondent_name || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{r.respondent_phone || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{r.agent_lga || '—'}</td>
                        <td className="px-4 py-2.5">
                          {r.completed_at ? (
                            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              Completed
                            </span>
                          ) : (
                            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              Draft
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredResponses.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                          {t(
                            'marketing_agent.no_responses',
                            'No surveys captured yet. Click "Conduct Survey" to start.'
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Commission Withdrawal Modal */}
      {withdrawOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          onClick={() => !withdrawSubmitting && setWithdrawOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Withdraw Commission"
            data-testid="withdraw-commission-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Withdraw Commission</h2>
                <p className="text-xs text-slate-500">
                  Available balance: <strong>{formatNaira(commissions.wallet_balance)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => !withdrawSubmitting && setWithdrawOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close modal"
              >
                <FaTimes />
              </button>
            </div>

            {withdrawError && (
              <div className="mb-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                {withdrawError}
              </div>
            )}

            <form onSubmit={handleWithdrawSubmit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Amount (₦)
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={withdrawForm.amount}
                  onChange={(e) => setWithdrawForm((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="e.g. 5000"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Bank Name</label>
                <input
                  type="text"
                  required
                  value={withdrawForm.bank_name}
                  onChange={(e) =>
                    setWithdrawForm((prev) => ({ ...prev, bank_name: e.target.value }))
                  }
                  placeholder="e.g. GTBank, Zenith Bank, Access Bank"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Account Number (10 digits)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  value={withdrawForm.account_number}
                  onChange={(e) =>
                    setWithdrawForm((prev) => ({
                      ...prev,
                      account_number: e.target.value.replace(/\D/g, '').slice(0, 10),
                    }))
                  }
                  placeholder="0123456789"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={withdrawForm.account_name}
                  onChange={(e) =>
                    setWithdrawForm((prev) => ({ ...prev, account_name: e.target.value }))
                  }
                  placeholder="Full name on bank account"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={withdrawSubmitting}
                  onClick={() => setWithdrawOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={withdrawSubmitting}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {withdrawSubmitting ? 'Submitting…' : 'Submit Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingAgentDashboard;
