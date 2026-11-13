import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaRegFolderOpen } from 'react-icons/fa';
export function FeaturePage({title,description,eyebrow,backTo,backLabel='Back to dashboard',actions,children,className=''}) {
  return <main className={`mx-auto w-full min-w-0 max-w-6xl space-y-6 [&_.btn]:min-h-11 px-4 py-6 text-slate-800 sm:px-6 sm:py-8 ${className}`}>
    {backTo && <Link to={backTo} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-primary-800"><FaArrowLeft aria-hidden="true" className="text-xs"/>{backLabel}</Link>}
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 max-w-3xl">{eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary-700">{eyebrow}</p>}<h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-3xl">{title}</h1>{description && <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>}</div>{actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}</header>
    {children}
  </main>;
}
export function FeatureSection({title,description,actions,children,className=''}) {
  return <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 ${className}`}><header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="text-lg font-semibold leading-7 text-slate-900">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}</div>{actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}</header>{children}</section>;
}
export function FeatureEmpty({title,description}) {return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center"><FaRegFolderOpen aria-hidden="true" className="mx-auto mb-3 text-2xl text-slate-400"/><p className="font-medium text-slate-800">{title}</p>{description && <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>}</div>;}
export function FeatureBadge({children,tone='neutral'}) {const tones={neutral:'bg-slate-100 text-slate-700',success:'bg-emerald-50 text-emerald-800',warning:'bg-amber-50 text-amber-900',danger:'bg-red-50 text-red-800',info:'bg-primary-50 text-primary-800'};return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-5 ${tones[tone]||tones.neutral}`}>{children}</span>;}
