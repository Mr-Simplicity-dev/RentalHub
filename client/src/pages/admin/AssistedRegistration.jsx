import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
const roles = ['super_admin', 'super_support_admin', 'zonal_admin', 'state_support_admin', 'lga_support_admin'];
const empty = {
  user_type: 'tenant',
  full_name: '',
  phone: '',
  email: '',
  state_id: '',
  lga_name: '',
  nin: '',
  date_of_birth: '',
  lawyer_email: '',
  use_rentalhub_lawyers: false,
  use_rentalhub_agents: false,
  consent_confirmed: false
};
const money = n => '₦' + Number(n || 0).toLocaleString('en-NG', {
  minimumFractionDigits: 2
});
export default function AssistedRegistration() {
  const {
    user
  } = useAuth();
  const [form, setForm] = useState(empty);
  const [locations, setLocations] = useState([]);
  const [ninEnabled, setNinEnabled] = useState(true);
  const [records, setRecords] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(crypto.randomUUID());
  const [cash, setCash] = useState(null);
  const [received, setReceived] = useState(false);
  const [note, setNote] = useState('');
  const refresh = async () => {
    const r = await api.get('/assisted-registration/staff', {
      params: {
        search
      }
    });
    setRecords(r.data.data);
  };
  useEffect(() => {
    if (roles.includes(user?.user_type)) {
      api.get('/assisted-registration/staff/config').then(r => {
        setNinEnabled(r.data.data.nin_enabled);
        if (!r.data.data.nin_enabled) setForm(f => ({
          ...f,
          nin: '',
          date_of_birth: ''
        }));
      }).catch(() => setMessage('Unable to load identity settings. Please refresh.'));
      api.get('/property-utils/location-options').then(r => setLocations(r.data.data || [])).catch(() => setMessage('Unable to load locations. Please refresh.'));
      refresh().catch(() => setMessage('Unable to load registrations. Please refresh.'));
    }
  }, [user?.user_type]);
  const update = (key, value) => {
    setForm(f => ({
      ...f,
      [key]: value,
      ...(key === 'state_id' ? {
        lga_name: ''
      } : {}),
      ...(key === 'user_type' && value === 'tenant' ? {
        use_rentalhub_agents: false
      } : {})
    }));
    setPricing(null);
  };
  const run = async fn => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      if (e.response?.data?.code === 'REGISTRATION_QUOTE_CHANGED') setPricing(null);
      setMessage(e.response?.data?.message || 'Unable to complete this request. Retry without creating a second account.');
    } finally {
      setBusy(false);
    }
  };
  const submit = e => {
    e.preventDefault();
    run(async () => {
      if (!pricing) {
        const r = await api.post('/assisted-registration/staff/quote', form);
        setPricing(r.data.data);
        return;
      }
      const r = await api.post('/assisted-registration/staff', {
        ...form,
        expected_amount: pricing.amount,
        request_id: request.current
      });
      setMessage('Account saved: ' + r.data.data.reference + '. The customer signs in with a phone verification code.');
      request.current = crypto.randomUUID();
      setForm(empty);
      setPricing(null);
      await refresh();
    });
  };
  const receipt = row => run(async () => {
    const r = await api.get('/assisted-registration/staff/' + encodeURIComponent(row.reference) + '/receipt', {
      responseType: 'blob'
    });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registration-receipt.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  if (!roles.includes(user?.user_type)) return <main className="p-8">Support registration access is required.</main>;
  const field = (key, label, type = 'text', required = true) => <label className="block text-sm font-medium text-slate-700">{label}<input type={type} required={required} value={form[key]} onChange={e => update(key, e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 p-3" /></label>;
  const state = locations.find(s => String(s.id) === String(form.state_id));
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8"><Link to={user.user_type === 'super_admin' ? '/super-admin' : '/admin'} className="text-blue-800">← Dashboard</Link><header><p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Support workspace</p><h1 className="mt-2 text-3xl font-bold text-slate-900">Assisted account registration</h1><p className="mt-3 max-w-2xl text-slate-600">Help a customer create their own tenant or landlord account. Explain each field and the fee. Only confirm cash you have actually received.</p></header><div role="status" aria-live="polite" className="text-sm text-blue-900">{message}</div><form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-5 text-xl font-semibold">Customer details</h2><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Account type<select className="mt-1 block w-full rounded-xl border p-3" value={form.user_type} onChange={e => update('user_type', e.target.value)}><option value="tenant">Tenant</option><option value="landlord">Landlord</option></select></label>{field('full_name', 'Full name')}{field('phone', 'Customer phone number', 'tel')}{field('email', 'Customer email (optional)', 'email', false)}{ninEnabled && <>{field('nin', 'NIN', 'text')}{field('date_of_birth', 'Date of birth', 'date')}</>}<label className="text-sm font-medium">State<select required value={form.state_id} onChange={e => update('state_id', e.target.value)} className="mt-1 block w-full rounded-xl border p-3"><option value="">Select state</option>{locations.map(s => <option key={s.id} value={s.id}>{s.state_name}</option>)}</select></label><label className="text-sm font-medium">Local government area<select required value={form.lga_name} onChange={e => update('lga_name', e.target.value)} className="mt-1 block w-full rounded-xl border p-3"><option value="">Select LGA</option>{state?.lgas?.map(s => <option key={s} value={s}>{s}</option>)}</select></label><label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" checked={form.use_rentalhub_lawyers} onChange={e => update('use_rentalhub_lawyers', e.target.checked)} />Use platform coverage assistance (fee included in quote)</label>{!form.use_rentalhub_lawyers && field('lawyer_email', 'Customer’s own lawyer email', 'email')}{form.user_type === 'landlord' && <label className="flex items-start gap-3 p-3 text-sm"><input type="checkbox" checked={form.use_rentalhub_agents} onChange={e => update('use_rentalhub_agents', e.target.checked)} />Use a platform property agent (fee included in quote)</label>}<label className="flex items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" required checked={form.consent_confirmed} onChange={e => update('consent_confirmed', e.target.checked)} />I explained the account, identity checks, payment and phone sign-in to the customer and obtained their agreement.</label></fieldset>{pricing && <section className="mt-5 rounded-2xl bg-blue-50 p-4"><p>Registration: {money(pricing.base_amount)}</p><p>Coverage assistance: {money(pricing.lawyer_amount)}</p><p>Property agent: {money(pricing.agent_amount)}</p><p className="mt-2 text-xl font-bold">Total: {money(pricing.amount)}</p><p className="mt-2 text-sm">The account is created unpaid. Confirm cash separately only after receiving it, or let the customer pay after sign-in.</p></section>}<button disabled={busy} className="mt-5 rounded-xl bg-blue-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : pricing ? 'Create customer account' : 'Review registration fee'}</button></form><section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-semibold">Registrations and receipts</h2><form className="my-4 flex flex-wrap gap-3" onSubmit={e => {
        e.preventDefault();
        run(refresh);
      }}><input aria-label="Search registrations" placeholder="Name, phone or reference" value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 rounded-xl border p-3" /><button className="rounded-xl bg-slate-100 px-4">Search</button></form><div className="grid gap-4 md:grid-cols-2">{records.map(row => <article key={row.reference} className="min-w-0 rounded-2xl border p-4"><h3 className="font-semibold">{row.full_name}</h3><p className="text-sm text-slate-600">{row.user_type} · {row.phone} · {row.state_name}, {row.lga_name}</p><p className="mt-2 break-all text-xs text-slate-500">{row.reference}</p><p className="mt-3 font-semibold">{money(row.amount_due)} — {row.collection_method === 'waived' ? 'Fee waived' : row.status === 'paid' ? 'Paid' : 'Unpaid'}</p>{row.collection_method === 'cash' && <p className="text-sm">Cash remittance: {row.remittance_status}</p>}<div className="mt-3 flex flex-wrap gap-3">{row.status === 'paid' ? <button disabled={busy} onClick={() => receipt(row)} className="rounded-xl bg-blue-50 px-3 py-2 text-blue-900">{row.collection_method === 'waived' ? 'Download acknowledgement' : 'Generate receipt'}</button> : <button disabled={busy} onClick={() => {
              setCash(row);
              setReceived(false);
              setNote('');
            }} className="rounded-xl bg-blue-900 px-3 py-2 text-white">Record cash received</button>}{['super_admin', 'super_support_admin'].includes(user.user_type) && row.remittance_status === 'outstanding' && <button disabled={busy} onClick={() => run(async () => {
              if (!window.confirm('Confirm you received this collected money. A different supervisor must acknowledge the collector.')) return;
              await api.post('/assisted-registration/staff/' + encodeURIComponent(row.reference) + '/remittance');
              await refresh();
            })} className="rounded-xl border px-3 py-2">Acknowledge cash remittance</button>}</div></article>)}</div>{!records.length && <p className="text-slate-500">No registrations found in your assigned area.</p>}</section><aside className="rounded-2xl border bg-slate-50 p-5"><h2 className="font-semibold">Office fingerprint verification</h2><p className="mt-2 text-sm text-slate-600">Unavailable: your DigitalPersona reader can capture fingerprints, but a licensed matching engine is still required. Fingerprints are not collected or stored here. Support cannot use a scan to sign in as a customer.</p></aside>{cash && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="cash-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6"><h2 id="cash-title" className="text-xl font-bold">Confirm cash received</h2><p className="mt-3">{cash.full_name}: {money(cash.amount_due)}</p><p className="mt-2 text-sm text-slate-600">This creates a paid receipt and records this amount as money you must remit. Do not use this for an unconfirmed transfer.</p><textarea aria-label="Collection note" maxLength={500} value={note} onChange={e => setNote(e.target.value)} className="mt-4 w-full rounded-xl border p-3" placeholder="Collection note (optional)" /><label className="my-4 flex gap-3 text-sm"><input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)} />I received the full amount in cash.</label><div className="flex gap-3"><button disabled={busy || !received} className="rounded-xl bg-blue-900 p-3 text-white disabled:opacity-50" onClick={() => run(async () => {
            await api.post('/assisted-registration/staff/' + encodeURIComponent(cash.reference) + '/cash', {
              cash_received: true,
              amount: cash.amount_due,
              note
            });
            setCash(null);
            await refresh();
          })}>Confirm paid</button><button disabled={busy} onClick={() => setCash(null)} className="p-3">Cancel</button></div></section></div>}</main>;
}
