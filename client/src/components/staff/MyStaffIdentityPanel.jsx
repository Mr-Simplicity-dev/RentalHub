import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import {
  FaCheckCircle,
  FaClock,
  FaCopy,
  FaDownload,
  FaIdBadge,
  FaQrcode,
  FaSyncAlt,
  FaTimesCircle,
} from 'react-icons/fa';
import staffVerificationService from '../../services/staffVerificationService';

const formatCountdown = (expiresAt, nowMs) => {
  const diff = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 1000));
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export default function MyStaffIdentityPanel({ compact = false }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [codeInput, setCodeInput] = useState('');
  const [lookedUpChallenge, setLookedUpChallenge] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [respondingRef, setRespondingRef] = useState('');

  const loadIdentity = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await staffVerificationService.getMyIdentity();
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.message || 'Unable to load your staff identity record.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdentity(false);
    const poll = window.setInterval(() => loadIdentity(true), 10000);
    return () => window.clearInterval(poll);
  }, [loadIdentity]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const handleLookupChallenge = async (event) => {
    event.preventDefault();
    if (!codeInput.trim()) return;
    setLookupBusy(true);
    try {
      const res = await staffVerificationService.lookupMyChallenge(codeInput.trim());
      if (res.data?.success) {
        setLookedUpChallenge(res.data.data);
        setCodeInput('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification challenge not found.');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleRespond = async (challengeReference, decision) => {
    setRespondingRef(challengeReference);
    try {
      const res = await staffVerificationService.respondToChallenge(challengeReference, decision);
      if (res.data?.success) {
        toast.success(
          decision === 'confirm'
            ? `Confirmed live identity request ${challengeReference}`
            : `Rejected live identity request ${challengeReference}`
        );
        if (lookedUpChallenge?.challenge_reference === challengeReference) {
          setLookedUpChallenge(null);
        }
        await loadIdentity(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not process verification decision.');
      await loadIdentity(true);
    } finally {
      setRespondingRef('');
    }
  };

  const handleDownloadQr = () => {
    const identity = data?.identity;
    if (!identity?.qr_data_url) return;
    const link = document.createElement('a');
    link.href = identity.qr_data_url;
    link.download = `amana-staff-qr-${identity.staff_verification_id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleCopyVerifyLink = async () => {
    const url = data?.identity?.verify_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Public verification link copied');
    } catch {
      toast.info(url);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Loading My Staff Identity...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error}
      </section>
    );
  }

  if (!data?.registered || !data?.identity) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">MY STAFF IDENTITY</h2>
        <p className="text-sm text-slate-600">
          Your account does not currently have an approved Amana Staff Identity record. Contact
          Amana Super Administration if your role requires public staff verification credentials.
        </p>
      </section>
    );
  }

  const identity = data.identity;
  const pendingChallenges = data.pending_challenges || [];
  const history = data.history || [];

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6"
      aria-label="My Staff Identity"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold text-primary-700">
            Amana Official Credential
          </p>
          <h2 className="text-xl font-bold text-slate-900">MY STAFF IDENTITY</h2>
        </div>
        <button
          type="button"
          onClick={() => loadIdentity(false)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <FaSyncAlt className="text-[11px]" aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Staff Credential & Official QR Code */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-5 sm:flex-row">
          <div className="h-36 w-36 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
            {identity.official_photo_url ? (
              <img
                src={identity.official_photo_url}
                alt={`Official staff photograph of ${identity.full_name}`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <FaIdBadge className="h-10 w-10 text-slate-400" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{identity.full_name}</h3>
              <p className="text-sm font-medium text-slate-700">
                {identity.official_role} · {identity.department}
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Staff Verification ID</dt>
                <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                  {identity.staff_verification_id}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Registration Status</dt>
                <dd className="font-semibold capitalize text-slate-900">
                  {String(identity.status || '').replace(/_/g, ' ')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Engagement Type</dt>
                <dd className="text-slate-900">{identity.engagement_type_label}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Expiry Date</dt>
                <dd className="font-mono text-slate-900 tabular-nums">
                  {identity.expires_at
                    ? new Date(identity.expires_at).toLocaleDateString()
                    : 'No fixed expiry'}
                </dd>
              </div>
            </dl>

            <div>
              <p className="text-xs font-semibold text-slate-500">Approved Activities</p>
              {identity.approved_activities_detailed?.length > 0 ? (
                <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
                  {identity.approved_activities_detailed.map((act) => (
                    <li key={act.code} className="flex items-start gap-2">
                      <FaCheckCircle
                        className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      <span>{act.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">No activities assigned yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Official QR Code & Download */}
        <div className="flex flex-col items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <QRCodeSVG value={identity.verify_url} size={148} level="M" />
          </div>
          <p className="text-center text-xs text-slate-600">
            Visitors scan this official QR code to verify your Amana staff registration.
          </p>
          <div className="flex w-full flex-col gap-2">
            {identity.qr_data_url && (
              <button
                type="button"
                onClick={handleDownloadQr}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <FaDownload aria-hidden="true" />
                <span>Download Official QR Code</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyVerifyLink}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FaCopy aria-hidden="true" />
              <span>Copy Public Verification Link</span>
            </button>
          </div>
        </div>
      </div>

      {/* Enter Visitor Live Challenge Code / QR Payload */}
      <div className="border-t border-slate-200 pt-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Respond to a Visitor&apos;s Live Confirmation Challenge
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Enter the 8-character code shown on the visitor&apos;s screen (or paste scanned QR
            challenge data), or respond directly to incoming requests below.
          </p>
        </div>

        <form onSubmit={handleLookupChallenge} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Enter visitor code (e.g. K4P9-M2X3) or scanned QR payload"
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 font-mono text-sm text-slate-900 placeholder:font-sans"
          />
          <button
            type="submit"
            disabled={lookupBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60 whitespace-nowrap"
          >
            <FaQrcode className="text-xs" aria-hidden="true" />
            <span>{lookupBusy ? 'Looking up...' : 'Find Request'}</span>
          </button>
        </form>

        {lookedUpChallenge && (
          <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-sm font-bold text-blue-950 tabular-nums">
                {lookedUpChallenge.challenge_reference}
              </p>
              <span className="font-mono text-xs font-semibold text-blue-800 tabular-nums">
                Expires in {formatCountdown(lookedUpChallenge.expires_at, nowMs)}
              </span>
            </div>
            <p className="text-sm text-blue-950">
              <strong>Purpose:</strong> {lookedUpChallenge.purpose}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={respondingRef === lookedUpChallenge.challenge_reference}
                onClick={() => handleRespond(lookedUpChallenge.challenge_reference, 'confirm')}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                <FaCheckCircle aria-hidden="true" />
                <span>Confirm Identity</span>
              </button>
              <button
                type="button"
                disabled={respondingRef === lookedUpChallenge.challenge_reference}
                onClick={() => handleRespond(lookedUpChallenge.challenge_reference, 'reject')}
                className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                <FaTimesCircle aria-hidden="true" />
                <span>Reject Request</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Incoming Pending Live Verification Requests */}
      <div className="border-t border-slate-200 pt-5 space-y-3">
        <h3 className="text-base font-semibold text-slate-900">
          Incoming Live Verification Requests ({pendingChallenges.length})
        </h3>

        {pendingChallenges.length === 0 ? (
          <p className="text-sm text-slate-600">
            No active live verification requests right now.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingChallenges.map((req) => (
              <div
                key={req.challenge_reference}
                className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {req.challenge_reference}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Requested {new Date(req.created_at).toLocaleTimeString()}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono font-semibold text-primary-700 tabular-nums">
                      <FaClock className="text-[11px]" aria-hidden="true" />
                      {formatCountdown(req.expires_at, nowMs)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{req.purpose}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={respondingRef === req.challenge_reference}
                    onClick={() => handleRespond(req.challenge_reference, 'confirm')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    <FaCheckCircle aria-hidden="true" />
                    <span>Confirm</span>
                  </button>
                  <button
                    type="button"
                    disabled={respondingRef === req.challenge_reference}
                    onClick={() => handleRespond(req.challenge_reference, 'reject')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <FaTimesCircle aria-hidden="true" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verification History */}
      {!compact && (
        <div className="border-t border-slate-200 pt-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Recent Verification History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-slate-600">No verification history recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-slate-500">
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4">Purpose</th>
                    <th className="py-2 pr-4">Outcome</th>
                    <th className="py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {history.map((item) => (
                    <tr key={item.challenge_reference}>
                      <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">
                        {item.challenge_reference}
                      </td>
                      <td className="py-2.5 pr-4 max-w-xs truncate">{item.purpose}</td>
                      <td className="py-2.5 pr-4 text-xs font-semibold capitalize">
                        {item.status}
                      </td>
                      <td className="py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
