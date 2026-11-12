import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import LanguageSkillsField from '../common/LanguageSkillsField';
import { languages } from '../../data/languagePolicy';
export default function SupportLanguageDesk({
  user
}) {
  const [skills, setSkills] = useState([]),
    [rows, setRows] = useState([]),
    [misses, setMisses] = useState([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const senior = ['super_support_admin', 'super_admin'].includes(user?.user_type);
  const allowed = ['lga_support_admin', 'state_support_admin', 'super_support_admin', 'super_admin'].includes(user?.user_type);
  const load = async () => {
    const r = await api.get('/support-languages/profile');
    setSkills(r.data.data.skills);
    if (senior) {
      const [a, b] = await Promise.all([api.get('/support-languages/review'), api.get('/support-languages/monitor')]);
      setRows(a.data.data);
      setMisses(b.data.data);
    }
  };
  useEffect(() => {
    if (allowed) load().catch(() => setMessage('Could not load language desk.'));
  }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps
  const action = async fn => {
    setBusy(true);
    try {
      const r = await fn();
      setMessage(r.data.message || 'Saved.');
      await load();
    } catch (e) {
      setMessage(e.response?.data?.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  if (!allowed) return null;
  return <details className="my-4 rounded-xl border bg-white p-4 text-slate-900"><summary className="cursor-pointer font-semibold">Support languages, availability and response review</summary><p role="status">{message}</p><LanguageSkillsField english value={skills} onChange={setSkills} /><button disabled={busy} className="m-2 rounded bg-blue-900 p-3 text-white" onClick={() => action(() => api.put('/support-languages/profile', {
      skills
    }))}>Send skills for assessment</button><button disabled={busy} className="m-2 rounded border p-3" onClick={() => action(() => api.put('/support-languages/availability', {
      available: true,
      minutes: 60
    }))}>Available for 1 hour</button><button disabled={busy} className="m-2 rounded border p-3" onClick={() => action(() => api.put('/support-languages/availability', {
      available: false
    }))}>Unavailable / on break</button>
 {senior && <><h3 className="font-semibold">Language assessments</h3><p>Check the agent’s speaking and writing before approval. You cannot approve yourself.</p><div className="max-h-96 overflow-auto">{rows.map(row => <div key={row.user_id + row.language_id} className="border-b p-3">{row.full_name} — {languages.find(x => x.id === row.language_id)?.name} — speaking: {row.oral}; writing: {row.written}; {row.status}<button disabled={busy || Number(row.user_id) === Number(user.id)} className="m-2 rounded border p-2" onClick={() => {
            const note = window.prompt('Describe the language assessment (at least 10 characters):');
            if (note) action(() => api.post('/support-languages/review', {
              user_id: row.user_id,
              language_id: row.language_id,
              status: 'approved',
              note
            }));
          }}>Approve</button><button disabled={busy || Number(row.user_id) === Number(user.id)} className="m-2 rounded border p-2" onClick={() => {
            const note = window.prompt('Describe the assessment result:');
            if (note) action(() => api.post('/support-languages/review', {
              user_id: row.user_id,
              language_id: row.language_id,
              status: 'rejected',
              note
            }));
          }}>Reject</button></div>)}</div><h3 className="mt-4 font-semibold">Requests that waited too long</h3><p>These are review records, not findings of misconduct. Check network, workload and availability first.</p>{misses.map(row => <p key={row.id} className="border-b p-2">Ticket #{row.ticket_id} — {row.full_name} — {row.reason.replace(/_/g, ' ')} — {new Date(row.created_at).toLocaleString()} — {row.review_status || 'pending'} {row.review_note || ''}{['excused', 'needs_followup'].map(status => <button key={status} disabled={busy || Number(row.agent_id) === Number(user.id)} className="m-2 rounded border p-2" onClick={() => {
          const note = window.prompt('Record the reason after checking with the agent:');
          if (note) action(() => api.post('/support-languages/monitor/' + row.id + '/review', {
            status,
            note
          }));
        }}>{status === 'excused' ? 'Record valid reason' : 'Needs follow-up'}</button>)}</p>)}</>}
 </details>;
}
