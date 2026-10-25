import React from 'react';
import { useTranslation } from 'react-i18next';

export default function OpportunityPicker({roles, filter, onFilter, selected, onSelect}) {
  const {t}=useTranslation();
  const visible=roles.filter(role=>filter==='all'||(role.opportunity_type||'employment')===filter);
  return <section className="min-w-0 space-y-4 lg:col-span-2" aria-label={t('careers.opportunities_title')}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h3 className="text-xl font-semibold text-slate-900">{t('careers.opportunities_title')}</h3>
      <div className="flex flex-wrap gap-2" aria-label={t('careers.opportunity_type')}>
        {['all','employment','volunteer'].map(type=><button key={type} type="button" aria-pressed={filter===type} onClick={()=>onFilter(type)} className={'rounded-full border px-4 py-2 text-sm font-medium transition '+(filter===type?'border-primary-700 bg-primary-700 text-white':'border-slate-200 bg-white text-slate-700 hover:border-primary-400')}>{t('careers.opportunity_'+type)}</button>)}
      </div>
    </div>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {visible.map(role=>{const volunteer=role.opportunity_type==='volunteer';const active=String(selected)===String(role.id);return <article key={role.id} className={'min-w-0 rounded-2xl border p-5 '+(active?'border-primary-500 bg-primary-50 ring-1 ring-primary-500':'border-slate-200 bg-white')}>
        <span className={'inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide '+(volunteer?'bg-emerald-100 text-emerald-800':'bg-blue-100 text-blue-800')}>{t('careers.opportunity_'+(volunteer?'volunteer':'employment'))}</span>
        <h4 className="mt-3 break-words text-lg font-semibold text-slate-900">{role.title}</h4>
        <p className="mt-1 text-sm font-medium text-slate-600">{t(volunteer?'careers.volunteer_position':'careers.employment_position')}</p>
        {role.description&&<p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{role.description}</p>}
        {volunteer&&<p className="mt-3 text-sm font-semibold text-emerald-800">{t('careers.volunteer_free')}</p>}
        <button type="button" onClick={()=>onSelect(role)} className="btn btn-primary mt-4 w-full whitespace-normal">{t(volunteer?'careers.apply_volunteer':'careers.apply_employment')}</button>
      </article>;})}
    </div>
    {!visible.length&&<p role="status" className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">{t('careers.no_opportunities')}</p>}
  </section>;
}
