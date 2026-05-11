import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FaCheckCircle, FaClock, FaMapMarkerAlt, FaWallet } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import BackToDashboard from '../components/common/BackToDashboard';
import { paymentService } from '../services/paymentService';
import { propertyService } from '../services/propertyService';

const formatCurrency = (value) => `\u20A6${Number(value || 0).toLocaleString()}`;

const getSubscriptionLabel = (userType) =>
  userType === 'landlord' ? 'Landlord Monthly Subscription' : 'Tenant Monthly Subscription';

const Subscribe = () => {
  const { user, updateUser } = useAuth();
  const [quoteData, setQuoteData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({
    state_id: user?.preferred_state_id ? String(user.preferred_state_id) : '',
    lga_name: user?.preferred_lga_name || '',
  });
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  const selectedState = useMemo(
    () => locations.find((item) => String(item.id) === String(form.state_id)),
    [locations, form.state_id]
  );
  const availableLgas = selectedState?.lgas || [];
  const quote = quoteData?.quote || {};
  const funding = quoteData?.funding || {};
  const isLandlord = user?.user_type === 'landlord';
  const isTenant = user?.user_type === 'tenant';
  const expiresAt = user?.subscription_expires_at
    ? new Date(user.subscription_expires_at)
    : null;
  const isActive =
    user?.subscription_active &&
    expiresAt &&
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt > new Date();

  const loadQuote = async (nextForm = form) => {
    if (!user) return;

    try {
      setLoading(true);
      const params = {};
      if (nextForm.state_id) params.state_id = nextForm.state_id;
      if (nextForm.lga_name) params.lga_name = nextForm.lga_name;

      const response = await paymentService.getSubscriptionQuote(params);
      if (response.success) {
        setQuoteData(response.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load subscription pricing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const response = await propertyService.getLocationOptions();
        if (response.success) {
          setLocations(response.data || []);
        }
      } catch (error) {
        console.error('Failed to load locations', error);
      }
    };

    loadLocations();
  }, []);

  useEffect(() => {
    loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextForm = {
      ...form,
      [name]: value,
      ...(name === 'state_id' ? { lga_name: '' } : {}),
    };

    setForm(nextForm);
    loadQuote(nextForm);
  };

  const handleSubscribe = async () => {
    try {
      setSubscribing(true);

      const payload = {};
      if (form.state_id) payload.state_id = Number(form.state_id);
      if (form.lga_name) payload.lga_name = form.lga_name;

      const response = await paymentService.initializeSubscription(payload);

      if (response.success) {
        toast.success(response.message || 'Subscription activated');
        updateUser({
          ...user,
          subscription_active: true,
          subscription_expires_at: response.data?.subscription_expires_at,
        });
        await loadQuote();
      } else {
        toast.error(response.message || 'Could not activate subscription');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not activate subscription');
    } finally {
      setSubscribing(false);
    }
  };

  if (!isTenant && !isLandlord) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold">Subscription unavailable</h1>
            <BackToDashboard />
          </div>
          <div className="card text-center text-gray-600">
            Monthly subscriptions are only available to tenant and landlord accounts.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{getSubscriptionLabel(user?.user_type)}</h1>
          <p className="text-sm text-gray-600">
            Paid only from subscription credit and approved internal balances.
          </p>
        </div>
        <BackToDashboard />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FaClock className="text-2xl" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase text-indigo-600">Monthly Plan</p>
              <h2 className="text-2xl font-bold text-gray-900">
                {loading ? 'Loading...' : `${formatCurrency(quote.amount)} / month`}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Base price is {formatCurrency(200)}. Super Admin location pricing can increase the amount by state or LGA.
              </p>
            </div>
          </div>

          {isActive && (
            <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Active until {expiresAt.toLocaleDateString()}. Renewing adds another 30 days.
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Pricing State
              </label>
              <select
                name="state_id"
                value={form.state_id}
                onChange={handleChange}
                className="input"
              >
                <option value="">Use saved/default pricing</option>
                {locations.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.state_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Pricing LGA
              </label>
              <select
                name="lga_name"
                value={form.lga_name}
                onChange={handleChange}
                className="input"
                disabled={!form.state_id}
              >
                <option value="">Whole state</option>
                {availableLgas.map((lga) => (
                  <option key={lga} value={lga}>
                    {lga}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <div className="flex items-center gap-2 text-gray-800">
              <FaMapMarkerAlt className="text-indigo-500" />
              <span>
                Pricing source: {quote.rule_scope || 'base'}
                {quote.location_source ? ` (${quote.location_source})` : ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading || subscribing || Number(funding.total_available || 0) < Number(quote.amount || 0)}
            className="btn btn-primary mt-6 w-full py-3 text-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {subscribing ? 'Activating...' : 'Activate Monthly Subscription'}
          </button>

          {Number(funding.total_available || 0) < Number(quote.amount || 0) && !loading && (
            <p className="mt-3 text-center text-sm text-red-600">
              Insufficient internal balance for this subscription.
            </p>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center gap-3">
            <FaWallet className="text-2xl text-emerald-600" />
            <h2 className="text-lg font-bold">Funding Sources</h2>
          </div>

          <div className="space-y-3 text-sm">
            <FundingRow
              label="Subscription Credit"
              value={funding.subscription_credit_balance}
            />
            {isTenant && (
              <>
                <FundingRow label="Wallet Balance" value={funding.wallet_balance} />
                <FundingRow label="Rent Savings" value={funding.rent_savings_balance} />
              </>
            )}
            {isLandlord && (
              <FundingRow label="Cleared Rent Balance" value={funding.landlord_rent_balance} />
            )}
            <div className="border-t border-gray-200 pt-3">
              <FundingRow label="Total Available" value={funding.total_available} strong />
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
            <FaCheckCircle className="mt-0.5 shrink-0" />
            <span>
              Paystack is not used here. Subscription credit is used first, then the allowed internal balance for your account type.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const FundingRow = ({ label, value, strong = false }) => (
  <div className="flex items-center justify-between gap-3">
    <span className={strong ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
    <span className={strong ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}>
      {formatCurrency(value)}
    </span>
  </div>
);

export default Subscribe;
