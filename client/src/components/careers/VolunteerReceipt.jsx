import React from 'react';
import {useTranslation} from 'react-i18next';

export default function VolunteerReceipt({application,onFileChange,onUpload,uploading,onInterview}) {
 const {t}=useTranslation();
 return <section className="min-w-0 space-y-5" aria-live="polite">
  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
   <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase text-emerald-800">{t('careers.opportunity_volunteer')}</span>
   <h2 className="mt-4 text-2xl font-semibold text-slate-900">{t('careers.volunteer_received')}</h2>
   <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{t('careers.volunteer_confirmation')}</p>
   <p className="mt-4 break-all font-mono text-sm font-semibold text-emerald-900">{application.reference_number}</p>
   <p className="mt-2 text-sm text-slate-700">{application.role_title} · {String(application.status).replace(/_/g,' ')}</p>
   <p className="mt-3 text-sm font-medium text-emerald-800">{t('careers.volunteer_free')}</p>
  </div>
  {['submitted','under_review'].includes(application.status)&&<div className="rounded-2xl border border-slate-200 bg-white p-6">
   <label className="block text-sm font-semibold text-slate-800">{t('careers.optional_cv')}<input name="cv" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={onFileChange} className="mt-3 block w-full min-w-0 max-w-full text-sm" /></label>
   <button type="button" disabled={uploading} onClick={onUpload} className="btn btn-secondary mt-4 whitespace-normal">{t('careers.upload_documents')}</button>
   {(application.documents||[]).map(doc=><p key={doc.id} className="mt-2 break-all text-sm text-slate-600">{doc.file_name}</p>)}
  </div>}
  {application.status==='shortlisted'&&application.interview_activated&&!application.interview_completed&&<button type="button" onClick={onInterview} className="btn btn-primary">{t('careers.interview')}</button>}
 </section>;
}
