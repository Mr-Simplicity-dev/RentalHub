import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';

const anonymous = { skipAuth: true, skipAuthRefresh: true };
let sdk;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!sdk) sdk = new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { sdk = null; script.remove(); reject(Error('Google sign-in could not load.')); };
    document.head.append(script);
  });
  return sdk;
}

export default function CustomerGoogleSignIn({ mobile = false, onSignedIn }) {
  const {t}=useTranslation();
  const [started,setStarted]=useState(mobile);
  const [params] = useSearchParams();
  const id = mobile ? params.get('request') : null;
  const button = useRef(null), challenge = useRef(null), pending = useRef(''), latest = useRef(null);
  const [message,setMessage] = useState(''), [returnUrl,setReturnUrl] = useState(''), [factor,setFactor] = useState(''), [factorType,setFactorType] = useState(''), [register,setRegister] = useState(false), [busy,setBusy] = useState(false), [attempt,setAttempt] = useState(0);
  latest.current = async (credential, value = '', type = '') => {
    if (!credential || !challenge.current || busy) return;
    setBusy(true); setMessage('');
    const data = challenge.current;
    try {
      const reply = await api.post('/auth/google', { credential, request_id:data.id, verifier:data.verifier, factor:type === 'mfa' ? value : undefined, mailbox_code:type === 'email' ? value : undefined }, anonymous);
      pending.current = ''; setFactorType('');
      if (mobile) setReturnUrl('rentalhub://google-signin?request=' + encodeURIComponent(id) + '&code=' + encodeURIComponent(reply.data.data.code));
      else await onSignedIn(reply.data.data);
    } catch (e) {
      const details = e.response?.data || {};
      if (['GOOGLE_MFA_REQUIRED','GOOGLE_EMAIL_REQUIRED'].includes(details.code)) {
        pending.current = credential; setFactor(''); setFactorType(details.code === 'GOOGLE_MFA_REQUIRED' ? 'mfa' : 'email');
      }
      if (details.code === 'REGISTRATION_REQUIRED') setRegister(true);
      setMessage(details.message || 'Unable to complete Google sign-in. Please try again.');
    } finally { setBusy(false); }
  };
  useEffect(() => {
    if(!started)return;
    let active = true;
    challenge.current = null; pending.current = ''; setFactorType(''); setMessage(''); setRegister(false);
    (async () => {
      if (mobile && !id) throw Error('Start Google sign-in from the RentalHub app.');
      const reply = mobile ? await api.get('/auth/google/mobile/' + encodeURIComponent(id), anonymous) : await api.post('/auth/google/start', {mode:'web'}, anonymous);
      if (!active) return;
      challenge.current = reply.data.data;
      await loadGoogle();
      if (!active || !button.current) return;
      const {clientId,nonce} = challenge.current;
      window.google.accounts.id.initialize({client_id:clientId,nonce,auto_select:false,callback:r => {if (active) latest.current(r.credential);}});
      window.google.accounts.id.renderButton(button.current,{theme:'outline',size:'large',text:'signin_with',shape:'rectangular'});
    })().catch(e => {if (active) setMessage(e.response?.data?.message || e.message);});
    return () => {active = false; pending.current = '';};
  }, [mobile,id,attempt,started]);
  const contents = !started ? <button type="button" onClick={()=>setStarted(true)} className="min-h-11 rounded-xl border border-slate-300 px-5 py-3 font-semibold">{t('login.google_start','Continue with Google')}</button> : <div className="flex flex-col items-center gap-3 text-center">
    {returnUrl ? <a className="rounded-xl bg-blue-900 px-5 py-3 font-semibold text-white" href={returnUrl}>Return to RentalHub app</a> : <>
      <div ref={button} hidden={Boolean(factorType)} />
      {factorType && <form onSubmit={e => {e.preventDefault();latest.current(pending.current,factor,factorType);}} className="grid gap-2"><label>{factorType === 'email' ? 'Code sent to your registered email' : 'Authenticator or recovery code'}<input className="block w-full rounded border p-2" autoComplete="one-time-code" value={factor} onChange={e => setFactor(e.target.value.trim())} required maxLength={16} /></label><button disabled={busy} className="rounded bg-blue-900 p-2 text-white">Verify and continue</button></form>}
      {message && <p role="status">{message}</p>}{register && <Link to="/register" className="font-semibold underline">Complete RentalHub registration</Link>}{message && !factorType && !register && <button type="button" onClick={() => setAttempt(n=>n+1)}>Retry Google sign-in</button>}
    </>}
  </div>;
  return mobile ? <main className="mx-auto mt-12 max-w-md rounded-2xl bg-white p-6 text-center shadow"><h1 className="text-xl font-bold">Sign in to Amana RentalHub NG</h1><p className="my-4">Choose the Google account for your registered tenant or landlord email, then return to the app.</p>{contents}</main> : contents;
}
