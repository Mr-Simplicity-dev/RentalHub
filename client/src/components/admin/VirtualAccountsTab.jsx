import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';

const money = (value) => `₦${Number(value || 0).toLocaleString()}`;

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-blue-100 text-blue-700',
  expired: 'bg-gray-100 text-gray-600',
  closed: 'bg-gray-100 text-gray-600',
};

const KIND_LABELS = {
  dva: 'Wallet (dedicated)',
  one_time: 'Registration (one-time)',
};

export default function VirtualAccountsTab() {
  const [view, setView] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [processed, setProcessed] = useState('false');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/virtual-accounts/accounts', {
        params: { limit: 100, ...(status ? { status } : {}), ...(kind ? { kind } : {}), ...(search.trim() ? { search: search.trim() } : {}) },
      });
      setAccounts(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load virtual accounts');
    } finally {
      setLoading(false);
    }
  }, [status, kind, search]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/virtual-accounts/events', {
        params: { limit: 100, ...(processed ? { processed } : {}) },
      });
      setEvents(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load payment events');
    } finally {
      setLoading(false);
    }
  }, [processed]);

  useEffect(() => {
    if (view === 'accounts') loadAccounts();
    else loadEvents();
  }, [view, loadAccounts, loadEvents]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
        These transfers are confirmed by the partner bank, not by an admin. The ledger is shown here
        for audit: a one-time account settles a registration fee, and a dedicated account credits the
        owner's wallet automatically. Anything flagged as unprocessed or underpaid needs a human look.
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setView('accounts')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'accounts' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Accounts
        </button>
        <button
          type="button"
          onClick={() => setView('events')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'events' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Transfers received
        </button>
      </div>

      {view === 'accounts' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search account, name, email or reference"
              className="input w-full sm:w-72"
            />
            <select value={kind} onChange={(event) => setKind(event.target.value)} className="input w-full sm:w-52">
              <option value="">All account types</option>
              <option value="dva">Wallet (dedicated)</option>
              <option value="one_time">Registration (one-time)</option>
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="input w-full sm:w-40">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="paid">Paid</option>
              <option value="expired">Expired</option>
              <option value="closed">Closed</option>
            </select>
            <button type="button" onClick={loadAccounts} className="btn">
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Expected</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
                ) : accounts.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No accounts yet.</td></tr>
                ) : accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-3 py-2">
                      <p className="font-mono font-semibold text-gray-900">{account.account_number}</p>
                      <p className="text-xs text-gray-500">{account.bank_name}</p>
                      <p className="text-xs text-gray-500">{account.account_name}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-gray-800">{account.user_name || account.account_name}</p>
                      <p className="text-xs text-gray-500">{account.user_email || account.registration_reference || '—'}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{KIND_LABELS[account.kind] || account.kind}</td>
                    <td className="px-3 py-2 text-gray-700">{account.amount_expected ? money(account.amount_expected) : 'Any amount'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[account.status] || 'bg-gray-100 text-gray-600'}`}>
                        {account.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {account.created_at ? new Date(account.created_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <select value={processed} onChange={(event) => setProcessed(event.target.value)} className="input w-full sm:w-56">
              <option value="false">Needs attention</option>
              <option value="true">Processed</option>
              <option value="">All events</option>
            </select>
            <button type="button" onClick={loadEvents} className="btn">Refresh</button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Payer</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
                ) : events.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No transfer events.</td></tr>
                ) : events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {event.created_at ? new Date(event.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{event.provider}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{money(event.amount)}</td>
                    <td className="px-3 py-2">
                      <p className="text-gray-800">{event.sender_name || '—'}</p>
                      <p className="text-xs text-gray-500">{event.sender_bank || event.account_number || ''}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${event.processed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {event.processed ? 'Processed' : 'Unprocessed'}
                      </span>
                      <p className="mt-1 text-xs text-gray-500">{event.status}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{event.failure_reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
