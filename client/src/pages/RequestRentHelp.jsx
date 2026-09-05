import React, { useCallback, useEffect, useState } from 'react';
import { FaHandshake, FaCopy, FaCheck, FaSpinner, FaBuilding, FaExclamationCircle } from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

// Tenant A: choose a property they can ask someone to pay rent for — one they
// already paid on, or one their application was APPROVED for (never a
// pending/submitted application). Generates the one-time share link.

const RequestRentHelp = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/payments/rent-help/eligible');
      setProperties(res.data?.data?.properties || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your properties.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createLink = async () => {
    if (!selectedId) return;
    setCreating(true);
    setError('');
    setCreatedLink('');
    try {
      const res = await api.post('/payments/request-rent-payment', { property_id: Number(selectedId) });
      setCreatedLink(res.data?.data?.link || '');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create the link.');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the link is visible for manual copy.
    }
  };

  const money = (amount) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(Number(amount || 0));

  if (user && user.user_type !== 'tenant') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <FaExclamationCircle className="mx-auto text-amber-500 text-3xl" />
          <h1 className="mt-3 text-xl font-bold text-gray-900">Rent help is for tenants</h1>
          <p className="mt-2 text-sm text-gray-600">
            Log in as the tenant whose rent needs paying to generate a payment link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
              <FaHandshake className="text-xl" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Ask someone to pay your rent</h1>
              <p className="text-xs text-gray-500">
                We create a secure link you can share with a friend or family member. The amount is
                confirmed by the server.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-400">
              <FaSpinner className="animate-spin" /> Checking your properties…
            </p>
          ) : error ? (
            <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          ) : properties.length === 0 ? (
            <p className="mt-6 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-700">
              You don&apos;t have a property to request rent help for yet. You can do this once you&apos;ve
              paid rent on a property, or once a landlord has approved your application.
            </p>
          ) : (
            <>
              <p className="mt-5 text-sm font-semibold text-gray-700">Choose a property</p>
              <ul className="mt-2 space-y-2">
                {properties.map((p) => (
                  <li key={p.property_id}>
                    <label
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                        String(p.property_id) === String(selectedId)
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="prop"
                          className="accent-teal-600"
                          checked={String(p.property_id) === String(selectedId)}
                          onChange={() => setSelectedId(String(p.property_id))}
                        />
                        <FaBuilding className="text-gray-400" />
                        <span className="text-gray-800">{p.title}</span>
                      </span>
                      <span className="text-xs text-gray-500">
                        <strong>{money(p.rent_amount)}</strong>
                        {p.source === 'approved' && <span className="ml-2 text-teal-600">approved</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={!selectedId || creating}
                onClick={createLink}
                className="mt-5 w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {creating ? 'Creating link…' : 'Create share link'}
              </button>
            </>
          )}

          {createdLink && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Share this link (expires in 72 hours)
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={createdLink}
                  className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  {copied ? <FaCheck /> : <FaCopy />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreatedLink('');
                  setSelectedId('');
                }}
                className="mt-3 text-xs font-medium text-emerald-700 underline"
              >
                Create another link
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestRentHelp;
