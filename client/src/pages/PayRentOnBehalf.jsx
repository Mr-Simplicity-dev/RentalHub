import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FaHandshake, FaCreditCard, FaUniversity, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import api from '../services/api';

// Option 2 — "Pay rent on behalf": a tenant's rent-payment link opened by
// another tenant, or by a landlord paying for a child who is a tenant.

const PayRentOnBehalf = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null);
  const [bankDetails, setBankDetails] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/payments/rent-request/${token}`);
      setInfo(res.data?.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'This rent payment link could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const pay = async (method) => {
    setBusy(method);
    setError('');
    setBankDetails(null);
    try {
      const res = await api.post(`/payments/pay-rent-on-behalf/${token}`, {
        payment_method: method,
      });
      const data = res.data?.data || {};
      if (method === 'bank_transfer') {
        setBankDetails(data);
      } else if (data.authorization_url) {
        window.location.assign(data.authorization_url);
      } else {
        setError('Payment could not be started. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const formatMoney = (amount) =>
    new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(Number(amount || 0));

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-600 text-2xl">
          <FaHandshake />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Pay someone&apos;s rent</h1>

        {loading ? (
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-400">
            <FaSpinner className="animate-spin" /> Loading payment link…
          </p>
        ) : error ? (
          <div className="mt-6">
            <FaTimesCircle className="mx-auto text-red-500 text-3xl" />
            <p className="mt-3 text-sm text-red-600">{error}</p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-gray-600">
              You are about to pay rent on behalf of{' '}
              <strong className="text-gray-900">{info?.tenant_name || 'a tenant'}</strong>.
            </p>
            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
              <p className="text-xs text-gray-400">Amount due (server-confirmed)</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{formatMoney(info?.amount)}</p>
              <p className="mt-2 text-xs text-gray-400">
                Link expires {new Date(info?.expires_at).toLocaleString()}
              </p>
              <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">
                The rent is credited to the tenant&apos;s property. You will get a receipt and the
                tenant will be notified.
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => pay('paystack')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                <FaCreditCard /> {busy === 'paystack' ? 'Starting payment…' : 'Pay now with card'}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => pay('bank_transfer')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <FaUniversity /> {busy === 'bank_transfer' ? 'Loading…' : 'Pay by bank transfer'}
              </button>
            </div>

            {bankDetails && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Transfer to this account
                </p>
                <p className="mt-2 text-gray-800">
                  {bankDetails.bank_name} · {bankDetails.account_number}
                </p>
                <p className="text-gray-800">{bankDetails.account_name}</p>
                <p className="mt-2 text-gray-600">
                  Amount: <strong>{formatMoney(bankDetails.amount)}</strong>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Use reference <strong>{bankDetails.reference}</strong> so we can match the payment.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PayRentOnBehalf;
