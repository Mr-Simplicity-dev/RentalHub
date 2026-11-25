import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaHeadphones,
  FaPhoneAlt,
  FaComments,
  FaSearch,
  FaTimes,
  FaSyncAlt,
  FaUserTie,
  FaUsers,
  FaCircle,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';

const SUPER_ADMIN_TABS = [
  { id: 'all', label: 'All' },
  { id: 'admin', label: 'Admins' },
  { id: 'landlord', label: 'Landlords' },
  { id: 'tenant', label: 'Tenants' },
  { id: 'agent', label: 'Agents' },
  { id: 'marketing_agent', label: 'Marketing' },
  { id: 'lawyer', label: 'Lawyers' },
];

const inferFallbackPolicy = (user) => {
  const role = String(user?.user_type || '').trim().toLowerCase();
  if (role === 'super_admin') {
    return {
      role,
      mode: 'platform_all',
      canChatSupport: false,
      canCallSupport: false,
      canCallBoss: false,
      canCallSubordinates: true,
      canCallAnyone: true,
    };
  }
  if (role === 'tenant' || role === 'landlord') {
    return {
      role,
      mode: 'support_only',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: false,
      canCallSubordinates: false,
      canCallAnyone: false,
    };
  }
  if (role === 'agent' || role === 'marketing_agent') {
    return {
      role,
      mode: 'support_and_boss',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: true,
      canCallSubordinates: false,
      canCallAnyone: false,
    };
  }
  if (
    role.startsWith('super_') ||
    role.startsWith('zonal_') ||
    role.startsWith('state_') ||
    role === 'financial_admin' ||
    role === 'recruitment_admin'
  ) {
    return {
      role,
      mode: 'admin_subordinates',
      canChatSupport: false,
      canCallSupport: false,
      canCallBoss: true,
      canCallSubordinates: true,
      canCallAnyone: false,
    };
  }
  return {
    role,
    mode: 'boss_and_support',
    canChatSupport: true,
    canCallSupport: true,
    canCallBoss: true,
    canCallSubordinates: false,
    canCallAnyone: false,
  };
};

