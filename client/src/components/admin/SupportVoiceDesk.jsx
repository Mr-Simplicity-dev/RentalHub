// ─────────────────────────────────────────────────────────────────────────────
// SupportVoiceDesk — internal Twilio browser calling workspace for the Super
// Support Admin dashboard. Complements the ticket workspace; tickets remain
// the source of truth for support work.
//
// Design rules:
//   - Nothing initializes Twilio or requests the microphone automatically.
//     The agent explicitly clicks "Go Available".
//   - State is never communicated by colour alone (always paired with text).
//   - An aria-live region announces incoming calls and connection changes.
//   - Keyboard: Enter answers, Escape declines, on the incoming-call card.
//   - prefers-reduced-motion is respected via motion-reduce utilities.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaPhoneAlt,
  FaPhoneSlash,
  FaMicrophone,
  FaMicrophoneSlash,
  FaHeadset,
  FaSpinner,
  FaExclamationTriangle,
  FaInbox,
  FaClipboardList,
  FaPowerOff,
  FaCheckCircle,
} from 'react-icons/fa';
import useTwilioVoice from '../../hooks/useTwilioVoice';
import { consultCall, fetchDepartments, transferCall } from '../../services/voiceApi';

// ── Local in-memory recent-calls adapter ────────────────────────────────────
// TODO(voice): replace with backend call events once the /voice/status
// call-status webhook exists (see docs/voice-system-backlog.md). This list
// intentionally lives in memory only and is reset on page reload.
const recentCalls = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_META = {
  offline: { label: 'Offline', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  connecting: { label: 'Connecting', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  ready: { label: 'Ready', tone: 'border-green-200 bg-green-50 text-green-700' },
  reconnecting: { label: 'Reconnecting', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  error: { label: 'Error', tone: 'border-red-200 bg-red-50 text-red-700' },
};

// ── Call-origin badges ───────────────────────────────────────────────────────
// The backend passes a sanitized `call_source` (and `caller_number`) as Twilio
// Client custom parameters. These labels are informational only — they never
// reveal raw SIP addresses, trunk details or account identifiers. Neutral
// hierarchy: Local = blue, International = violet, Unknown = gray.
const ORIGIN_META = {
  local_termii: {
    label: 'Local call',
    detail: 'Nigeria · Termii SIP',
    tone: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  toll_free: {
    label: 'Toll-free call',
    detail: 'Nigeria · Toll-free',
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  },
  international_twilio: {
    label: 'International call',
    detail: 'International · Twilio',
    tone: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  unknown: {
    label: 'Inbound call',
    detail: 'Route unavailable',
    tone: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

const getCallOrigin = (call) => {
  const source = call?.customParameters?.call_source || call?.parameters?.call_source || 'unknown';
  return ORIGIN_META[source] || ORIGIN_META.unknown;
};

const CallOriginBadge = ({ call }) => {
  const origin = getCallOrigin(call);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${origin.tone}`}
      title={origin.detail}
    >
      {origin.label}
      <span className="font-normal opacity-80">{origin.detail}</span>
    </span>
  );
};

const formatCaller = (call) => {
  // Prefer the backend-sanitized caller number (never a raw SIP URI).
  const sanitized = call?.customParameters?.caller_number || call?.parameters?.caller_number;
  if (sanitized) return sanitized;

  const from = call?.parameters?.From;
  if (!from) return 'Private number';

  const lower = String(from).toLowerCase();
  if (
    ['anonymous', 'private', 'unknown', 'blocked', 'restricted', 'client:support_agent_1'].includes(lower)
  ) {
    return 'Private number';
  }

  // Defense-in-depth: if anything untrusted sneaks through, surface only an
  // E.164-ish digit string — never SIP URIs or email-like identities.
  const digits = String(from).match(/\+?[0-9]{7,15}/);
  return digits ? digits[0] : 'Private number';
};

const formatElapsed = (startedAt) => {
  if (!startedAt) return '00:00';
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

// The agent's queue line is an outbound call to "queue:<name>". It reads as
// the active call while the agent is on duty; when a caller is bridged, the
// same leg carries the conversation (caller params are not exposed to the SDK
// for queue-bridged legs — see docs/voice-system-backlog.md).
const isQueueLine = (call) =>
  String(call?.parameters?.To || call?.customParameters?.To || '')
    .toLowerCase()
    .startsWith('queue:');

const SupportVoiceDesk = ({ tickets = [], onOpenTickets }) => {
  const {
    status,
    incomingCall,
    activeCall,
    inQueue,
    muted,
    error,
    goAvailable,
    goUnavailable,
    connectToQueue,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
  } = useTwilioVoice();

  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');

  // Department escalation state (warm transfer: consult → transfer).
  const [departments, setDepartments] = useState([]);
  const [escalateDept, setEscalateDept] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState('');
  const [consultState, setConsultState] = useState('idle'); // idle | ringing | connected

  // Timers for the ringing / active-call clocks.
  const [ringingStartedAt, setRingingStartedAt] = useState(null);
  const [callStartedAt, setCallStartedAt] = useState(null);

  const answerButtonRef = useRef(null);
  const lastDeclineAtRef = useRef(0);
  const lastAnnouncedStatusRef = useRef(status);
  const prevIncomingRef = useRef(null);
  const prevActiveRef = useRef(null);

  // Tick once per second while a call is ringing or active.
  useEffect(() => {
    if (!incomingCall && !activeCall) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [incomingCall, activeCall]);

  // Capture timestamps when calls arrive / are answered.
  useEffect(() => {
    if (incomingCall) setRingingStartedAt(Date.now());
  }, [incomingCall]);
  useEffect(() => {
    if (activeCall) setCallStartedAt(Date.now());
  }, [activeCall]);

  // Focus management: move focus to Answer when a call rings.
  useEffect(() => {
    if (!incomingCall) return undefined;
    const timer = setTimeout(() => answerButtonRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [incomingCall]);

  // aria-live announcements for connection changes and incoming calls.
  useEffect(() => {
    if (incomingCall) {
      setAnnouncement(`Incoming support call from ${formatCaller(incomingCall)}.`);
      return;
    }
    const meta = STATUS_META[status];
    if (meta && status !== lastAnnouncedStatusRef.current) {
      setAnnouncement(`Voice service status: ${meta.label}.`);
      lastAnnouncedStatusRef.current = status;
    }
  }, [incomingCall, status]);

  // ── Department escalation (warm transfer) ──────────────────────────────────
  // Load the department list only while the agent is on a call; reset all
  // escalation state whenever the active call changes.
  useEffect(() => {
    if (!activeCall || isQueueLine(activeCall)) return undefined;
    let mounted = true;
    fetchDepartments()
      .then((list) => { if (mounted) setDepartments(list); })
      .catch(() => { /* unavailable → the escalate control stays disabled */ });
    return () => { mounted = false; };
  }, [activeCall]);

  useEffect(() => {
    setConsultState('idle');
    setEscalateError('');
    setEscalateDept('');
  }, [activeCall]);

  const getActiveCallSid = useCallback(() => {
    if (!activeCall) return null;
    return activeCall.parameters?.CallSid || activeCall.customParameters?.call_sid || null;
  }, [activeCall]);

  const handleConsult = useCallback(async () => {
    if (!escalateDept) return;
    setEscalating(true);
    setEscalateError('');
    try {
      const connected = await consultCall(getActiveCallSid(), escalateDept);
      setConsultState(connected ? 'connected' : 'ringing');
    } catch (err) {
      setEscalateError(err.message || 'Could not start the consultation.');
      setConsultState('idle');
    } finally {
      setEscalating(false);
    }
  }, [escalateDept, getActiveCallSid]);

  const handleTransfer = useCallback(async () => {
    setEscalating(true);
    setEscalateError('');
    try {
      await transferCall(getActiveCallSid());
      setConsultState('idle');
    } catch (err) {
      setEscalateError(err.message || 'Could not transfer the call.');
    } finally {
      setEscalating(false);
    }
  }, [getActiveCallSid]);

  // ── Recent-calls adapter (in-memory only, see TODO above) ────────────────
  useEffect(() => {
    const prevIncoming = prevIncomingRef.current;
    prevIncomingRef.current = incomingCall;
    // Caller never answered and the call was not explicitly declined → missed.
    if (
      prevIncoming &&
      !incomingCall &&
      !activeCall &&
      Date.now() - lastDeclineAtRef.current > 1000
    ) {
      recentCalls.unshift({
        id: prevIncoming.parameters?.CallSid || prevIncoming.customParameters?.call_sid || `missed-${Date.now()}`,
        number: formatCaller(prevIncoming),
        source: getCallOrigin(prevIncoming).label,
        outcome: 'Missed',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }, [incomingCall, activeCall]);

  useEffect(() => {
    const prevActive = prevActiveRef.current;
    prevActiveRef.current = activeCall;
    if (prevActive && !activeCall) {
      const duration = callStartedAt
        ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))
        : 0;
      const mm = String(Math.floor(duration / 60)).padStart(2, '0');
      const ss = String(duration % 60).padStart(2, '0');
      recentCalls.unshift({
        id: prevActive.parameters?.CallSid || prevActive.customParameters?.call_sid || `ended-${Date.now()}`,
        number: formatCaller(prevActive),
        source: getCallOrigin(prevActive).label,
        outcome: `Ended (${mm}:${ss})`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }, [activeCall, callStartedAt]);

  const handleDecline = useCallback(() => {
    lastDeclineAtRef.current = Date.now();
    recentCalls.unshift({
      id: incomingCall?.parameters?.CallSid || incomingCall?.customParameters?.call_sid || `declined-${Date.now()}`,
      number: formatCaller(incomingCall),
      source: getCallOrigin(incomingCall).label,
      outcome: 'Declined',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    declineCall();
  }, [declineCall, incomingCall]);

  // ── Current support queue summary (from data already loaded in the dashboard) ──
  const queueSummary = useMemo(() => {
    const open = tickets.filter(
      (t) => t.status !== 'resolved' && t.status !== 'closed'
    );
    return {
      open: open.length,
      urgent: open.filter((t) => String(t.priority || '').toLowerCase() === 'urgent').length,
      unassigned: open.filter((t) => !t.assigned_to).length,
    };
  }, [tickets]);

  const statusMeta = STATUS_META[status] || STATUS_META.offline;
  const busy = status === 'connecting' || status === 'reconnecting';
  const available = status === 'ready';

  // ── Keyboard: Enter answers / Escape declines on the incoming card ───────
  const handleIncomingKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      answerCall();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDecline();
    }
  };

  return (
    <div className="space-y-6">
      {/* Visually hidden live region for screen readers */}
      <div aria-live="polite" className="sr-only">{announcement}</div>

      {/* ── Header ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FaHeadset className="text-indigo-600" size={18} />
              Voice Desk
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Manage live support calls while you work through the support queue.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusMeta.tone}`}>
              <span className="inline-block h-2 w-2 rounded-full bg-current motion-reduce:animate-none" aria-hidden="true" />
              {statusMeta.label}
            </span>
            {available ? (
              <button
                onClick={goUnavailable}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FaPowerOff size={14} /> Go Unavailable
              </button>
            ) : (
              <button
                onClick={goAvailable}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? <FaSpinner className="animate-spin" size={14} /> : <FaPhoneAlt size={14} />}
                Go Available
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Initial state: explain before any permission is requested ── */}
      {status === 'offline' && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mx-auto max-w-xl text-center">
            <FaInbox className="mx-auto text-slate-300" size={40} />
            <h3 className="mt-3 text-base font-semibold text-slate-900">You are not receiving calls</h3>
            <p className="mt-2 text-sm text-slate-600">
              Enabling availability requests microphone permission and lets support
              calls ring in this browser. Only one browser should normally be
              available as <span className="font-mono text-xs">support_agent_1</span>.
            </p>
            <button
              onClick={goAvailable}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <FaPhoneAlt size={14} /> Go Available
            </button>
          </div>
        </div>
      )}

      {/* ── Ready state ── */}
      {available && !incomingCall && !activeCall && (
        <div className={`rounded-xl border p-6 shadow-sm ${inQueue ? 'border-green-200 bg-green-50' : 'border-indigo-200 bg-indigo-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {inQueue ? (
                <FaCheckCircle className="text-green-600" size={22} aria-hidden="true" />
              ) : (
                <FaHeadset className="text-indigo-600" size={22} aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {inQueue ? 'On the line — waiting for callers' : 'Ready — not connected to the queue'}
                </p>
                <p className="text-xs text-slate-600">
                  {inQueue
                    ? 'Queued callers are bridged to you automatically. Keep this tab open.'
                    : 'Join the queue line to start receiving support calls.'}
                </p>
              </div>
            </div>
            {!inQueue && (
              <button
                onClick={connectToQueue}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <FaPhoneAlt size={14} /> Join queue line
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Connecting / Reconnecting state ── */}
      {busy && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <FaSpinner className="animate-spin text-amber-600" size={18} aria-hidden="true" />
            <p className="text-sm font-medium text-amber-800">
              {status === 'connecting' ? 'Connecting to the voice service…' : 'Reconnecting to the voice service…'}
            </p>
          </div>
        </div>
      )}

      {/* ── Error state with recovery guidance ── */}
      {status === 'error' && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm" role="alert">
          <div className="flex items-start gap-3">
            <FaExclamationTriangle className="mt-0.5 text-red-600" size={18} aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Voice service error</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
              <p className="mt-1 text-xs text-red-600">
                If microphone access was blocked, allow it in your browser settings.
                If your admin session expired, refresh the page. You can retry below.
              </p>
            </div>
          </div>
          <button
            onClick={goAvailable}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Incoming call card ── */}
      {incomingCall && !activeCall && (
        <div
          className="rounded-xl border-2 border-indigo-300 bg-white p-6 shadow-md"
          onKeyDown={handleIncomingKeyDown}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <FaPhoneAlt className="animate-pulse motion-reduce:animate-none" size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Incoming support call
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold text-slate-900">{formatCaller(incomingCall)}</p>
                  <CallOriginBadge call={incomingCall} />
                </div>
                <p className="text-xs text-slate-500">
                  Ringing for {formatElapsed(ringingStartedAt)} &middot; Enter to answer, Escape to decline
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                ref={answerButtonRef}
                onClick={answerCall}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
              >
                <FaPhoneAlt size={14} /> Answer
              </button>
              <button
                onClick={handleDecline}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
              >
                <FaPhoneSlash size={14} /> Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Active call card (queue line or bridged call) ── */}
      {activeCall && (
        <div className="rounded-xl border border-indigo-200 bg-white p-6 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                <FaPhoneAlt size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  {isQueueLine(activeCall) ? 'On the line' : 'On a call'}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold text-slate-900">
                    {isQueueLine(activeCall) ? 'Support queue line' : 'Support call'}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {isQueueLine(activeCall)
                    ? `Waiting for a queued caller to be dispatched — ${formatElapsed(callStartedAt)} on the line`
                    : `${formatElapsed(callStartedAt)} elapsed · caller number not available on conference legs`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                aria-pressed={muted}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  muted
                    ? 'border-amber-300 bg-amber-50 text-amber-700 focus:ring-amber-400'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-indigo-400'
                }`}
              >
                {muted ? <FaMicrophoneSlash size={14} /> : <FaMicrophone size={14} />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={endCall}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
              >
                <FaPhoneSlash size={14} /> {isQueueLine(activeCall) ? 'Leave queue' : 'End Call'}
              </button>
            </div>
          </div>
          {!isQueueLine(activeCall) && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="voice-escalate-department" className="text-xs font-semibold text-slate-600">
                  Consult department:
                </label>
                <select
                  id="voice-escalate-department"
                  value={escalateDept}
                  onChange={(e) => setEscalateDept(e.target.value)}
                  disabled={escalating || consultState !== 'idle' || departments.length === 0}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
                >
                  <option value="">{departments.length === 0 ? 'No departments configured' : 'Select department…'}</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
                {consultState === 'idle' ? (
                  <button
                    onClick={handleConsult}
                    disabled={!escalateDept || escalating}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
                  >
                    {escalating ? <FaSpinner className="animate-spin" size={14} /> : <FaHeadset size={14} />}
                    Consult department
                  </button>
                ) : (
                  <button
                    onClick={handleTransfer}
                    disabled={escalating || consultState !== 'connected'}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
                  >
                    {escalating ? <FaSpinner className="animate-spin" size={14} /> : <FaPhoneAlt size={14} />}
                    Transfer now
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {consultState === 'idle' && 'The caller is put on hold while you speak with the department privately.'}
                {consultState === 'ringing' && 'The department is ringing. Transfer is enabled once they answer.'}
                {consultState === 'connected' && 'The caller is on hold. Tell the department the story, then press Transfer now.'}
              </p>
              {escalateError && (
                <p className="mt-1 text-xs text-red-600" role="alert">{escalateError}</p>
              )}
            </div>
          )}
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Keep this tab open while handling the call.
          </p>
        </div>
      )}

      {/* ── Queue summary + switch to ticket workspace ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FaClipboardList className="text-indigo-600" size={15} /> Current support queue
            </h3>
            {onOpenTickets && (
              <button
                onClick={onOpenTickets}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                Open ticket workspace &rarr;
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Open tickets</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{queueSummary.open}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">Urgent</p>
              <p className="mt-1 text-xl font-bold text-amber-800">{queueSummary.urgent}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Unassigned</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{queueSummary.unassigned}</p>
            </div>
          </div>
        </div>

        {/* ── Recent calls (in-memory, see TODO) ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FaHeadset className="text-indigo-600" size={15} /> Recent calls
          </h3>
          {recentCalls.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No calls yet this session. Calls here are kept in memory only.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recentCalls.slice(0, 6).map((call) => (
                <li key={call.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="truncate text-slate-800">
                    {call.number}
                    {call.source && <span className="ml-2 text-[11px] text-slate-400">{call.source}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-500">{call.outcome}</span>
                    <span className="text-xs text-slate-400">{call.time}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportVoiceDesk;
