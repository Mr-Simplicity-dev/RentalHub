import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaBriefcase,
  FaCheckCircle,
  FaEnvelope,
  FaLock,
  FaPhoneAlt,
  FaWallet,
} from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

const LawyersDirectory = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [lawyers, setLawyers] = useState([]);
  const [unlockStatus, setUnlockStatus] = useState({
    unlocked: false,
    unlocked_at: null,
    amount: 10000,
    available_balance: 0,
  });

  const eligibleToUnlock =
    isAuthenticated && ['tenant', 'landlord'].includes(user?.user_type);

  const loginRedirect = useMemo(
    () => `/login?redirect=${encodeURIComponent('/lawyers')}`,
    []
  );

  const loadPublicDirectory = useCallback(async () => {
    const response = await api.get('/legal/directory');
    setLawyers(response.data?.data || []);
    setUnlockStatus((previous) => ({
      ...previous,
      amount: response.data?.meta?.unlock_amount || previous.amount,
    }));
  }, []);

  const loadUnlockStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setUnlockStatus((previous) => ({
        ...previous,
        unlocked: false,
        unlocked_at: null,
        available_balance: 0,
      }));
      return false;
    }

    const response = await api.get('/payments/unlock-lawyer-directory/status');
    const data = response.data?.data || {};

    setUnlockStatus((previous) => ({
      ...previous,
      unlocked: data.unlocked === true,
      unlocked_at: data.unlocked_at || null,
      amount: data.amount || previous.amount || 10000,
      available_balance: Number(data.available_balance || 0),
    }));

    return data.unlocked === true;
  }, [isAuthenticated]);

  const loadUnlockedDirectory = useCallback(async () => {
    const response = await api.get('/legal/directory/full');
    setLawyers(response.data?.data || []);
  }, []);

  useEffect(() => {
    let active = true;

    const loadDirectory = async () => {
      setLoading(true);
      try {
        await loadPublicDirectory();

        if (isAuthenticated) {
          const unlocked = await loadUnlockStatus();
          if (active && unlocked) {
            await loadUnlockedDirectory();
          }
        }
      } catch (error) {
        if (!active) return;
        toast.error(
          error.response?.data?.message || 'Failed to load RentalHub NG lawyers'
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadDirectory();

    return () => {
      active = false;
    };
  }, [isAuthenticated, loadPublicDirectory, loadUnlockStatus, loadUnlockedDirectory]);

  const handleUnlock = async () => {
    if (!isAuthenticated) {
      window.location.assign(loginRedirect);
      return;
    }

    if (!eligibleToUnlock) {
      toast.error('Only tenant and landlord accounts can unlock the lawyer directory');
      return;
    }

    setUnlockLoading(true);
    try {
      const response = await api.post('/payments/unlock-lawyer-directory');
      const data = response.data?.data || {};

      if (data.already_unlocked) {
        toast.success('Lawyer directory is already unlocked for your account');
      } else {
        toast.success(
          response.data?.message || 'Lawyer directory unlocked from your wallet'
        );
      }

      setUnlockStatus((previous) => ({
        ...previous,
        unlocked: true,
        unlocked_at: data.unlocked_at || previous.unlocked_at || new Date().toISOString(),
        available_balance:
          typeof data.available_balance === 'number'
            ? data.available_balance
            : previous.available_balance,
      }));

      await loadUnlockStatus();
      await loadUnlockedDirectory();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          error.message ||
          'Could not unlock lawyer details from wallet'
      );
    } finally {
      setUnlockLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-primary-100">
              <FaBriefcase />
              RentalHub NG Lawyers
            </p>
            <h1 className="mt-6 text-4xl font-extrabold md:text-5xl">
              Use vetted lawyers on the platform when you want legal help fast.
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-200">
              Browse our in-house lawyer directory with partially masked details first.
              Unlock the full contact details once from your wallet for
              <span className="font-semibold"> ₦{Number(unlockStatus.amount || 10000).toLocaleString()}</span>.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {authLoading ? null : isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleUnlock}
                  disabled={
                    unlockLoading || unlockStatus.unlocked || !eligibleToUnlock
                  }
                  className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {unlockStatus.unlocked
                    ? 'Lawyer Details Unlocked'
                    : !eligibleToUnlock
                      ? 'Tenants/Landlords Only'
                      : unlockLoading
                        ? 'Processing...'
                        : `Unlock Full Details for ₦${Number(unlockStatus.amount || 10000).toLocaleString()}`}
                </button>
              ) : (
                <Link
                  to={loginRedirect}
                  className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  Log In To Unlock Lawyers
                </Link>
              )}
              <Link
                to="/dashboard"
                className="rounded-xl border border-white/25 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Fund Wallet
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        {unlockStatus.unlocked ? (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-6 py-4 text-green-800">
            <div className="flex items-start gap-3">
              <FaCheckCircle className="mt-1 text-green-600" />
              <div>
                <p className="font-semibold">
                  Full lawyer details are unlocked for your account.
                </p>
                <p className="mt-1 text-sm text-green-700">
                  {unlockStatus.unlocked_at
                    ? `Unlocked on ${new Date(unlockStatus.unlocked_at).toLocaleString()}.`
                    : 'You can now view phone, email, and chamber details.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-amber-900">
            <div className="flex items-start gap-3">
              <FaLock className="mt-1 text-amber-600" />
              <div className="space-y-1">
                <p className="font-semibold">Contact details are still masked.</p>
                <p className="text-sm text-amber-800">
                  Fund your wallet from the dashboard, then use
                  <strong> ₦{Number(unlockStatus.amount || 10000).toLocaleString()}</strong>
                  {' '}to unlock the full lawyer directory.
                </p>
                {isAuthenticated && eligibleToUnlock ? (
                  <p className="flex items-center gap-2 text-sm text-amber-900">
                    <FaWallet className="text-amber-700" />
                    Wallet balance: ₦{Number(unlockStatus.available_balance || 0).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            Loading platform lawyers...
          </div>
        ) : lawyers.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            No platform lawyers are available right now.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {lawyers.map((lawyer) => (
              <div
                key={lawyer.id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {lawyer.full_name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {lawyer.nationality || 'Nigeria'}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      lawyer.identity_verified
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {lawyer.identity_verified ? 'Verified' : 'Profile Active'}
                  </span>
                </div>

                <div className="mt-6 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center gap-3">
                    <FaBriefcase className="text-primary-600" />
                    <span>{lawyer.chamber_name || 'Not provided'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FaEnvelope className="text-primary-600" />
                    <span>{lawyer.email || 'Not shared yet'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FaPhoneAlt className="text-primary-600" />
                    <span>{lawyer.phone || 'Not shared yet'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FaPhoneAlt className="text-primary-600" />
                    <span>Chamber Line: {lawyer.chamber_phone || 'Not shared yet'}</span>
                  </div>
                </div>

                {lawyer.details_locked ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Full contact details stay masked until the wallet unlock is completed.
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default LawyersDirectory;
