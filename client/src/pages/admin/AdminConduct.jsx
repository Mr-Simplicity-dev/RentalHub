import {FeaturePage,FeatureSection,FeatureBadge,FeatureEmpty} from '../../components/common/FeaturePage';
import InputDialog from '../../components/common/InputDialog';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
export default function AdminConduct() {
  const {
    user
  } = useAuth();
  const [data, setData] = useState({
      documents: [],
      submissions: []
    }),
    [queue, setQueue] = useState([]),
    [docs, setDocs] = useState([]),
    [name, setName] = useState(''),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [read, setRead] = useState(null);
  const [decision,setDecision]=useState(null),[decisionError,setDecisionError]=useState('');
  const reviewer = user?.user_type === 'super_admin' || user?.user_type === 'recruitment_admin' || user?.is_recruitment_admin;
  const load = async () => {
    if(user?.user_type !== 'super_admin') { const r = await api.get('/admin-conduct/mine'); setData(r.data.data); }
    if (reviewer) setQueue((await api.get('/admin-conduct/queue')).data.data);
    if (user?.user_type === 'super_admin') setDocs((await api.get('/admin-conduct/documents')).data.data);
  };
  useEffect(() => {
    load().catch(() => setMessage('Could not load Code of Conduct. Please retry.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const action = async fn => {
    setBusy(true);
    try {
      const r = await fn();
      setMessage(r?.data?.message || 'Saved.');
      await load();
      return r;
    } catch (e) {
      setMessage(e.response?.data?.message || 'Could not complete this action. Please retry.');
      return null;
    } finally {
      setBusy(false);
    }
  };
  const download = async (url, file) => {
    try {
      const r = await api.get(url, {
          responseType: 'blob'
        }),
        u = URL.createObjectURL(r.data),
        a = document.createElement('a');
      a.href = u;
      a.download = file;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      return true;
    } catch {
      setMessage('Could not download the document.');
      return false;
    }
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('reference')) {
      const s = data.submissions.find(x => x.payment_reference === new URLSearchParams(window.location.search).get('reference'));
      if (s?.status === 'pending_payment') action(() => api.post('/admin-conduct/' + s.id + '/verify'));
    }
  }, [data.submissions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return <FeaturePage title={user?.user_type==='super_admin'?'Code of Conduct management':'Admin Code of Conduct'} eyebrow="Staff governance" description={user?.user_type==='super_admin'?'Approve staff documents and review submissions. Super Admin does not sign these staff forms.':'Read the rules for your role, then choose free physical delivery or optional electronic signing and submission.'} backTo={user?.user_type==='super_admin'?'/super-admin':'/admin'} backLabel="Back to my admin dashboard">
    {message&&<p role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">{message}</p>}
    {user?.user_type!=='super_admin'&&<div className="grid gap-4 sm:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5"><FeatureBadge tone="success">Free</FeatureBadge><h2 className="mt-3 font-semibold text-slate-900">Physical delivery</h2><p className="mt-2 text-sm leading-6 text-slate-600">Download, print and sign your document. Deliver it to Recruitment yourself.</p></section><section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5"><FeatureBadge tone="info">Optional · ₦5,000</FeatureBadge><h2 className="mt-3 font-semibold text-slate-900">Electronic signing and submission</h2><p className="mt-2 text-sm leading-6 text-slate-600">Read the document, sign below and confirm payment. Signing and confirmed payment are both required.</p></section></div>}
    {data.documents.length===0&&user?.user_type!=='super_admin'&&<FeatureEmpty title="No approved document for your role yet" description="Please contact Recruitment before signing or making a payment."/>}
    {data.documents.map(d=><FeatureSection key={d.id} title={d.role.replace(/_/g,' ')+' — '+d.version} description="Read the approved document before signing. Keep a copy for your records." actions={<FeatureBadge tone="success">Approved version</FeatureBadge>}>
      <button type="button" className="btn btn-secondary whitespace-normal text-center" onClick={async()=>{if(await download('/admin-conduct/documents/'+d.id+'/download','Code-of-Conduct.pdf'))setRead(d.id);}}>Download and read / print for free physical submission</button>
      <details className="my-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Document verification details</summary><p className="mt-2 break-all leading-5">Document fingerprint: {d.sha256}</p></details>
      <div className="space-y-5 border-t border-slate-100 pt-5"><label className="block text-sm font-medium text-slate-800">Your full account name<input className="input mt-2" value={name} maxLength={255} onChange={e=>setName(e.target.value)}/></label><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-700"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"/><span>{data.consent}</span></label><button type="button" disabled={busy||read!==d.id||!consent||!name.trim()} className="btn btn-primary" onClick={()=>action(()=>api.post('/admin-conduct/sign',{document_id:d.id,document_hash:d.sha256,signed_name:name,consent:true}))}>Sign electronically</button></div>
    </FeatureSection>)}
    {data.submissions.length>0&&<FeatureSection title="My submissions" description="Follow the payment and Recruitment review status of each signed document."><div className="space-y-4">{data.submissions.map(s=><article key={s.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Your submission</h3><FeatureBadge tone={s.status==='accepted'?'success':s.status==='returned'?'warning':'info'}>{s.status.replace(/_/g,' ')}</FeatureBadge></div>{s.review_note&&<p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6">Recruitment: {s.review_note}</p>}{s.status==='returned'&&<p className="mt-3 text-sm leading-6 text-slate-600">Read the review note. You can use the form above to sign this document again. Your existing payment will be reused.</p>}<div className="mt-4 flex flex-wrap gap-3">{s.status==='pending_payment'?<><button disabled={busy} className="btn btn-primary" onClick={async()=>{const r=await action(()=>api.post('/admin-conduct/'+s.id+'/pay'));if(r?.data?.data?.authorization_url)window.location.assign(r.data.data.authorization_url);}}>Pay ₦5,000 and submit</button><button disabled={busy} className="btn btn-secondary" onClick={()=>action(()=>api.post('/admin-conduct/'+s.id+'/verify'))}>Already paid? Check payment</button></>:<><button className="btn btn-secondary" onClick={()=>download('/admin-conduct/'+s.id+'/receipt','Conduct-signature-and-receipt.pdf')}>Download signature record and receipt</button><button className="btn btn-secondary" onClick={()=>download('/admin-conduct/'+s.id+'/signed-copy','Signed-Code-of-Conduct.zip')}>Download signed document pack</button></>}</div></article>)}</div></FeatureSection>}
    {user?.user_type==='super_admin'&&<FeatureSection title="Approve documents for use" description="Read the exact version before adopting it. Draft documents cannot be used for staff signing.">{docs.length?<div className="grid gap-4 md:grid-cols-2">{docs.map(d=><article key={d.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 p-4"><div className="mb-3"><FeatureBadge tone={d.active?'success':'warning'}>{d.active?'Active':'Draft'}</FeatureBadge></div><h3 className="break-words font-semibold capitalize leading-6 text-slate-900">{d.role.replace(/_/g,' ')}</h3><p className="mt-1 text-sm text-slate-500">Version {d.version}</p><div className="mt-5 flex flex-wrap gap-2"><button className="btn btn-secondary" onClick={()=>download('/admin-conduct/documents/'+d.id+'/download','Conduct-draft.pdf')}>Read</button><button disabled={busy||d.active} className="btn btn-primary" onClick={()=>{setDecisionError('');setDecision({kind:'adopt',document:d});}}>Adopt</button></div></article>)}</div>:<FeatureEmpty title="No document versions to show" description="Available staff documents will appear here."/>}</FeatureSection>}
    {reviewer&&<FeatureSection title="Recruitment submissions" description="Read the signed document pack before accepting it or returning it for correction.">{queue.length?<div className="space-y-4">{queue.map(s=><article key={s.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold text-slate-900">{s.full_name}</h3><p className="mt-1 text-sm capitalize text-slate-600">{s.user_type.replace(/_/g,' ')} · Version {s.version}</p></div><FeatureBadge tone={s.status==='accepted'?'success':'warning'}>{s.status.replace(/_/g,' ')}</FeatureBadge></div><div className="mt-4 flex flex-wrap gap-2"><button className="btn btn-secondary" onClick={()=>download('/admin-conduct/'+s.id+'/signed-copy','Signed-Code-of-Conduct.zip')}>Read signed pack</button>{['accepted','returned'].map(status=><button key={status} disabled={busy||s.status==='accepted'||Number(s.user_id)===Number(user.id)} className={'btn '+(status==='accepted'?'btn-primary':'btn-secondary')} onClick={()=>{setDecisionError('');setDecision({kind:'review',submission:s,status});}}>{status==='accepted'?'Accept':'Return for correction'}</button>)}</div></article>)}</div>:<FeatureEmpty title="No submissions awaiting display" description="Staff submissions will appear here when they are ready for Recruitment review."/>}</FeatureSection>}
    <InputDialog isOpen={Boolean(decision)} title={decision?.kind==='adopt'?'Adopt document version':'Record Recruitment decision'} message={decisionError||(decision?.kind==='adopt'?`Adopt ${decision.document.version} for ${decision.document.role.replace(/_/g,' ')}? This exact version will become available to staff.`:'Explain the evidence you reviewed. The note is kept with this submission.')} confirmText={decision?.kind==='adopt'?'Adopt document':'Save decision'} onCancel={()=>!busy&&setDecision(null)} isLoading={busy} onConfirm={async({note})=>{const r=await action(()=>decision.kind==='adopt'?api.post('/admin-conduct/documents/'+decision.document.id+'/adopt',{confirm:true}):api.post('/admin-conduct/'+decision.submission.id+'/review',{status:decision.status,note:note.trim()}));if(r)setDecision(null);else setDecisionError('The action was not saved. Please check the message and try again.');}} inputs={decision?.kind==='review'?[{name:'note',label:'Recruitment review note',type:'textarea',required:true,maxLength:2000,validate:value=>String(value||'').trim().length>=5||'Write a clear review note of at least 5 characters.'}]:[]}/>
  </FeaturePage>;
}
