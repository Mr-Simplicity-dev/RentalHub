import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import TurnstileWidget from './TurnstileWidget';

export default function PhoneAccountAccess() {
 const { establishSession }=useAuth();const navigate=useNavigate();const widget=useRef(null);
 const [phone,setPhone]=useState('');const [code,setCode]=useState('');const [token,setToken]=useState(null);const [challenge,setChallenge]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const submit=async e=>{e.preventDefault();setBusy(true);setMessage('');try{
  if(!challenge){const r=await api.post('/assisted-registration/phone/request',{phone,turnstile_token:token},{skipAuth:true,skipAuthRefresh:true});setChallenge(r.data.data.challenge_id);setMessage(r.data.data.message);widget.current?.reset();setToken(null);}
  else{const r=await api.post('/assisted-registration/phone/verify',{challenge_id:challenge,code},{skipAuth:true,skipAuthRefresh:true});await establishSession(r.data.data);navigate(r.data.data.user.registration_payment_required?'/registration-payment':r.data.data.user.user_type==='tenant'?'/tenant/dashboard':'/dashboard',{replace:true});}
 }catch(error){setMessage(error.response?.data?.message||'Unable to continue. Please try again.');}finally{setBusy(false);}};
 return <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer font-semibold text-slate-900">Sign in with a phone verification code</summary><p className="mt-3 text-sm text-slate-600">For eligible tenant and landlord accounts, including accounts created by support. Keep your code private.</p><form onSubmit={submit} className="mt-4 space-y-3"><label className="block text-sm font-medium">Phone number<input required type="tel" autoComplete="tel" value={phone} disabled={Boolean(challenge)} onChange={e=>setPhone(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 p-3" /></label>{challenge?<label className="block text-sm font-medium">Six-digit verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 p-3" /></label>:<TurnstileWidget ref={widget} action="rentalhub_login" onToken={setToken} onExpire={()=>setToken(null)} />}{message&&<p role="status" className="text-sm text-slate-700">{message}</p>}<button disabled={busy} className="w-full rounded-xl bg-blue-900 p-3 font-semibold text-white disabled:opacity-50">{busy?'Please wait…':challenge?'Verify and sign in':'Send verification code'}</button>{challenge&&<button type="button" onClick={()=>{setChallenge('');setCode('');}} className="text-sm text-blue-800">Change number or request another code</button>}</form></details>;
}
