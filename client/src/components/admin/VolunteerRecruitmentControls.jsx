import React, {useState} from 'react';
import {toast} from 'react-toastify';
import {useAuth} from '../../hooks/useAuth';
import api from '../../services/api';

export function OpportunityTypeField({value='employment',onChange,disabled=false}) {
 return <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Opportunity type</span><select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} className="input w-full"><option value="employment">Employment</option><option value="volunteer">Volunteer</option></select><span className="mt-1 block text-xs leading-5 text-slate-500">Volunteer applications are free. Type is fixed after creation to preserve application history.</span></label>;
}
export function OpportunityBadge({type}) {
 return <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase '+(type==='volunteer'?'bg-emerald-100 text-emerald-800':'bg-blue-50 text-blue-800')}>{type==='volunteer'?'Volunteer':'Employment'}</span>;
}
export default function VolunteerRecruitmentControls({status,analytics,onUpdated,disabled=false}) {
 const {user}=useAuth();const [saving,setSaving]=useState(false);const enabled=status?.volunteer_applications_enabled===true;
 const toggle=async()=>{setSaving(true);try{await api.put('/recruitment/admin/settings/volunteers',{volunteer_applications_enabled:!enabled});await onUpdated();toast.success('Volunteer application setting saved');}catch(error){toast.error(error.response?.data?.message||'Could not update volunteer applications');}finally{setSaving(false);}};
 return <section className="my-5 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
  <div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><h2 className="text-lg font-semibold text-slate-900">Volunteer Applications</h2><p className="mt-1 text-sm leading-6 text-slate-600">{enabled?'Volunteer opportunities are currently accepting applications.':'Volunteer applications are currently closed.'}</p><p className="mt-1 text-xs text-slate-500">Independent of paid employment recruitment. Volunteers enter review without payment or automatic accounts.</p></div>
  {user?.user_type==='super_admin'?<button type="button" role="switch" aria-checked={enabled} aria-label="Volunteer Applications" disabled={disabled||saving} onClick={toggle} className={'min-w-24 rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50 '+(enabled?'bg-emerald-700 text-white':'bg-slate-200 text-slate-800')}>{saving?'Saving…':enabled?'ON':'OFF'}</button>:<span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">{enabled?'ON':'OFF'} · Super Admin control</span>}</div>
  {analytics&&<div className="mt-5 border-t border-slate-100 pt-4"><p className="text-sm font-semibold text-slate-800">Volunteer applications: {analytics.volunteer_applicants||0}</p><div className="mt-3 grid gap-4 text-sm sm:grid-cols-3">{[['By opportunity',analytics.volunteer_by_role,'title'],['By status',analytics.volunteer_by_status,'status'],['By location',analytics.volunteer_by_location,'state_name']].map(([title,rows,key])=><div key={title}><h3 className="font-medium text-slate-700">{title}</h3>{(rows||[]).map((row,i)=><p key={i} className="mt-1 break-words text-slate-600">{String(row[key]||'').replace(/_/g,' ')}{key==='state_name'?' / '+row.lga_name:''}: {row.count}</p>)}</div>)}</div></div>}
 </section>;
}
