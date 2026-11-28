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
  FaHistory,
  FaPhoneSlash,
  FaArrowDown,
  FaArrowUp,
  FaChevronDown,
  FaChevronUp,
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

const HISTORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'missed', label: 'Missed' },
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
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
      canCallTeammates: false,
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
      canCallTeammates: false,
      canCallSubordinates: false,
      canCallAnyone: false,
    };
  }
  if (role === 'marketing_agent') {
    return {
      role,
      mode: 'support_and_boss',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: true,
      canCallTeammates: true,
      canCallSubordinates: false,
      canCallAnyone: false,
    };
  }
  if (role === 'agent') {
    return {
      role,
      mode: 'support_and_boss',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: true,
      canCallTeammates: false,
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
      canCallTeammates: false,
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
    canCallTeammates: false,
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

const formatDuration = (seconds) => {
  const total = Math.max(0, Number(seconds) || 0);
  if (total <= 0) return '0s';
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-NG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getCallStatusBadge = (record) => {
  const status = String(record?.status || '').toLowerCase();
  if (status === 'missed') {
    return record?.direction === 'incoming'
      ? { label: 'Missed Call', className: 'bg-red-100 text-red-700 border-red-200' }
      : { label: 'No Answer (Missed)', className: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  if (status === 'rejected') {
    return { label: 'Declined', className: 'bg-rose-100 text-rose-700 border-rose-200' };
  }
  if (status === 'ended' || status === 'accepted') {
    return { label: 'Completed', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }
  if (status === 'ringing') {
    return { label: 'Ringing', className: 'bg-blue-100 text-blue-700 border-blue-200' };
  }
  return { label: 'Failed', className: 'bg-slate-100 text-slate-600 border-slate-200' };
};

const HeadphoneSupportButton = ({ compact = false, className = '' }) => {
  const { user, isAuthenticated } = useAuth();
  const { connected, startCall, startSupportCall } = useSocket();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState('contacts'); // 'contacts' | 'records'
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

  // Call records & missed calls state
  const [historyFilter, setHistoryFilter] = useState('all');
  const [callRecords, setCallRecords] = useState([]);
  const [historySummary, setHistorySummary] = useState({
    total_count: 0,
    missed_count: 0,
    incoming_missed_count: 0,
    answered_count: 0,
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [expandedRecordId, setExpandedRecordId] = useState(null);

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

  const loadCallHistory = useCallback(
    async (filterOverride) => {
      if (!isAuthenticated || !user?.id) return;
      const targetFilter = filterOverride || historyFilter || 'all';
      setHistoryLoading(true);
      setHistoryError('');
      try {
        const res = await api.get('/calls/history', {
          params: { filter: targetFilter, limit: 40 },
        });
        const payload = res?.data?.data || {};
        await api.patch('/calls/history/viewed');
        if (Array.isArray(payload.records)) {
          setCallRecords(payload.records);
        } else {
          setCallRecords([]);
        }
        setHistorySummary((previous) => ({
          ...previous,
          ...payload.summary,
          incoming_unread_missed_count: 0,
        }));
      } catch (err) {
        setHistoryError(err?.response?.data?.message || 'Unable to load call records right now.');
      } finally {
        setHistoryLoading(false);
      }
    },
    [isAuthenticated, user?.id, historyFilter]
  );

  // Load lightweight call summary on login so missed call badge is visible immediately
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    api
      .get('/calls/history', { params: { filter: 'all', limit: 15 } })
      .then((res) => {
        const payload = res?.data?.data || {};
        if (payload.summary) setHistorySummary(payload.summary);
        if (Array.isArray(payload.records)) setCallRecords(payload.records);
      })
      .catch(() => {});
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!open) return;
    if (activeView === 'contacts') {
      loadDirectory();
    } else {
      loadCallHistory();
    }
  }, [open, activeView, loadDirectory, loadCallHistory]);

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
    if (policy?.role === 'marketing_agent') {
      return {
        label: 'Support, Marketing Team & Supervisor',
        title: 'Call Marketing teammates, supervisors, Support, or view call records',
      };
    }
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
          title: 'Contact Support (Chat or Call), call supervisor, or view call records',
        };
      default:
        return {
          label: 'Contact Support',
          title: 'Contact Support by Chat or Call, or view call records',
        };
    }
  }, [policy?.mode, policy?.role]);

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
  const teammateContacts = contacts.filter((c) => c.relation === 'teammate');
  const incomingMissedCount = Number(
    historySummary?.incoming_unread_missed_count ?? historySummary?.incoming_missed_count ?? 0
  );
  const totalMissedCount = Number(historySummary?.missed_count || 0);

  const renderCallRecordsBody = () => (
    <div className="space-y-3" data-testid="call-records-panel">
      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
          <p className="text-[11px] font-medium text-slate-500">Total</p>
          <p className="text-sm font-bold text-slate-900">{historySummary.total_count || 0}</p>
        </div>
        <div
          className={`rounded-xl border px-2.5 py-2 text-center ${
            totalMissedCount > 0
              ? 'border-red-200 bg-red-50'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <p className="text-[11px] font-medium text-red-600">Missed</p>
          <p className="text-sm font-bold text-red-700">{totalMissedCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-center">
          <p className="text-[11px] font-medium text-emerald-700">Answered</p>
          <p className="text-sm font-bold text-emerald-800">{historySummary.answered_count || 0}</p>
        </div>
      </div>

      {/* Filter Pills + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap gap-1">
          {HISTORY_FILTERS.map((f) => {
            const active = historyFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`call-history-filter-${f.id}`}
                onClick={() => {
                  setHistoryFilter(f.id);
                  loadCallHistory(f.id);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  active
                    ? f.id === 'missed'
                      ? 'bg-red-600 text-white'
                      : 'bg-primary-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
                {f.id === 'missed' && totalMissedCount > 0 ? ` (${totalMissedCount})` : ''}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => loadCallHistory()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          <FaSyncAlt className={historyLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {historyError && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {historyError}
        </div>
      )}

      {historyLoading && callRecords.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">Loading call records…</p>
      ) : callRecords.length === 0 ? (
        <div className="rounded-xl bg-slate-50 py-8 text-center">
          <FaHistory className="mx-auto mb-2 text-xl text-slate-300" />
          <p className="text-xs font-semibold text-slate-600">
            {historyFilter === 'missed' ? 'No missed calls recorded' : 'No call records yet'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Completed, declined, and missed calls will appear here with full details.
          </p>
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
          {callRecords.map((record) => {
            const badge = getCallStatusBadge(record);
            const isExpanded = expandedRecordId === record.id;
            const counterpart = record.counterpart || {};
            const callTypeLabel = record.is_support_call
              ? 'Support Voice'
              : record.call_type === 'video'
              ? 'Video Call'
              : 'Voice Call';
            const durationLabel = record.is_missed
              ? 'No answer'
              : record.duration_seconds > 0
              ? formatDuration(record.duration_seconds)
              : record.status === 'rejected'
              ? 'Declined'
              : '0s';

            return (
              <div
                key={record.id}
                data-testid={`call-record-${record.id}`}
                className={`rounded-xl border p-2.5 transition ${
                  record.is_missed_for_me
                    ? 'border-red-200 bg-red-50/60'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {record.is_missed ? (
                        <FaPhoneSlash className="shrink-0 text-xs text-red-600" />
                      ) : record.direction === 'incoming' ? (
                        <FaArrowDown className="shrink-0 text-[11px] text-emerald-600" />
                      ) : (
                        <FaArrowUp className="shrink-0 text-[11px] text-blue-600" />
                      )}
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {counterpart.full_name || 'Unknown User'}
                      </p>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">
                      {counterpart.role_label || 'User'} •{' '}
                      {record.direction === 'incoming' ? 'Incoming' : 'Outgoing'} {callTypeLabel}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {formatDateTime(record.requested_at)}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-700">
                        • {durationLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {record.can_call_back && counterpart.id && (
                      <button
                        type="button"
                        disabled={callingId === counterpart.id}
                        onClick={() => handleDirectCall(counterpart)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <FaPhoneAlt className="text-[9px]" />
                        {callingId === counterpart.id ? 'Calling…' : 'Call Back'}
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid={`call-record-details-toggle-${record.id}`}
                      onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Details {isExpanded ? <FaChevronUp className="text-[9px]" /> : <FaChevronDown className="text-[9px]" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    data-testid={`call-record-details-${record.id}`}
                    className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-slate-200/80 bg-slate-50 p-2 text-[11px]"
                  >
                    <div>
                      <span className="text-slate-400">Caller: </span>
                      <span className="font-semibold text-slate-800">
                        {record.caller?.full_name || 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Receiver: </span>
                      <span className="font-semibold text-slate-800">
                        {record.receiver?.full_name || 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Requested: </span>
                      <span className="font-medium text-slate-700">
                        {formatDateTime(record.requested_at)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Answered: </span>
                      <span className="font-medium text-slate-700">
                        {record.started_at ? formatDateTime(record.started_at) : 'Not answered'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Ended: </span>
                      <span className="font-medium text-slate-700">
                        {formatDateTime(record.ended_at)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Talk Duration: </span>
                      <span className="font-semibold text-slate-800">{durationLabel}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={() => {
          setSupportNoAgentMessage('');
          setOpen((prev) => !prev);
        }}
        title={buttonMeta.title}
        aria-label={buttonMeta.label}
        aria-expanded={open}
        data-testid="headphone-support-button"
        className={`relative inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          compact ? 'h-9 w-9' : 'h-10 w-10'
        }`}
      >
        <FaHeadphones className={compact ? 'text-base' : 'text-lg'} />
        {incomingMissedCount > 0 ? (
          <span
            data-testid="headphone-missed-badge"
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white"
            title={`${incomingMissedCount} missed call${incomingMissedCount === 1 ? '' : 's'}`}
          >
            {incomingMissedCount > 9 ? '9+' : incomingMissedCount}
          </span>
        ) : connected ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
            title="Voice calling online"
          />
        ) : null}
      </button>

      {/* Compact Popover for Tenants, Landlords, Agents, Marketing Agents & LGA Admins */}
      {open && !isDirectoryModal && (
        <div
          role="dialog"
          aria-label={buttonMeta.label}
          data-testid="headphone-support-popover"
          className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <FaHeadphones />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {policy?.role === 'marketing_agent'
                    ? 'Marketing Calls & Support'
                    : policy?.canCallBoss
                    ? 'Support & Supervisor'
                    : 'Contact Support'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {supportOnlineCount > 0
                    ? `${supportOnlineCount} support ${supportOnlineCount === 1 ? 'agent' : 'agents'} online`
                    : 'Chat anytime or call available contacts'}
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

          {/* Contacts vs Call Records Switcher */}
          <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              data-testid="headphone-tab-contacts"
              onClick={() => setActiveView('contacts')}
              className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                activeView === 'contacts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {policy?.canCallTeammates ? 'Call & Team' : 'Call & Support'}
            </button>
            <button
              type="button"
              data-testid="headphone-tab-records"
              onClick={() => setActiveView('records')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                activeView === 'records'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FaHistory className="text-[11px]" />
              Call Records
              {totalMissedCount > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {totalMissedCount}
                </span>
              )}
            </button>
          </div>

          {activeView === 'records' ? (
            renderCallRecordsBody()
          ) : (
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-0.5">
              {/* Support Actions */}
              {policy?.canChatSupport && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleChatSupport}
                    data-testid="support-chat-action"
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left transition hover:border-primary-300 hover:bg-primary-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
                      <FaComments className="text-xs" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">Chat with Support</p>
                      <p className="text-xs text-slate-500">Open live support messaging & tickets</p>
                    </div>
                  </button>

                  {policy?.canCallSupport && (
                    <button
                      type="button"
                      disabled={callingId === 'support'}
                      onClick={handleCallSupport}
                      data-testid="support-call-action"
                      className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-left transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <FaPhoneAlt className="text-xs" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-emerald-950">
                          {callingId === 'support' ? 'Connecting to Support…' : 'Call Support'}
                        </p>
                        <p className="text-xs text-emerald-700">
                          Start an instant in-app voice call
                        </p>
                      </div>
                    </button>
                  )}

                  {supportNoAgentMessage && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <p>{supportNoAgentMessage}</p>
                      <button
                        type="button"
                        onClick={handleChatSupport}
                        className="mt-2 font-semibold text-amber-950 underline"
                      >
                        Switch to Support Chat
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Marketing Team (Teammates) Section */}
              {policy?.canCallTeammates && (
                <div className="border-t border-slate-100 pt-3" data-testid="marketing-team-section">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                      <FaUsers className="text-emerald-600" />
                      Marketing Team ({teammateContacts.length})
                    </span>
                    <button
                      type="button"
                      onClick={loadDirectory}
                      className="text-xs font-medium text-primary-600 hover:underline"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="relative mb-2">
                    <FaSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search marketing teammate or state…"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none focus:border-primary-400 focus:bg-white"
                    />
                  </div>

                  {loading && teammateContacts.length === 0 ? (
                    <p className="py-3 text-center text-xs text-slate-400">
                      Loading marketing team…
                    </p>
                  ) : teammateContacts.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">
                      No other marketing agents found right now.
                    </p>
                  ) : (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                      {teammateContacts.map((member) => (
                        <div
                          key={member.id}
                          data-testid={`teammate-contact-${member.id}`}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <FaCircle
                                className={`shrink-0 text-[8px] ${
                                  member.online ? 'text-emerald-500' : 'text-slate-300'
                                }`}
                              />
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {member.full_name}
                              </p>
                            </div>
                            <p className="truncate text-[11px] text-slate-500">
                              {member.role_label || 'Marketing Agent'}
                              {formatTerritory(member) ? ` • ${formatTerritory(member)}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={callingId === member.id}
                            onClick={() => handleDirectCall(member)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <FaPhoneAlt className="text-[10px]" />
                            {callingId === member.id ? 'Calling…' : 'Call'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Supervising Boss Section */}
              {policy?.canCallBoss && (
                <div className="border-t border-slate-100 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <FaUserTie className="text-indigo-500" />
                      Call Your Boss / Supervisor
                    </span>
                    <button
                      type="button"
                      onClick={loadDirectory}
                      className="text-xs font-medium text-primary-600 hover:underline"
                    >
                      Refresh
                    </button>
                  </div>

                  {loading ? (
                    <p className="py-3 text-center text-xs text-slate-400">
                      Loading supervisors…
                    </p>
                  ) : error ? (
                    <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600">{error}</p>
                  ) : bossContacts.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">
                      No supervising admin or landlord is linked yet.
                    </p>
                  ) : (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                      {bossContacts.map((boss) => (
                        <div
                          key={boss.id}
                          data-testid={`boss-contact-${boss.id}`}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
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

            {/* Directory vs Call Records Switcher */}
            <div className="border-b border-slate-100 bg-white px-5 py-2.5">
              <div className="inline-grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  data-testid="headphone-tab-contacts"
                  onClick={() => setActiveView('contacts')}
                  className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                    activeView === 'contacts'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Directory
                </button>
                <button
                  type="button"
                  data-testid="headphone-tab-records"
                  onClick={() => setActiveView('records')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                    activeView === 'records'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FaHistory className="text-[11px]" />
                  Call Records
                  {totalMissedCount > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {totalMissedCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {activeView === 'records' ? (
              <div className="flex-1 overflow-y-auto px-5 py-4">{renderCallRecordsBody()}</div>
            ) : (
              <>
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
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {contact.full_name}
                                  </p>
                                  {contact.relation === 'boss' && (
                                    <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                      Supervisor
                                    </span>
                                  )}
                                </div>
                                <p className="truncate text-xs text-slate-500">
                                  {contact.role_label || contact.user_type}
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HeadphoneSupportButton;
