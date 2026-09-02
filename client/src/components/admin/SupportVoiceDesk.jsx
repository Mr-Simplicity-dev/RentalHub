// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SupportVoiceDesk â€” internal Twilio browser calling workspace for the Super
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
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  FaSyncAlt,
} from 'react-icons/fa';
import useTwilioVoice from '../../hooks/useTwilioVoice';
import {
  cancelConsult,
  consultCall,
  fetchAgentLines,
  fetchCallContext,
  fetchCallLog,
  fetchConsultStatus,
  fetchDepartments,
  transferCall,
} from '../../services/voiceApi';
import { getOriginMeta } from './voiceMeta';



// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_META = {
  offline: { label: 'Offline', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  connecting: { label: 'Connecting', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  ready: { label: 'Ready', tone: 'border-green-200 bg-green-50 text-green-700' },
  reconnecting: { label: 'Reconnecting', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  error: { label: 'Error', tone: 'border-red-200 bg-red-50 text-red-700' },
};

// â”€â”€ Call-origin badges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The backend passes a sanitized `call_source` (and `caller_number`) as Twilio
// Client custom parameters. Labels live in ./voiceMeta (shared with the Voice
// Operations panel).
const CallOriginBadge = ({ call }) => {
  const origin = getOriginMeta(
    call?.customParameters?.call_source || call?.parameters?.call_source || 'unknown'
  );
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
  // E.164-ish digit string â€” never SIP URIs or email-like identities.
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
// for queue-bridged legs â€” see docs/voice-system-backlog.md).
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

  // Department escalation state (warm transfer: consult â†’ transfer).
  const [departments, setDepartments] = useState([]);
  const [escalateDept, setEscalateDept] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState('');
  const [escalateNote, setEscalateNote] = useState('');
  const [consultState, setConsultState] = useState('idle'); // idle | ringing | connected
  // Agent line selection (multi-agent) + caller identity + persisted call log.
  const [agentLines, setAgentLines] = useState([]);
  const [agentLine, setAgentLine] = useState('');
  const [callerContext, setCallerContext] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Timers for the ringing / active-call clocks.
  const [ringingStartedAt, setRingingStartedAt] = useState(null);
  const [callStartedAt, setCallStartedAt] = useState(null);

  const answerButtonRef = useRef(null);
  const lastAnnouncedStatusRef = useRef(status);

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

  // â”€â”€ Department escalation (warm transfer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Load the department list only while the agent is on a call; reset all
  // escalation state whenever the active call changes.
  useEffect(() => {
    if (!activeCall || isQueueLine(activeCall)) return undefined;
    let mounted = true;
    fetchDepartments()
      .then((list) => { if (mounted) setDepartments(list); })
      .catch(() => { /* unavailable â†’ the escalate control stays disabled */ });
    return () => { mounted = false; };
  }, [activeCall]);

  useEffect(() => {
    setConsultState('idle');
    setEscalateError('');
    setEscalateDept('');
    setEscalateNote('');
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
      await transferCall(getActiveCallSid(), escalateNote);
      setConsultState('idle');
    } catch (err) {
      setEscalateError(err.message || 'Could not transfer the call.');
    } finally {
      setEscalating(false);
    }
  }, [getActiveCallSid, escalateNote]);
  const handleCancelConsult = useCallback(async () => {
    setEscalating(true);
    setEscalateError('');
    try {
      await cancelConsult(getActiveCallSid());
      setConsultState('idle');
      setEscalateDept('');
    } catch (err) {
      setEscalateError(err.message || 'Could not cancel the consultation.');
    } finally {
      setEscalating(false);
    }
  }, [getActiveCallSid]);

  // Poll while a consult is ringing: flip to "connected" the moment the
  // department answers, so "Transfer now" becomes available automatically.
  useEffect(() => {
    if (consultState !== 'ringing') return undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const connected = await fetchConsultStatus(getActiveCallSid());
      if (!stopped && connected) setConsultState('connected');
    };
    const poll = setInterval(tick, 4000);
    tick();
    return () => { stopped = true; clearInterval(poll); };
  }, [consultState, getActiveCallSid]);

  // Retry: cancel the current ringing consult, then immediately re-dial the
  // same department.
  const handleRetryConsult = useCallback(async () => {
    setEscalating(true);
    setEscalateError('');
    const department = escalateDept;
    try {
      await cancelConsult(getActiveCallSid());
      const connected = await consultCall(getActiveCallSid(), department);
      setConsultState(connected ? 'connected' : 'ringing');
    } catch (err) {
      setEscalateError(err.message || 'Could not retry the consultation.');
      setConsultState('idle');
    } finally {
      setEscalating(false);
    }
  }, [escalateDept, getActiveCallSid]);

  // Agent lines (multi-agent): the desk registers as the chosen identity.
  useEffect(() => {
    let mounted = true;
    fetchAgentLines()
      .then((lines) => {
        if (!mounted) return;
        setAgentLines(lines);
        setAgentLine((prev) => prev || lines[0] || '');
      })
      .catch(() => { /* keep single-agent default */ });
    return () => { mounted = false; };
  }, []);

  // Persisted recent calls (call log) shown in the desk card.
  useEffect(() => {
    let mounted = true;
    fetchCallLog()
      .then((list) => { if (mounted) setCallHistory(Array.isArray(list) ? list : []); })
      .catch(() => { /* log unavailable in the desk */ })
      .finally(() => { if (mounted) setHistoryLoaded(true); });
    return () => { mounted = false; };
  }, []);

  // Caller identity on the active call: conference legs do not expose the
  // caller to the SDK, so the desk resolves it from the backend once a
  // non-queue call becomes active.
  useEffect(() => {
    if (!activeCall || isQueueLine(activeCall)) {
      setCallerContext(null);
      return undefined;
    }
    let mounted = true;
    const agentCallSid = activeCall.parameters?.CallSid || activeCall.customParameters?.call_sid;
    fetchCallContext(agentCallSid).then((context) => { if (mounted) setCallerContext(context); });
    return () => { mounted = false; };
  }, [activeCall]);

  const handleDecline = useCallback(() => {
    declineCall();
  }, [declineCall]);


  // â”€â”€ Current support queue summary (from data already loaded in the dashboard) â”€â”€
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

  // â”€â”€ Keyboard: Enter answers / Escape declines on the incoming card â”€â”€â”€â”€â”€â”€â”€
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

      {/* â”€â”€ Header â”€â”€ */}
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
            {!available && agentLines.length > 1 && (
                <select
                  value={agentLine}
                  onChange={(e) => setAgentLine(e.target.value)}
                  aria-label="Agent line"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {agentLines.map((line) => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              )}
              {available ? (
              <button
                onClick={goUnavailable}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FaPowerOff size={14} /> Go Unavailable
              </button>
            ) : (
              <button
                onClick={() => goAvailable(agentLine)}
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

      {/* â”€â”€ Initial state: explain before any permission is requested â”€â”€ */}
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
              onClick={() => goAvailable(agentLine)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <FaPhoneAlt size={14} /> Go Available
            </button>
          </div>
        </div>
      )}

      {/* â”€â”€ Ready state â”€â”€ */}
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
                  {inQueue ? 'On the line â€” waiting for callers' : 'Ready â€” not connected to the queue'}
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

      {/* â”€â”€ Connecting / Reconnecting state â”€â”€ */}
      {busy && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <FaSpinner className="animate-spin text-amber-600" size={18} aria-hidden="true" />
            <p className="text-sm font-medium text-amber-800">
              {status === 'connecting' ? 'Connecting to the voice serviceâ€¦' : 'Reconnecting to the voice serviceâ€¦'}
            </p>
          </div>
        </div>
      )}

      {/* â”€â”€ Error state with recovery guidance â”€â”€ */}
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
            onClick={() => goAvailable(agentLine)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {/* â”€â”€ Incoming call card â”€â”€ */}
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

      {/* â”€â”€ Active call card (queue line or bridged call) â”€â”€ */}
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
                    {isQueueLine(activeCall)
                      ? 'Support queue line'
                      : callerContext?.callerNumber || 'Support call'}
                  </p>
                  {!isQueueLine(activeCall) && callerContext?.source && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getOriginMeta(callerContext.source).tone}`}>
                      {getOriginMeta(callerContext.source).label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {isQueueLine(activeCall)
                    ? 'Waiting for a queued caller to be dispatched: ' + formatElapsed(callStartedAt) + ' on the line'
                    : formatElapsed(callStartedAt) + ' elapsed'}
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
                  <option value="">{departments.length === 0 ? 'No departments configured' : 'Select departmentâ€¦'}</option>
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
                  <>
                    <button
                      onClick={handleTransfer}
                      disabled={escalating || consultState !== 'connected'}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
                    >
                      {escalating ? <FaSpinner className="animate-spin" size={14} /> : <FaPhoneAlt size={14} />}
                      Transfer now
                    </button>
                    <button
                      onClick={handleCancelConsult}
                      disabled={escalating}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                    >
                      Cancel consultation
                    </button>
                    {consultState === 'ringing' && (
                      <button
                        onClick={handleRetryConsult}
                        disabled={escalating}
                        className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
                      >
                        {escalating ? <FaSpinner className="animate-spin" size={14} /> : <FaSyncAlt size={14} />}
                        Retry department
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {consultState === 'idle' && 'The caller is put on hold while you speak with the department privately.'}
                {consultState === 'ringing' && 'The department is ringing. You will be able to Transfer now automatically once they answer.'}
                {consultState === 'connected' && 'The caller is on hold. Tell the department the story, then press Transfer now.'}
              </p>
              {consultState === 'connected' && (
                <div className="mt-2">
                  <label htmlFor="voice-escalate-note" className="text-xs font-medium text-slate-600">
                    Problem note (optional â€” appears on the ticket for the department and super admin)
                  </label>
                  <textarea
                    id="voice-escalate-note"
                    value={escalateNote}
                    onChange={(e) => setEscalateNote(e.target.value)}
                    rows={2}
                    maxLength={2000}
                    disabled={escalating}
                    className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-60"
                    placeholder="e.g. Caller says a rent payment went to the wrong accountâ€¦"
                  />
                </div>
              )}
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

      {/* â”€â”€ Queue summary + switch to ticket workspace â”€â”€ */}
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

        {/* â”€â”€ Recent calls (in-memory, see TODO) â”€â”€ */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FaHeadset className="text-indigo-600" size={15} /> Recent calls
          </h3>
          {!historyLoaded ? (
            <p className="mt-3 text-sm text-slate-500">Loading recent calls...</p>
          ) : callHistory.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No calls recorded yet. Full history lives in the Voice Ops tab.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {callHistory.slice(0, 6).map((call) => {
                  const origin = getOriginMeta(call.source);
                  const shown = call.from_number || call.to_number || 'Unknown';
                  const when = call.created_at
                    ? new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <li key={call.call_sid + '-' + call.status} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="truncate text-slate-800">
                        {shown}
                        {call.source && <span className={'ml-2 text-[11px] text-slate-400'}>{origin.label}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-slate-500">{(call.status || '').replace(/-/g, ' ')}</span>
                        <span className="text-xs text-slate-400">{when}</span>
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportVoiceDesk;

