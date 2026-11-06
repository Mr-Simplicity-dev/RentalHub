import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const options = { skipAuth: true, skipAuthRefresh: true };
export default function RegistrationPhoneVerification({ pending, onVerified, onClose }) {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState(pending.challenge);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(true);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(60);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const resend = async () => {
    if (inFlight.current || cooldown > 0) return;
    inFlight.current = true; setBusy(true); setSent(false); setError('');
    try {
      const response = await api.post('/auth/register/phone/resend', { ...pending.payload, phone_challenge: challenge, registration_flow: pending.flow }, options);
      if (mounted.current) { setChallenge(response.data.data.phone_challenge); setSent(true); setCooldown(60); setCode(''); }
    } catch (err) { if (mounted.current) setError(err.response?.data?.message || t('register.otp_send_failed')); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const verify = async event => {
    event.preventDefault();
    if (inFlight.current || !/^\d{6}$/.test(code)) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await api.post(pending.flow === 'free' ? '/auth/register/verify-phone' : '/auth/register/payment/verify-phone', { ...pending.payload, phone_challenge: challenge, otp: code }, options);
      if (!response.data.success) throw new Error(response.data.message);
      if (mounted.current) await onVerified(response.data.data);
    } catch (err) { if (mounted.current) setError(err.response?.data?.message || err.message || t('register.otp_complete_failed')); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="registration-phone-title">
    <form onSubmit={verify} className="my-auto w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
      <h2 id="registration-phone-title" className="text-xl font-bold text-gray-900">{t('register.otp_title')}</h2>
      <p className="mt-3 text-sm text-gray-600" role="status">{sent ? t(pending.flow === 'free' ? 'register.otp_body' : 'register.otp_pre_payment_body') : busy ? t('register.otp_sending') : t('register.otp_send_failed')}</p>
      <label className="sr-only" htmlFor="registration-phone-code">{t('register.otp_title')}</label>
      <input id="registration-phone-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} autoFocus className="mt-4 w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-2xl font-bold tracking-widest" />
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <button type="submit" disabled={busy || !sent || code.length !== 6} className="mt-4 w-full rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? t('register.otp_completing') : t(pending.flow === 'free' ? 'register.otp_verify_and_complete' : 'register.otp_verify_payment')}</button>
      <button type="button" disabled={busy || cooldown > 0} onClick={resend} className="mt-3 w-full py-2 font-semibold text-primary-600 disabled:opacity-50">{t('register.otp_resend')}{cooldown ? ` (${cooldown}s)` : ''}</button>
      <button type="button" disabled={busy} onClick={onClose} className="mt-2 w-full py-2 text-gray-600">{t('common.back')}</button>
    </form>
  </div>;
}
