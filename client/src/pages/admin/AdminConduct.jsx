import {Link} from 'react-router-dom';
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
  const reviewer = user?.user_type === 'super_admin' || user?.user_type === 'recruitment_admin' || user?.is_recruitment_admin;
  const load = async () => {
    const r = await api.get('/admin-conduct/mine');
    setData(r.data.data);
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
  return <main className="mx-auto max-w-4xl space-y-5 p-5 text-slate-900"><Link className="inline-block rounded border p-3" to="/admin">Back to my admin dashboard</Link><h1 className="text-2xl font-bold">Admin Code of Conduct</h1><p>Read the approved rules for your role. Physical delivery to Recruitment is free. Optional electronic signing and submission costs ₦5,000. Signing and confirmed payment are both required.</p><p role="status" className="rounded bg-blue-50 p-3">{message}</p>
 {data.documents.length === 0 && user?.user_type !== 'super_admin' && <p>No approved document is available for your role yet. Please contact Recruitment.</p>}
 {data.documents.map(d => <section key={d.id} className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">{d.role.replace(/_/g, ' ')} — {d.version}</h2><button className="rounded border p-3" onClick={async () => {
        if (await download('/admin-conduct/documents/' + d.id + '/download', 'Code-of-Conduct.pdf')) setRead(d.id);
      }}>Download and read / print for free physical submission</button><p className="break-all text-xs">Document fingerprint: {d.sha256}</p><label className="block">Your full account name<input className="block w-full rounded border p-3" value={name} maxLength={255} onChange={e => setName(e.target.value)} /></label><label className="flex gap-2"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{data.consent}</span></label><button disabled={busy || read !== d.id || !consent || !name.trim()} className="rounded bg-blue-900 p-3 text-white disabled:opacity-50" onClick={() => action(() => api.post('/admin-conduct/sign', {
        document_id: d.id,
        document_hash: d.sha256,
        signed_name: name,
        consent: true
      }))}>Sign electronically</button></section>)}
 {data.submissions.map(s => <section key={s.id} className="space-y-2 rounded-xl border p-4"><h2 className="font-semibold">Your submission — {s.status.replace(/_/g, ' ')}</h2>{s.review_note && <p>Recruitment: {s.review_note}</p>}{s.status==='returned'&&<p>Read the review note. You can use the form above to sign this document again. Your existing payment will be reused.</p>}{s.status === 'pending_payment' ? <><button disabled={busy} className="m-2 rounded bg-blue-900 p-3 text-white" onClick={async () => {
          const r = await action(() => api.post('/admin-conduct/' + s.id + '/pay'));
          if (r?.data?.data?.authorization_url) window.location.assign(r.data.data.authorization_url);
        }}>Pay ₦5,000 and submit</button><button disabled={busy} className="m-2 rounded border p-3" onClick={() => action(() => api.post('/admin-conduct/' + s.id + '/verify'))}>Already paid? Check payment</button></> : <><button className="m-2 rounded border p-3" onClick={() => download('/admin-conduct/' + s.id + '/receipt', 'Conduct-signature-and-receipt.pdf')}>Download signature record and receipt</button><button className="m-2 rounded border p-3" onClick={() => download('/admin-conduct/' + s.id + '/signed-copy', 'Signed-Code-of-Conduct.zip')}>Download signed document pack</button></>}</section>)}
 {user?.user_type === 'super_admin' && <section><h2 className="text-xl font-semibold">Approve documents for use</h2><p>These files remain drafts until you adopt the exact version. Read each document before adopting it.</p>{docs.map(d => <div key={d.id} className="border-b p-3">{d.role} — {d.version} — {d.active ? 'Active' : 'Not active'} <button className="m-2 rounded border p-2" onClick={() => download('/admin-conduct/documents/' + d.id + '/download', 'Conduct-draft.pdf')}>Read</button><button disabled={busy || d.active} className="rounded border p-2" onClick={() => {
          if (window.confirm('Adopt this exact Code of Conduct version for this role?')) action(() => api.post('/admin-conduct/documents/' + d.id + '/adopt', {
            confirm: true
          }));
        }}>Adopt</button></div>)}</section>}
 {reviewer && <section><h2 className="text-xl font-semibold">Recruitment submissions</h2>{queue.map(s => <div key={s.id} className="border-b p-3">{s.full_name} — {s.user_type} — {s.version} — {s.status}<button className="m-2 rounded border p-2" onClick={() => download('/admin-conduct/' + s.id + '/signed-copy', 'Signed-Code-of-Conduct.zip')}>Read signed pack</button>{['accepted', 'returned'].map(status => <button key={status} disabled={busy || s.status === 'accepted' || Number(s.user_id) === Number(user.id)} className="m-2 rounded border p-2" onClick={() => {
          const note = window.prompt('Recruitment review note:');
          if (note) action(() => api.post('/admin-conduct/' + s.id + '/review', {
            status,
            note
          }));
        }}>{status === 'accepted' ? 'Accept' : 'Return for correction'}</button>)}</div>)}</section>}
 </main>;
}
