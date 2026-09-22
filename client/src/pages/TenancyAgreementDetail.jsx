import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FaCheckCircle,
  FaClipboardList,
  FaExclamationTriangle,
  FaFileSignature,
  FaHome,
  FaPenNib,
  FaSpinner,
  FaTimesCircle,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';
import {
  tenancyAgreementService,
  TENANCY_AGREEMENT_STATUS_LABELS,
  TENANCY_AGREEMENT_STATUS_TONES,
} from '../services/tenancyAgreementService';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-NG');
};

const EVENT_LABELS = {
  AGREEMENT_CREATED: 'Agreement created',
  AGREEMENT_SENT_TO_LANDLORD: 'Sent to landlord',
  LANDLORD_VIEWED: 'Landlord viewed',
  LANDLORD_ACCEPTED_TERMS: 'Landlord accepted terms',
  LANDLORD_SIGNED: 'Landlord signed',
  AGREEMENT_SENT_TO_TENANT: 'Sent to tenant',
  TENANT_VIEWED: 'Tenant viewed',
  TENANT_ACCEPTED_TERMS: 'Tenant accepted terms',
  TENANT_SIGNED: 'Tenant signed',
  AGREEMENT_FULLY_EXECUTED: 'Agreement fully executed',
  AGREEMENT_DECLINED: 'Agreement declined',
  AMENDMENT_REQUESTED: 'Amendment requested',
  NEW_VERSION_CREATED: 'New version created',
  AGREEMENT_EXPIRED: 'Agreement expired',
  AGREEMENT_CANCELLED: 'Agreement cancelled',
};

const TenancyAgreementDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const role = user?.user_type === 'landlord' ? 'landlord' : user?.user_type === 'tenant' ? 'tenant' : null;

  const [agreement, setAgreement] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [consent, setConsent] = useState(false);
  const [signatoryName, setSignatoryName] = useState(user?.full_name || '');
  const [declineReason, setDeclineReason] = useState('');
  const [amendNote, setAmendNote] = useState('');
  const [amendSpecialTerms, setAmendSpecialTerms] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, auditRes] = await Promise.all([
        tenancyAgreementService.getById(id),
        tenancyAgreementService.getAudit(id),
      ]);
      setAgreement(detail.data);
      setAudit(auditRes.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load agreement');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const canReview = role && (
    (role === 'landlord' && agreement?.status === 'PENDING_LANDLORD_REVIEW') ||
    (role === 'tenant' && agreement?.status === 'PENDING_TENANT_REVIEW')
  );
  const canSign = role && (
    (role === 'landlord' && agreement?.status === 'PENDING_LANDLORD_SIGNATURE') ||
    (role === 'tenant' && agreement?.status === 'PENDING_TENANT_SIGNATURE')
  );
  const canDecline = role && agreement && ['PENDING_LANDLORD_REVIEW', 'PENDING_LANDLORD_SIGNATURE', 'PENDING_TENANT_REVIEW', 'PENDING_TENANT_SIGNATURE'].includes(agreement.status);
  const canAmend = role && agreement?.status === 'FULLY_EXECUTED';

  const signatures = useMemo(() => agreement?.signatures || [], [agreement]);
  const terms = agreement?.terms || {};

  const runAction = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
      toast.success('Done');
      await load();
    } catch (error) {
      const message = error?.response?.data?.message || 'Your signature was not confirmed. Please reconnect and try again.';
      toast.error(message);
    } finally {
      setBusy('');
    }
  };

  const handleReview = () => runAction('review', () => tenancyAgreementService.review(id, role));

  const handleSign = () => {
    if (!consent) {
      toast.error('You must confirm that you reviewed the agreement before signing');
      return;
    }
    if (!signatoryName.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    return runAction('sign', () => tenancyAgreementService.sign(id, { role, consent: true, signatoryName: signatoryName.trim() }));
  };

  const handleDecline = () => {
    if (!declineReason.trim()) {
      toast.error('Please provide a reason for declining');
      return;
    }
    return runAction('decline', () => tenancyAgreementService.decline(id, { role, reason: declineReason.trim() }));
  };

  const handleAmend = () => {
    const changes = {};
    if (amendSpecialTerms.trim()) {
      changes.specialTerms = amendSpecialTerms.split('\n').map((line) => line.trim()).filter(Boolean);
    }
    if (Object.keys(changes).length === 0) {
      toast.error('Enter at least one change to request an amendment');
      return;
    }
    return runAction('amend', () => tenancyAgreementService.amend(id, { role, changes, note: amendNote.trim() || null }));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <FaSpinner className="animate-spin" /> Loading agreement...
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <FaExclamationTriangle className="mx-auto text-3xl text-amber-500" />
        <p className="mt-3 font-semibold text-slate-800">Agreement not found or you do not have access.</p>
        <Link to="/tenancy-agreements" className="mt-4 inline-block rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Back to agreements</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link to="/tenancy-agreements" className="text-sm font-semibold text-slate-500 hover:text-slate-800">← Back to agreements</Link>

        <header className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-amber-300"><FaFileSignature /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Residential Tenancy Agreement</p>
                <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{agreement.property_title || 'Property'}</h1>
                <p className="mt-1 text-sm text-slate-600">{agreement.full_address || '—'}</p>
              </div>
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${TENANCY_AGREEMENT_STATUS_TONES[agreement.status] || ''}`}>
              {TENANCY_AGREEMENT_STATUS_LABELS[agreement.status] || agreement.status}
            </span>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Agreement ID</dt><dd className="mt-1 font-semibold text-slate-900">#{agreement.id}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Version</dt><dd className="mt-1 font-semibold text-slate-900">{agreement.current_version}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Jurisdiction</dt><dd className="mt-1 font-semibold text-slate-900">{[terms.state, terms.lga].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Rent</dt><dd className="mt-1 font-semibold text-slate-900">{formatCurrency(terms.rentAmount)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Commencement</dt><dd className="mt-1 font-semibold text-slate-900">{formatDate(terms.commencementDate)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Expiry</dt><dd className="mt-1 font-semibold text-slate-900">{formatDate(terms.expiryDate)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Deposit</dt><dd className="mt-1 font-semibold text-slate-900">{formatCurrency(terms.deposit)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Payment</dt><dd className="mt-1 font-semibold capitalize text-slate-900">{terms.paymentFrequency || '—'}</dd></div>
          </dl>

          {agreement.document_hash && (
            <p className="mt-4 break-all rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              Document integrity hash: {agreement.document_hash}
            </p>
          )}
        </header>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><FaClipboardList className="text-slate-400" /> Terms</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Tenancy type</dt><dd className="mt-1 text-slate-800 capitalize">{terms.tenancyType || '—'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Permitted use</dt><dd className="mt-1 text-slate-800 capitalize">{terms.permittedUse || '—'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Occupants</dt><dd className="mt-1 text-slate-800">{terms.occupants ?? '—'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Notice period</dt><dd className="mt-1 text-slate-800">{terms.noticeConfiguration?.noticePeriodDays ?? '—'} days</dd></div>
          </dl>
          {Array.isArray(terms.specialTerms) && terms.specialTerms.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Special terms</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {terms.specialTerms.map((term, index) => <li key={index}>{term}</li>)}
              </ul>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><FaCheckCircle className="text-emerald-500" /> Signatures</h2>
          {signatures.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No signatures recorded yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {signatures.map((signature) => (
                <li key={signature.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-semibold capitalize text-slate-900">{signature.signer_role}</p>
                    <p className="text-xs text-slate-500">{signature.signatory_name} · {formatDateTime(signature.signed_at)}</p>
                  </div>
                  <p className="break-all text-[11px] text-slate-400">Event: {signature.signature_event_id}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(canReview || canSign || canDecline || canAmend) && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-bold text-amber-900">Your action</h2>
            <p className="mt-1 text-sm text-amber-800">
              Review the agreement carefully. Signing is an electronic execution and is recorded with a timestamp, your account and the document hash.
            </p>

            {canReview && (
              <button type="button" onClick={handleReview} disabled={busy === 'review'} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                {busy === 'review' ? <FaSpinner className="animate-spin" /> : <FaCheckCircle />} I have reviewed the agreement
              </button>
            )}

            {canSign && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-semibold text-amber-900">
                  Full name (as it will appear on the agreement)
                  <input value={signatoryName} onChange={(event) => setSignatoryName(event.target.value)} className="mt-1 block w-full rounded-xl border border-amber-300 px-3 py-2 text-sm text-slate-900" />
                </label>
                <label className="flex items-start gap-3 text-sm text-amber-900">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
                  I confirm that I have reviewed this agreement and I agree to sign it electronically.
                </label>
                <button type="button" onClick={handleSign} disabled={busy === 'sign'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {busy === 'sign' ? <FaSpinner className="animate-spin" /> : <FaPenNib />} Sign agreement
                </button>
                <p className="text-xs text-amber-700">If your connection drops, your signature will not be recorded — reconnect and try again.</p>
              </div>
            )}

            {canAmend && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-semibold text-amber-900">
                  Request an amendment (special terms, one per line)
                  <textarea value={amendSpecialTerms} onChange={(event) => setAmendSpecialTerms(event.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-amber-300 px-3 py-2 text-sm text-slate-900" />
                </label>
                <label className="block text-sm font-semibold text-amber-900">
                  Note
                  <input value={amendNote} onChange={(event) => setAmendNote(event.target.value)} className="mt-1 block w-full rounded-xl border border-amber-300 px-3 py-2 text-sm text-slate-900" />
                </label>
                <button type="button" onClick={handleAmend} disabled={busy === 'amend'} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                  {busy === 'amend' ? <FaSpinner className="animate-spin" /> : <FaFileSignature />} Request amendment
                </button>
              </div>
            )}

            {canDecline && (
              <div className="mt-6 border-t border-amber-200 pt-4">
                <label className="block text-sm font-semibold text-amber-900">
                  Decline the agreement
                  <input value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Reason" className="mt-1 block w-full rounded-xl border border-amber-300 px-3 py-2 text-sm text-slate-900" />
                </label>
                <button type="button" onClick={handleDecline} disabled={busy === 'decline'} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                  {busy === 'decline' ? <FaSpinner className="animate-spin" /> : <FaTimesCircle />} Decline agreement
                </button>
              </div>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><FaHome className="text-slate-400" /> History</h2>
          {audit.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {audit.map((event) => (
                <li key={event.id} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{EVENT_LABELS[event.event_type] || event.event_type}{event.version ? ` · v${event.version}` : ''}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(event.created_at)}{event.actor_role ? ` · ${event.actor_role}` : ''}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};

export default TenancyAgreementDetail;
