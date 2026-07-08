import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Loader from '../components/common/Loader';
import { paymentService } from '../services/paymentService';
import BackToDashboard from '../components/common/BackToDashboard';
import { useTranslation } from 'react-i18next';

const PAYMENT_TYPE_LABELS = {
  tenant_subscription: 'Subscription',
  tenant_multiple_property_subscription: 'Multiple Property Subscription',
  landlord_subscription: 'Landlord Subscription',
  property_unlock: 'Property Unlock',
  landlord_listing: 'Listing Payment',
  rent_payment: 'Rent Payment',
  wallet_funding: 'Wallet Funding',
  general_platform_fee: 'General Platform Payment',
};

const PAYMENT_STATUS_STYLES = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

const PAYMENT_TYPES_WITH_RETRY = ['rent_payment', 'tenant_subscription', 'property_unlock', 'wallet_funding'];

const formatAmount = (amount, currency = 'NGN') => {
  const value = Number(amount || 0);

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(value);
};

const formatPaymentType = (paymentType, tFn) => {
  const key = `payment_history.type_${paymentType}`;
  const translated = tFn ? tFn(key) : key;
  if (translated !== key) return translated;
  return PAYMENT_TYPE_LABELS[paymentType] ||
    paymentType
      ?.split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') ||
    'Payment';
};

const PaymentHistory = () => {
  const { t } = useTranslation();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingPaymentId, setPayingPaymentId] = useState(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);

    try {
      const response = await paymentService.getPaymentHistory({ limit: 50 });

      if (response.success) {
        setPayments(response.data || []);
      }
    } catch (error) {
      toast.error(t('payment_history.load_failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handlePayNow = async (payment) => {
    setPayingPaymentId(payment.id);

    try {
      const response = await paymentService.retryPayment(payment.id);

      if (response.success && response.data?.authorization_url) {
        // Open Paystack checkout in a new tab
        window.open(response.data.authorization_url, '_blank');
        toast.info(t('payment_history.payment_opened'));
      } else {
        toast.error(response.message || t('payment_history.retry_failed'));
      }
    } catch (error) {
      const message = error?.response?.data?.message || error.message || t('payment_history.init_failed');
      toast.error(message);
    } finally {
      setPayingPaymentId(null);
    }
  };

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('payment_history.title')}</h1>
        <BackToDashboard />
      </div>

      {payments.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          {t('payment_history.no_history')}
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <div key={payment.id} className="card">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-semibold text-gray-900">
                    {formatPaymentType(payment.payment_type, t)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {payment.property_title || t('payment_history.general_payment')}
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    {new Date(payment.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="text-left md:text-right">
                  <div className="text-lg font-bold text-gray-900">
                    {formatAmount(payment.amount, payment.currency || 'NGN')}
                  </div>
                  <div className="mt-2">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        PAYMENT_STATUS_STYLES[payment.payment_status] ||
                        'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {payment.payment_status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {t('payment_history.method')}: {payment.payment_method || 'N/A'}
                  </div>
                  {payment.transaction_reference && (
                    <div className="text-xs text-gray-500 mt-1 break-all">
                      {t('payment_history.ref')}: {payment.transaction_reference}
                    </div>
                  )}
                  {payment.payment_status === 'pending' && PAYMENT_TYPES_WITH_RETRY.includes(payment.payment_type) && (
                    <button
                      onClick={() => handlePayNow(payment)}
                      disabled={payingPaymentId === payment.id}
                      className="mt-3 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {payingPaymentId === payment.id ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-1.5 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          {t('payment_history.processing')}
                        </>
                      ) : (
                        t('payment_history.pay_now')
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
