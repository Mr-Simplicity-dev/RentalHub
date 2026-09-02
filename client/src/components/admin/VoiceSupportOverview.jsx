// ─────────────────────────────────────────────────────────────────────────────
// VoiceSupportOverview — compact Voice & Support summary for the super-admin
// overview. Counters come from GET /voice/summary; every card deep-links into
// the Super Support board (Voice Desk / Voice Ops / escalations), which the
// super admin is authorized to open.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaPhoneAlt,
  FaHeadset,
  FaPhoneVolume,
  FaExclamationTriangle,
  FaArrowRight,
} from 'react-icons/fa';
import { fetchVoiceSummary } from '../../services/voiceApi';

const cardBase =
  'rounded-xl border border-slate-200 bg-slate-50 p-4';

const stat = (value, label, icon) => (
  <div className={cardBase}>
    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
      {icon}
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

const VoiceSupportOverview = () => {
  const [summary, setSummary] = useState({ callsToday: 0, openEscalations: 0, callbackRequests: 0 });
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchVoiceSummary()
      .then((data) => { if (mounted) setSummary(data); })
      .catch(() => { if (mounted) setError('Voice summary unavailable.'); })
      .finally(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Voice &amp; Support
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-slate-900">
            Call centre at a glance
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/super-support-dashboard?tab=voice"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FaHeadset size={12} /> Voice Desk
          </Link>
          <Link
            to="/admin/super-support-dashboard?tab=voice_ops"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FaPhoneAlt size={12} /> Voice Ops
          </Link>
          <Link
            to="/admin/super-support-dashboard?tab=escalations"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Escalations <FaArrowRight size={11} />
          </Link>
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-red-600" role="alert">
          <FaExclamationTriangle className="text-red-600" size={13} aria-hidden="true" />
          {error}
        </p>
      )}

      {!loaded && !error ? (
        <p className="mt-3 text-sm text-slate-400">Loading voice summary...</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stat(summary.callsToday, 'Calls today', <FaPhoneAlt className="text-indigo-600" size={13} />)}
          {stat(
            summary.openEscalations,
            'Open department escalations',
            <FaHeadset className="text-indigo-600" size={13} />
          )}
          {stat(
            summary.callbackRequests,
            'Callback requests',
            <FaPhoneVolume className="text-indigo-600" size={13} />
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceSupportOverview;
