import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Loader from '../components/common/Loader';
import { paymentService } from '../services/paymentService';

const PAYMENT_TYPE_LABELS = {
  tenant_subscription: 'Subscription',
  property_unlock: 'Property Unlock',
  landlord_listing: 'Listing Payment',
  rent_payment: 'Rent Payment',
  general_platform_fee: 'General Platform Payment',
};

const PAYMENT_STATUS_STYLES = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

const formatAmount = (amount, currency = 'NGN') => {
  const value = Number(amount || 0);

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(value);
};

const formatPaymentType = (paymentType) =>
  PAYMENT_TYPE_LABELS[paymentType] ||
  paymentType
    ?.split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') ||
  'Payment';

const PaymentHistory = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPayments = useCallback(async () => {
    setLoading(true);

    try {
      const response = await paymentService.getPaymentHistory({ limit: 50 });

      if (response.success) {
        setPayments(response.data || []);
      }
    } catch (error) {
      toast.error('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-center">Payment History</h1>

      {payments.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          No payment history yet.
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <div key={payment.id} className="card">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-semibold text-gray-900">
                    {formatPaymentType(payment.payment_type)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {payment.property_title || 'General platform payment'}
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
                    Method: {payment.payment_method || 'N/A'}
                  </div>
                  {payment.transaction_reference && (
                    <div className="text-xs text-gray-500 mt-1 break-all">
                      Ref: {payment.transaction_reference}
                    </div>
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
