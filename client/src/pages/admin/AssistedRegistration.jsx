import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import AssistedPhotoCapture from '../../components/admin/AssistedPhotoCapture';
import OfficeFingerprintPanel from '../../components/admin/OfficeFingerprintPanel';
import {
  FaArrowLeft,
  FaUser,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaIdCard,
  FaCalendarAlt,
  FaCheckCircle,
  FaSearch,
  FaCamera,
  FaReceipt,
  FaMoneyBillWave,
  FaInfoCircle,
  FaExclamationTriangle,
  FaTimes,
  FaShieldAlt,
  FaUserCheck,
} from 'react-icons/fa';

const roles = [
  'super_admin',
  'super_support_admin',
  'zonal_admin',
  'state_support_admin',
  'lga_support_admin',
];

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
  consent_confirmed: false,
};

const money = (n) =>
  '₦' +
  Number(n || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
  });

export default function AssistedRegistration() {
  const { user } = useAuth();
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
  const [photoCustomer, setPhotoCustomer] = useState(null);
  const [received, setReceived] = useState(false);
  const [note, setNote] = useState('');

  const refresh = async () => {
    const r = await api.get('/assisted-registration/staff', {
      params: { search },
    });
    setRecords(r.data.data || []);
  };

  useEffect(() => {
    if (roles.includes(user?.user_type)) {
      api
        .get('/assisted-registration/staff/config')
        .then((r) => {
          setNinEnabled(r.data.data.nin_enabled);
          if (!r.data.data.nin_enabled) {
            setForm((f) => ({
              ...f,
              nin: '',
              date_of_birth: '',
            }));
          }
        })
        .catch(() => setMessage('Unable to load identity settings. Please refresh.'));

      api
        .get('/property-utils/location-options')
        .then((r) => setLocations(r.data.data || []))
        .catch(() => setMessage('Unable to load locations. Please refresh.'));

      refresh().catch(() => setMessage('Unable to load registrations. Please refresh.'));
    }
  }, [user?.user_type]);

  const update = (key, value) => {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === 'state_id' ? { lga_name: '' } : {}),
      ...(key === 'user_type' && value === 'tenant'
        ? { use_rentalhub_agents: false }
        : {}),
    }));
    setPricing(null);
  };

  const run = async (fn) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      if (e.response?.data?.code === 'REGISTRATION_QUOTE_CHANGED') {
        setPricing(null);
      }
      setMessage(
        e.response?.data?.message ||
          'Unable to complete this request. Retry without creating a second account.'
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
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
        request_id: request.current,
      });
      setMessage(
        'Account saved: ' +
          r.data.data.reference +
          '. The customer signs in with a phone verification code.'
      );
      setPhotoCustomer(r.data.data);
      request.current = crypto.randomUUID();
      setForm(empty);
      setPricing(null);
      await refresh();
    });
  };

  const receipt = (row) =>
    run(async () => {
      const r = await api.get(
        '/assisted-registration/staff/' + encodeURIComponent(row.reference) + '/receipt',
        {
          responseType: 'blob',
        }
      );
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'registration-receipt.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  if (!roles.includes(user?.user_type)) {
    return (
      <main className="mx-auto max-w-xl py-16 px-4 text-center">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 shadow-sm">
          <FaExclamationTriangle className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="mt-4 text-lg font-bold text-red-900">Access Restricted</h2>
          <p className="mt-2 text-sm text-red-700">Support registration access is required.</p>
        </div>
      </main>
    );
  }

  const selectedState = locations.find((s) => String(s.id) === String(form.state_id));
  const paidCount = records.filter((r) => r.status === 'paid').length;
  const unpaidCount = records.filter((r) => r.status !== 'paid').length;
  const outstandingRemittanceCount = records.filter(
    (r) => r.remittance_status === 'outstanding'
  ).length;

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      {/* Top Header Bar */}
      <div className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                to={user.user_type === 'super_admin' ? '/super-admin' : '/admin'}
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary-700 hover:text-primary-800 transition-colors"
              >
                <FaArrowLeft className="text-[10px]" /> ← Dashboard
              </Link>
              <div className="mt-1 flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Assisted account registration
                </h1>
                <span className="hidden sm:inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 border border-primary-200/60">
                  Support workspace
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 max-w-2xl">
                Help a customer create their own tenant or landlord account. Explain each field and the fee. Only confirm cash you have actually received.
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 shrink-0">
              <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-center">
                <span className="block text-[11px] font-medium uppercase text-slate-500">Total</span>
                <span className="text-lg font-bold text-slate-900 tabular-nums">{records.length}</span>
              </div>
              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-center">
                <span className="block text-[11px] font-medium uppercase text-emerald-700">Paid</span>
                <span className="text-lg font-bold text-emerald-700 tabular-nums">{paidCount}</span>
              </div>
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-center">
                <span className="block text-[11px] font-medium uppercase text-amber-700">Pending Cash</span>
                <span className="text-lg font-bold text-amber-700 tabular-nums">{outstandingRemittanceCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Status / Message Alert */}
        {message && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/90 p-4 text-sm text-blue-900 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <FaInfoCircle className="mt-0.5 text-blue-600 shrink-0 text-base" />
              <span className="leading-relaxed font-medium">{message}</span>
            </div>
            <button
              type="button"
              onClick={() => setMessage('')}
              className="text-blue-500 hover:text-blue-800 transition-colors p-1"
              aria-label="Dismiss alert"
            >
              <FaTimes className="text-xs" />
            </button>
          </div>
        )}

        {/* SECTION 1: Customer Intake Form */}
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Customer details</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Onboard a new customer by entering their verified profile and territorial assignment
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <FaUserCheck className="text-primary-600" /> Assisted Intake
            </span>
          </div>

          <form onSubmit={submit} className="p-6 sm:p-8">
            <fieldset disabled={busy} className="space-y-6">
              {/* Account Type Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Account type
                </label>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <button
                    type="button"
                    onClick={() => update('user_type', 'tenant')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-semibold transition-all border ${
                      form.user_type === 'tenant'
                        ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FaUser className={form.user_type === 'tenant' ? 'text-primary-600' : 'text-slate-400'} />
                    Tenant
                  </button>
                  <button
                    type="button"
                    onClick={() => update('user_type', 'landlord')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-semibold transition-all border ${
                      form.user_type === 'landlord'
                        ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FaShieldAlt className={form.user_type === 'landlord' ? 'text-primary-600' : 'text-slate-400'} />
                    Landlord
                  </button>
                </div>
              </div>

              {/* Personal Information Group */}
              <div className="pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                  1. Contact & Identity
                </h3>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Full name
                    <div className="relative mt-1">
                      <input
                        type="text"
                        required
                        placeholder="e.g. Adebayo Olumide"
                        value={form.full_name}
                        onChange={(e) => update('full_name', e.target.value)}
                        className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Customer phone number
                    <div className="relative mt-1">
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 08012345678"
                        value={form.phone}
                        onChange={(e) => update('phone', e.target.value)}
                        className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Customer email (optional)
                    <div className="relative mt-1">
                      <input
                        type="email"
                        placeholder="customer@example.com"
                        value={form.email}
                        onChange={(e) => update('email', e.target.value)}
                        className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                  </label>

                  {ninEnabled && (
                    <>
                      <label className="block text-sm font-medium text-slate-700">
                        NIN
                        <div className="relative mt-1">
                          <input
                            type="text"
                            required
                            placeholder="11-digit National Identity Number"
                            value={form.nin}
                            onChange={(e) => update('nin', e.target.value)}
                            className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono"
                          />
                        </div>
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        Date of birth
                        <div className="relative mt-1">
                          <input
                            type="date"
                            required
                            value={form.date_of_birth}
                            onChange={(e) => update('date_of_birth', e.target.value)}
                            className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                          />
                        </div>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Territorial Assignment Group */}
              <div className="pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                  2. Territorial Jurisdiction
                </h3>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    State
                    <select
                      required
                      value={form.state_id}
                      onChange={(e) => update('state_id', e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">Select state</option>
                      {locations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.state_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Local government area
                    <select
                      required
                      value={form.lga_name}
                      onChange={(e) => update('lga_name', e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">Select LGA</option>
                      {selectedState?.lgas?.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Coverage Assistance & Agent Representation */}
              <div className="pt-2 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                  3. Legal Coverage & Representation Options
                </h3>

                <label className="flex items-start gap-3.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.use_rentalhub_lawyers}
                    onChange={(e) => update('use_rentalhub_lawyers', e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-900 block">
                      Use platform coverage assistance (fee included in quote)
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      Assigns an accredited platform legal representative for agreement oversight and tenancy verification.
                    </span>
                  </div>
                </label>

                {!form.use_rentalhub_lawyers && (
                  <label className="block text-sm font-medium text-slate-700 max-w-md">
                    Customer’s own lawyer email
                    <div className="relative mt-1">
                      <input
                        type="email"
                        required
                        placeholder="lawyer@lawfirm.ng"
                        value={form.lawyer_email}
                        onChange={(e) => update('lawyer_email', e.target.value)}
                        className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                  </label>
                )}

                {form.user_type === 'landlord' && (
                  <label className="flex items-start gap-3.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={form.use_rentalhub_agents}
                      onChange={(e) => update('use_rentalhub_agents', e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 block">
                        Use a platform property agent (fee included in quote)
                      </span>
                      <span className="text-xs text-slate-500 block mt-0.5">
                        Assigns a verified marketing agent for assisted inspections and tenant screening.
                      </span>
                    </div>
                  </label>
                )}

                {/* Staff Attestation / Informed Consent */}
                <label className="flex items-start gap-3.5 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm cursor-pointer hover:bg-blue-50 transition-colors">
                  <input
                    type="checkbox"
                    required
                    checked={form.consent_confirmed}
                    onChange={(e) => update('consent_confirmed', e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-blue-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-blue-950 font-medium">
                    I explained the account, identity checks, payment and phone sign-in to the customer and obtained their agreement.
                  </span>
                </label>
              </div>

              {/* Live Quotation Summary Card */}
              {pricing && (
                <section className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-indigo-50/50 p-5 text-slate-800 shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-blue-200/70">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-900">
                      Fee Breakdown Quote
                    </span>
                    <span className="text-xs text-blue-700 font-medium">Authoritative Quote</span>
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Registration:</span>
                      <span className="font-mono tabular-nums text-slate-900 font-medium">
                        {money(pricing.base_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Coverage assistance:</span>
                      <span className="font-mono tabular-nums text-slate-900 font-medium">
                        {money(pricing.lawyer_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Property agent:</span>
                      <span className="font-mono tabular-nums text-slate-900 font-medium">
                        {money(pricing.agent_amount)}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-blue-200/60 flex justify-between items-center">
                      <span className="text-base font-bold text-slate-900">Total:</span>
                      <span className="text-xl font-bold font-mono tabular-nums text-primary-700">
                        {money(pricing.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/70 p-2.5 text-xs text-blue-900 border border-blue-100">
                    <FaInfoCircle className="mt-0.5 shrink-0 text-blue-600" />
                    <span>
                      The account is created unpaid. Confirm cash separately only after receiving it, or let the customer pay after sign-in.
                    </span>
                  </div>
                </section>
              )}

              {/* Submit / Trigger Quote Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-700 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? (
                    'Please wait…'
                  ) : pricing ? (
                    <>
                      <FaCheckCircle className="text-sm" /> Create customer account
                    </>
                  ) : (
                    <>
                      <FaReceipt className="text-sm" /> Review registration fee
                    </>
                  )}
                </button>
              </div>
            </fieldset>
          </form>
        </section>

        {/* SECTION 2: Registrations and Receipts Ledger */}
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Registrations and receipts</h2>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 tabular-nums">
                  {records.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit trail of assisted accounts, cash settlement, and customer photo verification
              </p>
            </div>

            {/* Search filter form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(refresh);
              }}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <div className="relative flex-1 sm:w-72">
                <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  aria-label="Search registrations"
                  placeholder="Name, phone or reference"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
              >
                Search
              </button>
            </form>
          </div>

          <div className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {records.map((row) => (
                <article
                  key={row.reference}
                  className="rounded-xl border border-slate-200/80 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base text-slate-900">{row.full_name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="capitalize font-medium text-slate-700">{row.user_type}</span> ·{' '}
                        <span>{row.phone}</span> ·{' '}
                        <span>{row.state_name}, {row.lga_name}</span>
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        row.collection_method === 'waived'
                          ? 'bg-blue-100 text-blue-800'
                          : row.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {row.collection_method === 'waived'
                        ? 'Fee waived'
                        : row.status === 'paid'
                        ? 'Paid'
                        : 'Unpaid'}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <span className="font-mono text-slate-600 break-all">{row.reference}</span>
                    <span className="font-mono tabular-nums font-bold text-slate-900">
                      {money(row.amount_due)}
                    </span>
                  </div>

                  {row.collection_method === 'cash' && (
                    <p className="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
                      <span className="font-medium">Cash remittance:</span>
                      <span
                        className={`capitalize font-semibold ${
                          row.remittance_status === 'outstanding'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {row.remittance_status}
                      </span>
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPhotoCustomer(row)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <FaCamera className="text-slate-500" /> Capture customer photo
                    </button>

                    {row.status === 'paid' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => receipt(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-800 hover:bg-primary-100 transition-colors"
                      >
                        <FaReceipt className="text-primary-700" />
                        {row.collection_method === 'waived'
                          ? 'Download acknowledgement'
                          : 'Generate receipt'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setCash(row);
                          setReceived(false);
                          setNote('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
                      >
                        <FaMoneyBillWave /> Record cash received
                      </button>
                    )}

                    {['super_admin', 'super_support_admin'].includes(user.user_type) &&
                      row.remittance_status === 'outstanding' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              if (
                                !window.confirm(
                                  'Confirm you received this collected money. A different supervisor must acknowledge the collector.'
                                )
                              ) {
                                return;
                              }
                              await api.post(
                                '/assisted-registration/staff/' +
                                  encodeURIComponent(row.reference) +
                                  '/remittance'
                              );
                              await refresh();
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                        >
                          <FaCheckCircle className="text-amber-700" /> Acknowledge cash remittance
                        </button>
                      )}
                  </div>
                </article>
              ))}
            </div>

            {!records.length && (
              <div className="py-12 text-center">
                <FaReceipt className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-500">
                  No registrations found in your assigned area.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Use the intake form above to register your first assisted customer.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 3: Office Fingerprint Verification Panel */}
        <OfficeFingerprintPanel records={records} user={user} />
      </div>

      {/* Customer Live Photo Capture Modal */}
      {photoCustomer && (
        <AssistedPhotoCapture
          key={photoCustomer.reference}
          customer={photoCustomer}
          onClose={() => setPhotoCustomer(null)}
          onSaved={() =>
            setMessage(
              'Photo saved for ' +
                photoCustomer.full_name +
                '. Existing identity review requirements still apply.'
            )
          }
        />
      )}

      {/* Cash Collection Confirmation Dialog */}
      {cash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cash-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-600">
                <FaMoneyBillWave className="text-lg" />
                <h2 id="cash-title" className="text-lg font-bold text-slate-900">
                  Confirm cash received
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCash(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <FaTimes />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-emerald-50/70 border border-emerald-200/60 p-4">
              <p className="text-xs uppercase font-semibold text-emerald-800 tracking-wider">
                Intake Settlement
              </p>
              <p className="mt-1 text-base font-bold text-slate-900">
                {cash.full_name}:{' '}
                <span className="font-mono text-emerald-700 tabular-nums">
                  {money(cash.amount_due)}
                </span>
              </p>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              This creates a paid receipt and records this amount as money you must remit. Do not use this for an unconfirmed transfer.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Collection Note
              </label>
              <textarea
                aria-label="Collection note"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                placeholder="Collection note (optional)"
                rows={3}
              />
            </div>

            <label className="my-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={received}
                onChange={(e) => setReceived(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-semibold text-slate-900">
                I received the full amount in cash.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setCash(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !received}
                onClick={() =>
                  run(async () => {
                    await api.post(
                      '/assisted-registration/staff/' +
                        encodeURIComponent(cash.reference) +
                        '/cash',
                      {
                        cash_received: true,
                        amount: cash.amount_due,
                        note,
                      }
                    );
                    setCash(null);
                    await refresh();
                  })
                }
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm paid
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
