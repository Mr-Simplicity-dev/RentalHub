import React, { useEffect, useRef, useState } from 'react';
import { FaCheckCircle, FaClock, FaCopy, FaTimes, FaUniversity } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../services/api';

const formatNumber = (value) => Number(value || 0).toLocaleString();

const timeLeft = (expiresAt) => {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return 'expired';
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// A virtual account is confirmed by the partner bank, not by a person, so there
// is no screenshot to take and no upload. This screen just watches for the
// confirmation and then moves the payer on.
export default function VirtualAccountCheckout({
  account,
  amount,
  reference,
  statusEndpoint,
  mode = 'registration',
  onPaid,
  onCredited,
  onCancel,
  onRefresh,
}) {
  const [current, setCurrent] = useState(account || null);
  const [paid, setPaid] = useState(false);
  const [countdown, setCountdown] = useState(timeLeft(account?.expires_at));
  const [checking, setChecking] = useState(false);
  const baselineRef = useRef(null);
  const onPaidRef = useRef(onPaid);
  const onCreditedRef = useRef(onCredited);

  useEffect(() => {
    onPaidRef.current = onPaid;
    onCreditedRef.current = onCredited;
  }, [onPaid, onCredited]);

  useEffect(() => {
    setCurrent(account || null);
    setCountdown(timeLeft(account?.expires_at));
  }, [account]);

  useEffect(() => {
    if (!current?.expires_at) return undefined;
    const timer = setInterval(() => setCountdown(timeLeft(current.expires_at)), 1000);
    return () => clearInterval(timer);
  }, [current?.expires_at]);

  useEffect(() => {
    let active = true;

    const check = async () => {
      if (paid) return;
      setChecking(true);

      try {
        if (mode === 'registration') {
          if (!statusEndpoint) return;
          const response = await api.get(statusEndpoint, { skipAuth: true, skipAuthRefresh: true });
          const data = response.data?.data;
          if (active && data?.paid) {
            setPaid(true);
            if (onPaidRef.current) onPaidRef.current(data);
          }
          return;
        }

        const response = await api.get('/virtual-accounts/wallet/credits', { skipAuth: false });
        const credits = response.data?.data?.credits || [];
        const newest = credits[0]?.payment_id || 0;

        if (baselineRef.current === null) {
          baselineRef.current = newest;
          return;
        }

        if (newest > baselineRef.current && active) {
          baselineRef.current = newest;
          setPaid(true);
          if (onCreditedRef.current) onCreditedRef.current(credits[0]);
        }
      } catch (error) {
        // Polling is best-effort; the next tick retries.
      } finally {
        if (active) setChecking(false);
      }
    };

    check();
    const timer = setInterval(check, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [mode, statusEndpoint, paid]);

  const copyValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(`${label} copied`);
    } catch (error) {
      toast.info(String(value));
    }
  };

  const expired = countdown === 'expired';

  if (paid) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
        <FaCheckCircle className="mx-auto text-3xl text-emerald-600" />
        <p className="mt-3 text-lg font-bold text-emerald-900">Payment confirmed</p>
        <p className="mt-1 text-sm text-emerald-800">
          {mode === 'registration'
            ? 'Your transfer was received. Your account is being created.'
            : 'Your transfer was received and your wallet has been credited.'}
        </p>
      </div>
    );
  }

  if (!current) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
        The transfer account is not available. Please choose the manual transfer option.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
          {mode === 'registration' ? 'Amount to transfer' : 'Transfer any amount'}
        </p>
        <p className="mt-1 text-2xl font-bold text-teal-900">
          {mode === 'wallet' && !amount
            ? 'Any amount from ₦100'
            : `₦${formatNumber(amount || current.amount_expected)}`}
        </p>
        <p className="mt-1 text-xs text-teal-800">
          This account belongs to you. The bank confirms the transfer automatically — no screenshot needed.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 px-4 py-4">
        <div className="flex items-start gap-3">
          <FaUniversity className="mt-1 text-teal-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{current.bank_name}</p>
            <p className="text-sm text-gray-700">{current.account_name}</p>
            <p className="mt-1 flex items-center gap-2 font-mono text-xl font-bold tracking-wide text-gray-900">
              {current.account_number}
              <button
                type="button"
                onClick={() => copyValue(current.account_number, 'Account number')}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Copy account number"
              >
                <FaCopy />
              </button>
            </p>
          </div>
        </div>

        {current.expires_at ? (
          <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
          }`}>
            <FaClock />
            {expired ? 'This account has expired' : `Expires in ${countdown}`}
          </p>
        ) : null}

        {reference ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>Reference (optional)</span>
            <span className="font-mono font-semibold text-gray-700">{reference}</span>
            <button type="button" onClick={() => copyValue(reference, 'Reference')} className="text-gray-400 hover:text-gray-700">
              <FaCopy />
            </button>
          </p>
        ) : null}
      </div>

      {expired && onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700"
        >
          Get a new transfer account
        </button>
      ) : (
        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <span className="inline-flex items-center gap-2 font-semibold text-gray-800">
            <span className={`h-2 w-2 rounded-full ${checking ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            Listening for your transfer…
          </span>
          <p className="mt-1 text-xs text-gray-500">
            Keep this screen open. It updates within seconds of the bank confirming the payment.
          </p>
        </div>
      )}

      {onCancel ? (
        <button type="button" onClick={onCancel} className="btn w-full">
          <span className="inline-flex items-center gap-2"><FaTimes /> Cancel</span>
        </button>
      ) : null}
    </div>
  );
}
