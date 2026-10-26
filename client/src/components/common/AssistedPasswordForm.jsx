import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import copy from '../../i18n/assistedRegistration.json';
import TurnstileWidget from './TurnstileWidget';
export default function AssistedPasswordForm() {
  const {
    user,
    logout
  } = useAuth();
  const {
    i18n
  } = useTranslation();
  const c = copy[i18n.language?.split('-')[0]] || copy.en;
  const navigate = useNavigate();
  const token = useRef(null);
  const widget = useRef(null);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!challenge) {
        const r = await api.post('/assisted-registration/phone/request', {
          phone: user.phone,
          purpose: 'recovery',
          turnstile_token: token.current
        });
        setChallenge(r.data.data.challenge_id);
        widget.current?.reset();
        token.current = null;
      } else {
        await api.post('/assisted-registration/password', {
          challenge_id: challenge,
          code,
          password
        });
        setPassword('');
        logout();
        toast.success(c.passwordSaved);
        navigate('/login', {
          replace: true
        });
      }
    } catch (e) {
      setMessage(e.response?.data?.message || c.error);
    } finally {
      setBusy(false);
    }
  };
  if (!user?.assisted_registration) return null;
  return <details className="my-6 rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-semibold">{c.passwordTitle}</summary><p className="mt-3 text-sm text-slate-600">{c.passwordHelp}</p><form onSubmit={submit} className="mt-4 space-y-3">{challenge ? <><label className="block text-sm">{c.code}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} className="mt-1 block w-full rounded-xl border p-3" /></label><label className="block text-sm">{c.newPassword}<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full rounded-xl border p-3" /></label></> : <TurnstileWidget ref={widget} action="rentalhub_login" onToken={v => {
        token.current = v;
      }} onExpire={() => {
        token.current = null;
      }} onError={() => {
        token.current = null;
      }} />}{message && <p role="status" className="text-sm text-red-700">{message}</p>}<button disabled={busy} className="rounded-xl bg-blue-900 px-4 py-3 text-white disabled:opacity-50">{busy ? c.wait : challenge ? c.savePassword : c.send}</button>{challenge && <button type="button" disabled={busy} onClick={() => {
        setChallenge('');
        setCode('');
        setPassword('');
      }} className="ml-3 text-sm text-blue-800">{c.change}</button>}</form></details>;
}