const getInitials = (name) => {
  const parts = String(name || 'U')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const formatTerritory = (contact) => {
  const pieces = [contact?.assigned_lga, contact?.assigned_state, contact?.assigned_zone]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return pieces.join(' • ');
};

const HeadphoneSupportButton = ({ compact = false, className = '' }) => {
  const { user, isAuthenticated } = useAuth();
  const { connected, startCall, startSupportCall } = useSocket();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [policy, setPolicy] = useState(() => inferFallbackPolicy(user));
  const [contacts, setContacts] = useState([]);
  const [supportOnlineCount, setSupportOnlineCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [callingId, setCallingId] = useState(null);
  const [supportNoAgentMessage, setSupportNoAgentMessage] = useState('');

  const containerRef = useRef(null);

  useEffect(() => {
    setPolicy(inferFallbackPolicy(user));
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const isDirectoryModal =
    policy?.mode === 'platform_all' || policy?.mode === 'admin_subordinates';

  const loadDirectory = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (debouncedSearch) params.q = debouncedSearch;
      if (roleFilter && roleFilter !== 'all') params.role = roleFilter;
      if (onlineOnly) params.onlineOnly = 'true';
      const res = await api.get('/calls/directory', { params });
      const payload = res?.data?.data || {};
      if (payload.policy) {
        setPolicy(payload.policy);
      }
      setContacts(Array.isArray(payload.contacts) ? payload.contacts : []);
      setSupportOnlineCount(Number(payload.supportOnlineCount || 0));
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load call options right now.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, debouncedSearch, roleFilter, onlineOnly]);

  useEffect(() => {
    if (!open) return;
    loadDirectory();
  }, [open, loadDirectory]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handleClickOutside = (event) => {
      if (!isDirectoryModal && containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, isDirectoryModal]);

  const buttonMeta = useMemo(() => {
    switch (policy?.mode) {
      case 'platform_all':
        return {
          label: 'Call Platform Users',
          title: 'Call any Tenant, Landlord, Agent, Lawyer, or Admin',
        };
      case 'admin_subordinates':
        return {
          label: 'Call Team & Admins',
          title: 'Call admins and team members below you',
        };
      case 'support_and_boss':
      case 'boss_and_support':
        return {
          label: 'Support & Call Supervisor',
          title: 'Contact Support (Chat or Call) or call your supervisor',
        };
      default:
        return {
          label: 'Contact Support',
          title: 'Contact Support by Chat or Call',
        };
    }
  }, [policy?.mode]);

  if (!isAuthenticated || !user) return null;

  const handleChatSupport = () => {
    setOpen(false);
    setSupportNoAgentMessage('');
    navigate('/support');
  };

  const handleCallSupport = async () => {
    setSupportNoAgentMessage('');
    if (!connected) {
      toast.error('Realtime voice connection is still connecting. Please try again in a moment.');
      return;
    }
    setCallingId('support');
    try {
      const result = await startSupportCall();
      if (result?.success) {
        setOpen(false);
      } else if (result?.code === 'NO_AGENT') {
        setSupportNoAgentMessage(
          result?.message ||
            'All support agents are currently busy or offline. You can reach Support via live chat.'
        );
      }
    } finally {
      setCallingId(null);
    }
  };

  const handleDirectCall = async (contact) => {
    if (!contact?.id) return;
    if (!connected) {
      toast.error('Realtime voice connection is still connecting. Please try again in a moment.');
      return;
    }
    setCallingId(contact.id);
    try {
      const result = await startCall({
        receiverId: contact.id,
        callType: 'audio',
        propertyTitle: `${contact.full_name || 'Direct Call'} (${contact.role_label || contact.user_type || ''})`,
      });
      if (result?.success) {
        setOpen(false);
      }
    } finally {
      setCallingId(null);
    }
  };

  const bossContacts = contacts.filter((c) => c.relation === 'boss');

  const adminTabs = useMemo(() => {
    if (policy?.mode === 'platform_all') return SUPER_ADMIN_TABS;
    const tabs = [
      { id: 'all', label: 'All' },
      { id: 'subordinate', label: 'Team Below Me' },
    ];
    if (policy?.canCallBoss) {
      tabs.push({ id: 'boss', label: 'My Supervisor' });
    }
    return tabs;
  }, [policy?.mode, policy?.canCallBoss]);

  return (
    <div className={`relative shrink-0 ${className}`} ref={containerRef}>
      <button
        type="button"
        data-testid="headphone-support-button"
        onClick={() => {
          setSupportNoAgentMessage('');
          setOpen((prev) => !prev);
        }}
        title={buttonMeta.title}
        aria-label={buttonMeta.label}
        aria-expanded={open}
        className={`relative rounded-xl text-slate-600 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200 ${
          compact ? 'p-2' : 'p-2.5'
        } ${open ? 'bg-primary-50 text-primary-600' : ''}`}
      >
        <FaHeadphones className={compact ? 'text-base' : 'text-lg'} />
        {connected && (
          <span
            className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Popover for Tenant, Landlord, Agent, Marketing Agent, and bottom-tier LGA Admins */}
      {open && !isDirectoryModal && (
        <div
          role="dialog"
          aria-label={buttonMeta.label}
          data-testid="headphone-support-popover"
          className="fixed left-3 right-3 top-16 z-50 mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-w-none"
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <FaHeadphones />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {policy?.canCallBoss ? 'Support & Supervisor' : 'Contact Support'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {supportOnlineCount > 0
                    ? `${supportOnlineCount} support ${supportOnlineCount === 1 ? 'agent' : 'agents'} online`
                    : 'Chat or call our support desk'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <FaTimes className="text-xs" />
            </button>
          </div>

          {/* Support Chat + Call Actions */}
          {(policy?.canChatSupport || policy?.canCallSupport) && (
            <div className="space-y-2">
              {policy?.canChatSupport && (
                <button
                  type="button"
                  data-testid="support-chat-action"
                  onClick={handleChatSupport}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left transition hover:border-primary-300 hover:bg-primary-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <FaComments />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Chat with Support</p>
                    <p className="text-xs text-slate-500">Open live support chat & tickets</p>
                  </div>
                </button>
              )}

              {policy?.canCallSupport && (
                <button
                  type="button"
                  data-testid="support-call-action"
                  disabled={callingId === 'support'}
                  onClick={handleCallSupport}
                  className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-left transition hover:bg-emerald-100/70 disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                    <FaPhoneAlt className="text-xs" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {callingId === 'support' ? 'Connecting Call…' : 'Call Support'}
                    </p>
                    <p className="text-xs text-emerald-700">
                      {connected ? 'Start an instant voice call' : 'Connecting voice line…'}
                    </p>
                  </div>
                </button>
              )}

              {supportNoAgentMessage && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p>{supportNoAgentMessage}</p>
                  <button
                    type="button"
                    onClick={handleChatSupport}
                    className="mt-2 inline-flex items-center gap-1.5 font-semibold text-amber-900 underline"
                  >
                    <FaComments /> Switch to Support Chat
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Supervisor / Boss Section for Property Agents, Marketing Agents & LGA Admins */}
          {policy?.canCallBoss && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <FaUserTie className="text-indigo-500" /> Call Your Boss / Supervisor
                </p>
                <button
                  type="button"
                  onClick={loadDirectory}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Refresh supervisors"
                >
                  <FaSyncAlt className={`text-[11px] ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {error && (
                <p className="mb-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">{error}</p>
              )}

              {loading && bossContacts.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">Loading supervisors…</p>
              ) : bossContacts.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
                  No supervisor is linked to your account yet. You can reach Support above anytime.
                </p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
                  {bossContacts.map((boss) => (
                    <div
                      key={boss.id}
                      data-testid={`boss-contact-${boss.id}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <FaCircle
                            className={`shrink-0 text-[8px] ${
                              boss.online ? 'text-emerald-500' : 'text-slate-300'
                            }`}
                          />
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {boss.full_name}
                          </p>
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {boss.role_label}
                          {formatTerritory(boss) ? ` • ${formatTerritory(boss)}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={callingId === boss.id}
                        onClick={() => handleDirectCall(boss)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                      >
                        <FaPhoneAlt className="text-[10px]" />
                        {callingId === boss.id ? 'Calling…' : 'Call'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Centered Call Directory Modal for National/Senior Admins & Super Admin */}
      {open && isDirectoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={buttonMeta.label}
            data-testid="headphone-call-directory-modal"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <FaHeadphones className="text-lg" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {policy?.mode === 'platform_all'
                      ? 'Platform Call Directory'
                      : 'Admin & Team Call Directory'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {policy?.mode === 'platform_all'
                      ? 'Call any Tenant, Landlord, Agent, Lawyer, or Admin on RentalHub'
                      : 'Call admins and team members below you in your command chain'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close directory"
              >
                <FaTimes />
              </button>
            </div>

            {/* Search & Filters */}
            <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, role, state, or LGA…"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={onlineOnly}
                    onChange={(e) => setOnlineOnly(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Online only
                </label>
                <button
                  type="button"
                  onClick={loadDirectory}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <FaSyncAlt className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              {/* Role Filter Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {adminTabs.map((tab) => {
                  const active = roleFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setRoleFilter(tab.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'bg-primary-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contacts List */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {error && (
                <div className="mb-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              {loading && contacts.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Loading callable directory…
                </div>
              ) : contacts.length === 0 ? (
                <div className="py-12 text-center">
                  <FaUsers className="mx-auto mb-2 text-2xl text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No matching users found</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Try clearing your search or turning off the Online only filter.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {contacts.map((contact) => {
                    const territory = formatTerritory(contact);
                    return (
                      <div
                        key={contact.id}
                        data-testid={`directory-contact-${contact.id}`}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                            {getInitials(contact.full_name)}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${
                                contact.online ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                              title={contact.online ? 'Online' : 'Offline'}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {contact.full_name}
                              </p>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                {contact.role_label}
                              </span>
                              {contact.relation === 'boss' && (
                                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                  Supervisor
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-slate-500">
                              {contact.online ? 'Online now' : 'Offline'}
                              {territory ? ` • ${territory}` : ''}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={callingId === contact.id}
                          onClick={() => handleDirectCall(contact)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <FaPhoneAlt className="text-[11px]" />
                          {callingId === contact.id ? 'Calling…' : 'Call'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeadphoneSupportButton;
