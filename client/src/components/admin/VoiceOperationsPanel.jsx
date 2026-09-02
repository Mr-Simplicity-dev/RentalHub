// ─────────────────────────────────────────────────────────────────────────────
// VoiceOperationsPanel — Super Support "Voice Ops" tab: call history (with
// recordings) and after-hours callback requests. Complements the Voice Desk
// (live handling) with the operational record for supervision/rectification.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  FaPhoneAlt,
  FaHeadset,
  FaSyncAlt,
  FaExclamationTriangle,
  FaPhoneVolume,
} from 'react-icons/fa';
import { fetchCallLog, fetchCallbackRequests, fetchDutyStatus } from '../../services/voiceApi';
import { getOriginMeta } from './voiceMeta';

const STATUS_TONES = {
  completed: 'bg-green-100 text-green-700',
  answered: 'bg-green-100 text-green-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  ringing: 'bg-amber-100 text-amber-700',
  initiated: 'bg-slate-100 text-slate-600',
  queued: 'bg-amber-100 text-amber-700',
  busy: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  'no-answer': 'bg-red-100 text-red-700',
  cancel: 'bg-slate-100 text-slate-600',
  escalated: 'bg-violet-100 text-violet-700',
};

const formatDuration = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return '—';
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

const formatTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SourceBadge = ({ source }) => {
  const origin = getOriginMeta(source);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${origin.tone}`}>
      {origin.label}
    </span>
  );
};

const VoiceOperationsPanel = () => {
  const [calls, setCalls] = useState([]);
  const [callbacks, setCallbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [callLog, callbackList] = await Promise.all([
        fetchCallLog(),
        fetchCallbackRequests(),
      ]);
      setCalls(callLog);
      setCallbacks(callbackList);
    } catch (err) {
      setError(err.message || 'Could not load the voice operations panel.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Agents on duty
  const [duty, setDuty] = useState([]);
  const loadDuty = useCallback(async () => {
    try {
      setDuty(await fetchDutyStatus());
    } catch {
      setDuty([]);
    }
  }, []);
  useEffect(() => {
    loadDuty();
  }, [loadDuty]);

  const DUTY_TONES = {
    offline: 'bg-slate-100 text-slate-600',
    on_duty: 'bg-green-100 text-green-700',
    on_call: 'bg-blue-100 text-blue-700',
  };
  const DUTY_LABEL = { offline: 'Offline', on_duty: 'On duty', on_call: 'On a call' };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FaHeadset className="text-indigo-600" size={18} />
              Voice Operations
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Call history with recordings, and after-hours callback requests.
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FaSyncAlt size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <FaExclamationTriangle className="text-red-600" size={16} aria-hidden="true" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading voice operations...
        </div>
      ) : (
        <>
          {/* ── Agents on duty ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FaHeadset className="text-indigo-600" size={15} />
              Agents on duty
            </h3>
            {duty.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No agent lines configured.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {duty.map((agent) => (
                  <li key={agent.identity} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="font-mono text-xs text-slate-700">{agent.identity}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DUTY_TONES[agent.state] || DUTY_TONES.offline}`}>
                      {DUTY_LABEL[agent.state] || agent.state}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Call log ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FaPhoneAlt className="text-indigo-600" size={15} />
              Call log
            </h3>
            {calls.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No calls recorded yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Time</th>
                      <th className="py-2 pr-3 font-semibold">Source</th>
                      <th className="py-2 pr-3 font-semibold">Direction</th>
                      <th className="py-2 pr-3 font-semibold">From / To</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 pr-3 font-semibold">Duration</th>
                      <th className="py-2 font-semibold">Recording</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => (
                      <tr key={`${call.call_sid}-${call.status}`} className="border-b border-slate-100 align-top">
                        <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-slate-500">
                          {formatTime(call.created_at)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <SourceBadge source={call.source} />
                        </td>
                        <td className="py-2.5 pr-3 capitalize text-slate-700">{call.direction || '—'}</td>
                        <td className="py-2.5 pr-3 text-slate-700">
                          <span className="font-mono text-xs">{call.from_number || '—'}</span>
                          <span className="text-slate-400"> → </span>
                          <span className="font-mono text-xs">{call.to_number || '—'}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONES[call.status] || 'bg-slate-100 text-slate-600'}`}>
                            {(call.status || 'unknown').replace(/-/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-slate-700">
                          {formatDuration(call.duration_sec)}
                        </td>
                        <td className="py-2.5">
                          {call.recording_url ? (
                            <audio controls className="h-8 max-w-[220px]" src={call.recording_url} preload="none">
                              Your browser does not support audio playback.
                            </audio>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Callback requests ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FaPhoneVolume className="text-indigo-600" size={15} />
              Callback requests
            </h3>
            {callbacks.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No callback requests yet. Callers can leave one after hours or by pressing 3 in the menu.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {callbacks.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <SourceBadge source={request.source} />
                      <a
                        href={`tel:${request.phone_number}`}
                        className="font-mono text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {request.phone_number}
                      </a>
                      {request.call_sid && (
                        <span className="font-mono text-[11px] text-slate-400">{request.call_sid}</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{formatTime(request.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default VoiceOperationsPanel;
