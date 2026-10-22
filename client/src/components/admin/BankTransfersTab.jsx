import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FaCheck, FaImage, FaTimes } from 'react-icons/fa';
import api from '../../services/api';

const FILTERS = [
  { id: 'awaiting_approval', label: 'Awaiting approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
];

const STATUS_STYLES = {
  awaiting_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

const money = (value) => `₦${Number(value || 0).toLocaleString()}`;

export default function BankTransfersTab() {
  const [status, setStatus] = useState('awaiting_approval');
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [amountReceived, setAmountReceived] = useState('');
  const [note, setNote] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofLoading, setProofLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/bank-transfers/transfers', {
        params: status ? { status, limit: 100 } : { limit: 100 },
      });
      setTransfers(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load bank transfers');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    setProofUrl('');

    if (!selected?.id || !selected?.proof_path) return undefined;

    setProofLoading(true);
    api.get(`/admin/bank-transfers/transfers/${selected.id}/proof`, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(res.data);
        setProofUrl(objectUrl);
      })
      .catch(() => {
        if (active) setProofUrl('');
      })
      .finally(() => {
        if (active) setProofLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected?.id, selected?.proof_path]);

  const openTransfer = (transfer) => {
    setSelected(transfer);
    setAmountReceived(String(transfer.amount || ''));
    setNote('');
  };

  const closeTransfer = () => {
    setSelected(null);
    setAmountReceived('');
    setNote('');
  };

  const handleApprove = async () => {
    if (!selected) return;
    const value = Number(amountReceived);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter the amount actually received');
      return;
    }

    setWorking(true);
    try {
      const res = await api.post(`/admin/bank-transfers/transfers/${selected.id}/approve`, {
        amount_received: value,
        note: note.trim() || null,
      });
      toast.success(res.data?.message || 'Transfer approved');
      closeTransfer();
      await loadTransfers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not approve the transfer');
    } finally {
      setWorking(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    if (note.trim().length < 3) {
      toast.error('Write the reason the transfer could not be confirmed');
      return;
    }

    setWorking(true);
    try {
      const res = await api.post(`/admin/bank-transfers/transfers/${selected.id}/reject`, {
        note: note.trim(),
      });
      toast.success(res.data?.message || 'Transfer rejected');
      closeTransfer();
      await loadTransfers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not reject the transfer');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Confirm each transfer against the bank statement before approving. Approving a registration
        creates the account and emails the Paystack-format receipt; approving a wallet transfer credits
        the wallet and emails the same receipt.
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.id || 'all'}
            type="button"
            onClick={() => setStatus(filter.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              status === filter.id
                ? 'bg-slate-900 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">Loading transfers…</p>
        ) : transfers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No transfer in this view.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {transfers.map((transfer) => (
              <button
                key={transfer.id}
                type="button"
                onClick={() => openTransfer(transfer)}
                className="block w-full px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
                      {transfer.payment_type === 'registration' ? 'Registration' : 'Wallet funding'}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[transfer.status] || 'bg-gray-100 text-gray-600'}`}>
                        {transfer.status.replace(/_/g, ' ')}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-gray-500">{transfer.reference}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      {transfer.user_name || transfer.metadata?.full_name || 'Unknown payer'}
                      {transfer.payer_name ? ` • paid as ${transfer.payer_name}` : ''}
                      {transfer.user_email || transfer.metadata?.email ? ` • ${transfer.user_email || transfer.metadata.email}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{money(transfer.amount)}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(transfer.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 px-4 py-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">
                  {selected.payment_type === 'registration' ? 'Registration transfer' : 'Wallet funding transfer'}
                </p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">{money(selected.amount)}</h2>
                <p className="font-mono text-xs text-gray-500">{selected.reference}</p>
              </div>
              <button
                type="button"
                onClick={closeTransfer}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Payer</span>
                  <span className="text-right font-medium text-gray-800">
                    {selected.payer_name || selected.user_name || selected.metadata?.full_name || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Payer bank</span>
                  <span className="text-right font-medium text-gray-800">{selected.payer_bank || '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Paid into</span>
                  <span className="text-right font-medium text-gray-800">
                    {selected.bank_name ? `${selected.bank_name} • ${selected.account_number}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Submitted</span>
                  <span className="text-right font-medium text-gray-800">
                    {new Date(selected.created_at).toLocaleString()}
                  </span>
                </div>
                {selected.review_note ? (
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Review note</span>
                    <span className="text-right font-medium text-gray-800">{selected.review_note}</span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-gray-200 p-2">
                {proofLoading ? (
                  <p className="px-2 py-8 text-center text-sm text-gray-500">Loading capture…</p>
                ) : proofUrl ? (
                  <a href={proofUrl} target="_blank" rel="noreferrer">
                    <img src={proofUrl} alt="Transfer confirmation capture" className="max-h-64 w-full rounded-lg object-contain" />
                  </a>
                ) : (
                  <p className="flex items-center justify-center gap-2 px-2 py-8 text-center text-sm text-gray-500">
                    <FaImage /> No capture available
                  </p>
                )}
              </div>
            </div>

            {selected.status === 'awaiting_approval' ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Amount received (₦)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input w-full font-semibold"
                      value={amountReceived}
                      onChange={(event) => setAmountReceived(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Note (required to reject)</label>
                    <input
                      type="text"
                      className="input w-full"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="e.g. confirmed on Moniepoint statement"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={working}
                    className="btn w-full border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 sm:flex-1"
                  >
                    <span className="inline-flex items-center gap-2"><FaTimes /> Reject</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={working}
                    className="btn btn-primary w-full disabled:opacity-50 sm:flex-1"
                  >
                    <span className="inline-flex items-center gap-2"><FaCheck /> {working ? 'Working…' : 'Approve transfer'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                This transfer is <strong>{selected.status.replace(/_/g, ' ')}</strong>
                {selected.amount_confirmed ? ` — confirmed ${money(selected.amount_confirmed)}` : ''}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
