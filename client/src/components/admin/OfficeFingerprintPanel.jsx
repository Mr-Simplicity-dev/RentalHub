import React, { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { captureOfficeFingerprint } from '../../services/officeFingerprintCapture';

export default function OfficeFingerprintPanel({ records, user }) {
  const [status, setStatus] = useState(null);
  const [reference, setReference] = useState('');
  const [enrollment, setEnrollment] = useState(null);
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [samples, setSamples] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const scanning = useRef(null);
  const mounted = useRef(true);
  const base = '/assisted-registration/staff/' + encodeURIComponent(reference) + '/fingerprint';
  useEffect(() => {
    mounted.current = true;
    api.get('/assisted-registration/staff/biometric-status').then(r => { if (mounted.current) setStatus(r.data.data); }).catch(() => { if (mounted.current) setStatus({ available: false, reason: 'Unable to check fingerprint availability. Refresh to try again.' }); });
    return () => { mounted.current = false; scanning.current?.abort(); };
  }, []);
  useEffect(() => {
    let current = true;
    scanning.current?.abort();
    setEnrollment(null); setSamples([]); setConsent(false); setChallenge(''); setCode(''); setMessage('');
    if (reference) api.get(base).then(r => { if (current) setEnrollment(r.data.data); }).catch(() => { if (current) setMessage('Unable to load fingerprint enrollment. Select the account again.'); });
    return () => { current = false; };
  }, [reference, base]);
  const run = async fn => {
    setBusy(true); setMessage('');
    try { await fn(); }
    catch (error) { if (mounted.current) setMessage(error.response?.data?.message || error.message || 'Unable to complete fingerprint verification.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const scan = () => run(async () => {
    scanning.current = new AbortController();
    setMessage(enrollment.enrolled ? 'Place the enrolled finger on the reader.' : samples.length ? 'Lift your finger, then place the same finger on the reader again.' : 'Place a finger on the reader.');
    const image = await captureOfficeFingerprint(scanning.current.signal);
    if (!mounted.current) return;
    if (enrollment.enrolled) {
      const r = await api.post(base + '/verify', { image });
      if (mounted.current) setMessage(r.data.data.message);
    } else {
      if (samples[0] === image) throw new Error('Lift your finger and take a new scan.');
      setSamples(previous => [...previous, image]);
      setMessage(samples.length ? 'Two scans captured. Submit to complete enrollment.' : 'First scan captured. Lift your finger before taking the second scan.');
    }
  });
  const button = 'rounded-xl bg-blue-900 px-4 py-3 text-white disabled:opacity-50';
  return <aside className="rounded-2xl border bg-slate-50 p-5">
    <h2 className="font-semibold">Office fingerprint verification</h2>
    <p className="mt-2 text-sm text-slate-600">Use the office Windows computer and U.are.U 4500 reader. A match supports staff identity checks; it does not sign in as the customer or authorize account changes.</p>
    {!status ? <p role="status">Checking availability…</p> : !status.available ? <p className="mt-3" role="status">{status.reason}</p> : <>
      <label className="mt-4 block">Customer account<select className="mt-1 block w-full rounded-xl border p-3" value={reference} disabled={busy} onChange={e => setReference(e.target.value)}><option value="">Select an account from the registration results</option>{records.map(row => <option key={row.reference} value={row.reference}>{row.full_name} — {row.reference}</option>)}</select></label>
      {enrollment && <div className="mt-4 space-y-3">
        <p>{enrollment.enrolled ? 'A fingerprint is enrolled for this account.' : 'No fingerprint is enrolled for this account.'}</p>
        {!enrollment.enrolled && <>
          <p className="text-sm">Explain that an encrypted fingerprint template will be stored for office verification. Enrollment is optional. The customer can request removal through a support supervisor. Raw scans are not saved.</p>
          <label className="flex gap-2"><input type="checkbox" checked={consent} disabled={busy || Boolean(challenge)} onChange={e => setConsent(e.target.checked)} />The customer understands and agrees to fingerprint enrollment.</label>
          <button type="button" className={button} disabled={busy || !consent} onClick={() => run(async () => { setChallenge(''); setSamples([]); setCode(''); const r = await api.post(base + '/consent', { consent_confirmed: true }); if (mounted.current) { setChallenge(r.data.data.challenge_id); setMessage(r.data.data.message); } })}>Send customer approval code</button>
          {challenge && <label className="block">Customer enrollment approval code<input className="mt-1 block w-full rounded-xl border p-3" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="off" maxLength={6} disabled={busy} /></label>}
        </>}
        {(enrollment.enrolled || challenge) && <div className="flex flex-wrap gap-3">
          <button type="button" className={button} disabled={busy || enrollment.compatible === false || (!enrollment.enrolled && (samples.length >= 2 || code.length !== 6))} onClick={scan}>{enrollment.enrolled ? 'Scan and verify' : samples.length ? 'Capture second scan' : 'Capture first scan'}</button>
          {!enrollment.enrolled && samples.length === 2 && <button type="button" className={button} disabled={busy || code.length !== 6} onClick={() => run(async () => {
            try { const r = await api.post(base + '/enroll', { consent_confirmed: consent, challenge_id: challenge, enrollment_code: code, image: samples[0], confirmation: samples[1] }); if (mounted.current) { setEnrollment({ enrolled: true, compatible: true }); setMessage(r.data.data.message); } }
            finally { if (mounted.current) { setSamples([]); setCode(''); setChallenge(''); } }
          })}>Enroll fingerprint</button>}
          {enrollment.enrolled && ['super_admin', 'super_support_admin'].includes(user?.user_type) && <button type="button" className="rounded-xl border px-4 py-3" disabled={busy} onClick={() => { if (window.confirm('Remove this customer’s saved fingerprint? They will need to approve any new enrollment.')) run(async () => { await api.delete(base); if (mounted.current) { setEnrollment({ enrolled: false, compatible: true }); setMessage('Fingerprint enrollment removed.'); } }); }}>Remove enrollment</button>}
        </div>}
        {enrollment.compatible === false && <p>Re-enrollment is required for the current engine version. Contact a support supervisor.</p>}
      </div>}
    </>}
    {busy && scanning.current && <button type="button" className="mt-3 rounded-xl border px-4 py-3" onClick={() => scanning.current?.abort()}>Cancel scan</button>}
    {message && <p className="mt-3 text-sm" role="status" aria-live="polite">{message}</p>}
  </aside>;
}
