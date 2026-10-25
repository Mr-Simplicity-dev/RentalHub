import React, {useCallback,useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import api from '../../services/api';

export default function PublicResolvedCases(){
 const {t,i18n}=useTranslation();const [data,setData]=useState(null);const [loading,setLoading]=useState(true);const [error,setError]=useState(false);const [attempt,setAttempt]=useState(0);
 const retry=useCallback(()=>setAttempt(n=>n+1),[]);
 useEffect(()=>{let active=true;setLoading(true);setError(false);api.get('/legal/treated-cases').then(response=>{const value=response.data?.data;if(!value||!Array.isArray(value.cases)||!value.stats)throw Error('Invalid case response');if(active)setData(value);}).catch(()=>{if(active){setData(null);setError(true);}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[attempt]);
 if(loading)return <p role="status" className="py-8 text-center text-slate-600">{t('lawyers_directory.loading','Loading…')}</p>;
 if(error)return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><p>{t('legalCases.error')}</p><button type="button" onClick={retry} className="btn btn-secondary mt-3">{t('legalCases.retry')}</button></div>;
 const date=value=>{const parsed=new Date(value);return value&&!Number.isNaN(parsed.getTime())?parsed.toLocaleDateString(i18n.language):'';};
 return <section className="mb-10 space-y-6" aria-label={t('legalCases.title')}>
  <div className="grid gap-4 sm:grid-cols-3">{[['total_resolved','resolved'],['tenant_against_landlord','tenant_cases'],['landlord_against_tenant','landlord_cases']].map(([field,key])=><div key={field} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-medium text-slate-600">{t('legalCases.'+key)}</p><p className="mt-2 text-3xl font-semibold text-primary-700">{Number(data.stats[field]||0).toLocaleString(i18n.language)}</p></div>)}</div>
  <h2 className="text-xl font-semibold text-slate-900">{t('legalCases.recent')}</h2>
  {data.cases.length?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.cases.map(item=><article key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"><span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{t('legalCases.resolved')}</span><h3 className="mt-3 text-base font-semibold text-slate-900">{t(item.direction==='tenant_landlord'?'legalCases.tenant_to_landlord':'legalCases.landlord_to_tenant')}</h3><p className="mt-2 break-words text-sm text-slate-600">{[item.state,date(item.resolved_at)].filter(Boolean).join(' · ')}</p></article>)}</div>:<p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-600">{t('legalCases.empty')}</p>}
  <p className="text-sm leading-6 text-slate-500">{t('legalCases.privacy')}</p>
 </section>;
}
