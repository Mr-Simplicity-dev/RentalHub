import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import PropertyFeaturesForm from './PropertyFeaturesForm';

export default function PropertyUpdateEditor({ property, onClose, onSaved }) {
  const { t } = useTranslation();
  const copy = (key, fallback) => t('property_updates.' + key, { defaultValue: fallback });
  const [record,setRecord] = useState(null), [form,setForm] = useState(null);
  const [reason,setReason] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const base = `/properties/${property.id}/updates`;
  const load = async () => {
    const r = await api.get(base), data = r.data.data;
    const editable=data.requests?.[0]?.status==='rejected'?data.requests[0].proposed_data:data.current;
    setRecord(data); setForm({...editable,amenities:(editable.amenities || []).join(', '),structured_features:editable.structured_features || {}});
  };
  useEffect(() => { let active=true; api.get(base).then(r=>{if(active){const data=r.data.data;const editable=data.requests?.[0]?.status==='rejected'?data.requests[0].proposed_data:data.current;setRecord(data);setForm({...editable,amenities:(editable.amenities||[]).join(', '),structured_features:editable.structured_features||{}});}}).catch(()=>{if(active)setError(copy('load_failed','Unable to load property details. Close and try again.'));}); const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{active=false;document.body.style.overflow=previous;}; },[base]);
  const pending = record?.requests?.find(r=>r.status==='pending');
  const withdraw = async () => {
    setBusy(true);setError('');
    try {await api.post(base+'/'+pending.id+'/withdraw');await load();const draft=pending.proposed_data;setForm({...draft,amenities:(draft.amenities||[]).join(', '),structured_features:draft.structured_features||{}});setReason(pending.reason);onSaved?.();}
    catch(err){setError(err.response?.data?.message||copy('withdraw_failed','Unable to withdraw update.'));}finally{setBusy(false);}
  };
  const update = (key,value) => setForm(f=>({...f,[key]:value}));
  const submit = async e => {
    e.preventDefault();setBusy(true);setError('');
    try {
      await api.put(`/properties/${property.id}`,{title:form.title,description:form.description,amenities:form.amenities.split(',').map(v=>v.trim()).filter(Boolean),structured_features:form.structured_features,reason});
      await load();setReason('');onSaved?.();
    } catch(err){setError(err.response?.data?.message||copy('save_failed','Unable to submit changes. Please try again.'));}finally{setBusy(false);}
  };
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="property-update-title" className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 sm:p-7">
    <div className="flex items-start justify-between gap-4"><h2 id="property-update-title" className="text-xl font-semibold">{copy('title','Update property details')}</h2><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2">{copy('close','Close')}</button></div>
    <p className="my-3 text-sm text-gray-600">{copy('approval_notice','Every change requires admin approval. Published details remain unchanged until approval. If the listing is no longer accurate or safe, pause it while the update is reviewed.')}</p>
    {error&&<p role="alert" className="my-3 text-red-700">{error}</p>}
    {!record&&!error&&<p role="status">{copy('loading','Loading…')}</p>}
    {pending&&<div className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-semibold">{copy('pending_notice','Update awaiting approval')}</p><p className="mt-2 whitespace-pre-wrap">{pending.reason}</p><p className="mt-2 whitespace-pre-wrap">{pending.proposed_data?.description}</p><button disabled={busy} className="mt-3 rounded-lg border px-4 py-2" onClick={withdraw}>{copy('withdraw','Withdraw update to edit again')}</button></div>}
    {form&&!pending&&<form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      <label className="block font-medium">{copy('listing_title','Property title')}<input autoFocus required maxLength={255} value={form.title||''} onChange={e=>update('title',e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="block font-medium">{copy('description','Property description')}<textarea required rows={6} maxLength={10000} value={form.description||''} onChange={e=>update('description',e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="block font-medium">{copy('amenities','Other amenities (separate with commas)')}<textarea rows={2} value={form.amenities} onChange={e=>update('amenities',e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
      <PropertyFeaturesForm value={form.structured_features} onChange={v=>update('structured_features',v)} />
      <label className="block font-medium">{copy('reason','What changed and why?')}<textarea required minLength={5} maxLength={2000} rows={3} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
      <button disabled={busy} className="w-full rounded-xl bg-blue-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy?copy('submitting','Submitting…'):copy('submit','Submit for approval')}</button>
    </fieldset></form>}
    {record?.requests?.length>0&&<div className="mt-6 border-t pt-4"><h3 className="font-semibold">{copy('history','Update history')}</h3>{record.requests.map(r=><article key={r.id} className="mt-3 rounded-xl border p-3"><p className="font-medium">{copy(r.status,r.status)} · {new Date(r.created_at).toLocaleDateString()}</p><p className="whitespace-pre-wrap text-sm">{r.reason}</p>{r.review_note&&<p className="mt-2 whitespace-pre-wrap text-sm">{r.review_note}</p>}</article>)}</div>}
  </section></div>,document.body);
}
