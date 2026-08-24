import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FaCheckCircle, FaClock, FaHome, FaWallet } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import BackToDashboard from '../components/common/BackToDashboard';
import { paymentService } from '../services/paymentService';
import { useTranslation } from 'react-i18next';

const formatCurrency = (value) => `\u20A6${Number(value || 0).toLocaleString()}`;

const getSubscriptionLabel = (userType, t) =>
  userType === 'landlord' ? t('subscribe.landlord_label') : t('subscribe.tenant_label');

const Subscribe = () => {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [quoteData, setQuoteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribingType, setSubscribingType] = useState(null);

  const quote = quoteData?.quote || {};
  const funding = quoteData?.funding || {};
  const multipleProperty = quoteData?.multiple_property || null;
  const multiplePropertyQuote = multipleProperty?.quote || {};
  const multiplePropertyFunding = multipleProperty?.funding || {};
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

  const loadQuote = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await paymentService.getSubscriptionQuote();
      if (response.success) {
        setQuoteData(response.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('subscribe.load_pricing_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSubscribe = async (subscriptionType = 'monthly') => {
    try {
      setSubscribingType(subscriptionType);

      const payload = { subscription_type: subscriptionType };
      const response = await paymentService.initializeSubscription(payload);

      if (response.success) {
        toast.success(response.message || t('subscribe.activated'));
        if (subscriptionType === 'monthly') {
          updateUser({
            ...user,
            subscription_active: true,
            subscription_expires_at: response.data?.subscription_expires_at,
          });
        }
        await loadQuote();
      } else {
        toast.error(response.message || t('subscribe.activate_failed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('subscribe.activate_failed'));
    } finally {
      setSubscribingType(null);
    }
  };

  if (!isTenant && !isLandlord) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold">{t('subscribe.unavailable_title')}</h1>
            <BackToDashboard />
          </div>
          <div className="card text-center text-gray-600">
            {t('subscribe.unavailable_desc')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{getSubscriptionLabel(user?.user_type, t)}</h1>
          <p className="text-sm text-gray-600">
            {t('subscribe.paid_from_credit')}
          </p>
        </div>
        <BackToDashboard />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FaClock className="text-2xl" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase text-indigo-600">{t('subscribe.monthly_plan')}</p>
              <h2 className="text-2xl font-bold text-gray-900">
                {loading ? t('subscribe.loading') : t('subscribe.monthly_price', { amount: formatCurrency(quote.amount) })}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {t('subscribe.pricing_controlled')}
              </p>
            </div>
          </div>

          {isActive && (
            <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {t('subscribe.active_until', { date: expiresAt.toLocaleDateString() })}
            </div>
          )}

          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <div className="flex items-center gap-2 text-gray-800">
              <FaCheckCircle className="text-indigo-500" />
              <span>
                {t('subscribe.pricing_source')} {quote.rule_scope || 'base'}
                {quote.location_source ? ` (${quote.location_source})` : ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleSubscribe('monthly')}
            disabled={loading || subscribingType === 'monthly' || Number(funding.total_available || 0) < Number(quote.amount || 0)}
            className="btn btn-primary mt-6 w-full py-3 text-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {subscribingType === 'monthly' ? t('subscribe.activating') : t('subscribe.activate_monthly')}
          </button>

          {Number(funding.total_available || 0) < Number(quote.amount || 0) && !loading && (
            <p className="mt-3 text-center text-sm text-red-600">
              {t('subscribe.insufficient_balance')}
            </p>
          )}
        </div>

        {isTenant && (
          <div className="card">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <FaHome className="text-2xl" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase text-emerald-600">
                  {t('subscribe.multiple_property_addon')}
                </p>
                <h2 className="text-2xl font-bold text-gray-900">
                  {loading ? t('subscribe.loading') : t('subscribe.monthly_price', { amount: formatCurrency(multiplePropertyQuote.amount) })}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  {t('subscribe.multiple_property_desc')}
                </p>
              </div>
            </div>

            {multipleProperty?.active && multipleProperty?.expires_at && (
              <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {t('subscribe.active_until', { date: new Date(multipleProperty.expires_at).toLocaleDateString() })}
              </div>
            )}

            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <div className="flex items-center gap-2 text-gray-800">
                <FaCheckCircle className="text-emerald-500" />
                <span>
                  {t('subscribe.pricing_source')} {multiplePropertyQuote.rule_scope || 'base'}
                  {multiplePropertyQuote.location_source ? ` (${multiplePropertyQuote.location_source})` : ''}
                </span>
              </div>
              <p className="mt-2">
                {t('subscribe.rented_properties')} {multipleProperty?.rented_properties_count || 0}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleSubscribe('multiple_property')}
              disabled={
                loading ||
                subscribingType === 'multiple_property' ||
                Number(multiplePropertyFunding.total_available || 0) < Number(multiplePropertyQuote.amount || 0)
              }
              className="btn btn-primary mt-6 w-full py-3 text-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {subscribingType === 'multiple_property'
                ? t('subscribe.activating')
                : multipleProperty?.active
                  ? t('subscribe.renew_multiple')
                  : t('subscribe.activate_multiple')}
            </button>

            {Number(multiplePropertyFunding.total_available || 0) < Number(multiplePropertyQuote.amount || 0) && !loading && (
              <p className="mt-3 text-center text-sm text-red-600">
                {t('subscribe.insufficient_addon_balance')}
              </p>
            )}
          </div>
        )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center gap-3">
            <FaWallet className="text-2xl text-emerald-600" />
            <h2 className="text-lg font-bold">{t('subscribe.funding_sources')}</h2>
          </div>

          <div className="space-y-3 text-sm">
              <FundingRow
                label={t('subscribe.subscription_credit')}
                value={funding.subscription_credit_balance}
              />
              {isTenant && (
                <>
                  <FundingRow label={t('subscribe.wallet_balance')} value={funding.wallet_balance} />
                  <FundingRow label={t('subscribe.rent_savings')} value={funding.rent_savings_balance} />
                </>
              )}
              {isLandlord && (
                <FundingRow label={t('subscribe.cleared_rent_balance')} value={funding.landlord_rent_balance} />
              )}
              <div className="border-t border-gray-200 pt-3">
                <FundingRow label={t('subscribe.total_available')} value={funding.total_available} strong />
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
            <FaCheckCircle className="mt-0.5 shrink-0" />
            <span>
              {t('subscribe.paystack_notice')}
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
