import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FaReceipt, FaPrint, FaFilePdf } from 'react-icons/fa';
import { useSearchParams } from 'react-router-dom';
import Loader from '../components/common/Loader';
import { paymentService } from '../services/paymentService';
import BackToDashboard from '../components/common/BackToDashboard';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

const PAYMENT_TYPE_LABELS = {
  tenant_subscription: 'Subscription',
  tenant_multiple_property_subscription: 'Multiple Property Subscription',
  landlord_subscription: 'Landlord Subscription',
  property_unlock: 'Property Unlock',
  landlord_listing: 'Listing Payment',
  rent_payment: 'Rent Payment',
  wallet_funding: 'Wallet Funding',
  registration_fee: 'Registration Fee',
  general_platform_fee: 'Platform Payment',
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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingPaymentId, setPayingPaymentId] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedReceiptGroup, setSelectedReceiptGroup] = useState([]);
  const [receiptDeductions, setReceiptDeductions] = useState([]);
  const [receiptLoading, setReceiptLoading] = useState(false);

  // Group payments that were paid in ONE combined transaction (registration
  // base + lawyer + agent share a base reference). Separate transactions keep
  // their own groups, so each gets its own receipt.
  const paymentGroups = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      const key = p.group_key || p.transaction_reference || String(p.id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.values()];
  }, [payments]);

  const openReceipt = async (group) => {
    setSelectedReceiptGroup(group);
    setSelectedReceipt(group[0] || null);
    setReceiptDeductions([]);
    const ids = group.map((p) => p.id).filter(Boolean);
    if (!ids.length) return;
    setReceiptLoading(true);
    try {
      const all = [];
      for (const id of ids) {
        const res = await paymentService.getWalletTransactions({ payment_id: id, limit: 20 });
        if (res.data) all.push(...res.data);
      }
      setReceiptDeductions(all);
    } catch {
      setReceiptDeductions([]);
    } finally {
      setReceiptLoading(false);
    }
  };

  const groupTotal = (group) =>
    group.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const formatReceiptNumber = (payment) =>
    `RCPT-${String(payment?.id || 0).padStart(6, '0')}`;

  const downloadPdf = async (group) => {
    const base = group[0];
    try {
      const blob = await paymentService.downloadReceiptPdf(base.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${String(base.id).padStart(6, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Receipt downloaded');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to download receipt');
    }
  };

  // Auto-open a receipt when arriving with ?payment=<id> (e.g. from the wallet)
  useEffect(() => {
    const paymentParam = searchParams.get('payment');
    if (!paymentParam || !paymentGroups.length) return;
    const id = Number(paymentParam);
    const group = paymentGroups.find((g) => g.some((p) => Number(p.id) === id));
    if (group) openReceipt(group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, paymentGroups.length]);

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
  }, [t]);

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
    <div className="container mx-auto px-4 py-8" data-tour-id="payment-history-workflow">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('payment_history.title')}</h1>
        <BackToDashboard />
      </div>

      {paymentGroups.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          {t('payment_history.no_history')}
        </div>
      ) : (
        <div className="space-y-4">
          {paymentGroups.map((group) => {
            const first = group[0];
            const isCombined = group.length > 1;
            const combinedStatus = group.some((p) => p.payment_status === 'pending')
              ? 'pending'
              : group.every((p) => p.payment_status === 'completed')
                ? 'completed'
                : first.payment_status;

            if (!isCombined) {
              return (
                <div key={first.id} className="card">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {formatPaymentType(first.payment_type, t)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {first.property_title || t('payment_history.general_payment')}
                      </div>
                      <div className="text-sm text-gray-500 mt-2">
                        {new Date(first.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="text-left md:text-right">
                      <div className="text-lg font-bold text-gray-900">
                        {formatAmount(first.amount, first.currency || 'NGN')}
                      </div>
                      <div className="mt-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            PAYMENT_STATUS_STYLES[first.payment_status] ||
                            'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {first.payment_status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {t('payment_history.method')}: {first.payment_method || 'N/A'}
                      </div>
                      {first.transaction_reference && (
                        <div className="text-xs text-gray-500 mt-1 break-all">
                          {t('payment_history.ref')}: {first.transaction_reference}
                        </div>
                      )}
                      {first.payment_status === 'completed' && (
                        <button
                          onClick={() => openReceipt(group)}
                          className="mt-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                        >
                          <FaReceipt className="mr-1.5" /> {t('wallet.view_receipt')}
                        </button>
                      )}
                      {first.payment_status === 'pending' && PAYMENT_TYPES_WITH_RETRY.includes(first.payment_type) && (
                        <button
                          onClick={() => handlePayNow(first)}
                          disabled={payingPaymentId === first.id}
                          className="mt-3 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {payingPaymentId === first.id ? (
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
              );
            }

            // Combined payment (one transaction, multiple line items)
            return (
              <div key={first.group_key || first.transaction_reference} className="card">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900">
                      Combined Payment ({group.length} items)
                    </div>
                    <div className="mt-2 space-y-1">
                      {group.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                          <span className="text-gray-600">{formatPaymentType(item.payment_type, t)}</span>
                          <span className="font-medium text-gray-900">
                            {formatAmount(item.amount, item.currency || 'NGN')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-4 border-t border-gray-100 pt-2 text-sm font-bold text-gray-900">
                      <span>Total</span>
                      <span>{formatAmount(groupTotal(group), first.currency || 'NGN')}</span>
                    </div>
                    <div className="text-sm text-gray-500 mt-2">
                      {new Date(first.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-left md:text-right">
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          PAYMENT_STATUS_STYLES[combinedStatus] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {combinedStatus}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {t('payment_history.method')}: {first.payment_method || 'N/A'}
                    </div>
                    {first.transaction_reference && (
                      <div className="text-xs text-gray-500 mt-1 break-all">
                        {t('payment_history.ref')}: {first.group_key || first.transaction_reference}
                      </div>
                    )}
                    {combinedStatus === 'completed' && (
                      <button
                        onClick={() => openReceipt(group)}
                        className="mt-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                      >
                        <FaReceipt className="mr-1.5" /> {t('wallet.view_receipt')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="receipt-print-area p-6">
              <div className="border-b border-gray-200 pb-4 text-center">
                <img
                  src="/rentalhub-mark.svg"
                  alt="RentalHub NG"
                  className="mx-auto h-10 w-10 rounded-xl object-contain"
                />
                <h2 className="mt-2 text-lg font-bold text-gray-900">RentalHub NG</h2>
                <p className="text-xs text-gray-500">{t('wallet.receipt')}</p>
                <p className="mt-1 text-xs font-semibold text-gray-700">
                  {formatReceiptNumber(selectedReceipt)}
                </p>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.ref')}</span>
                  <span className="break-all text-right font-medium text-gray-900">
                    {selectedReceipt.group_key || selectedReceipt.transaction_reference}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.date')}</span>
                  <span className="text-right font-medium text-gray-900">
                    {new Date(selectedReceipt.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.payer')}</span>
                  <span className="text-right font-medium text-gray-900">
                    {user?.full_name || user?.email}
                  </span>
                </div>
              </div>

              {selectedReceiptGroup.length > 1 && (
                <div className="mt-3 rounded-lg border border-gray-200">
                  {selectedReceiptGroup.map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-4 px-3 py-2 text-sm ${
                        index > 0 ? 'border-t border-gray-100' : ''
                      }`}
                    >
                      <span className="text-gray-700">{formatPaymentType(item.payment_type, t)}</span>
                      <span className="font-medium text-gray-900">
                        {formatAmount(item.amount, item.currency || 'NGN')}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900">
                    <span>Total Paid</span>
                    <span>{formatAmount(groupTotal(selectedReceiptGroup), selectedReceipt.currency || 'NGN')}</span>
                  </div>
                </div>
              )}
              {selectedReceiptGroup.length === 1 && (
                <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <span className="text-gray-700">{t('payment_history.payment_for')}</span>
                  <span className="font-medium text-gray-900">
                    {formatPaymentType(selectedReceipt.payment_type, t)}
                  </span>
                </div>
              )}

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.amount')}</span>
                  <span className="text-right text-base font-bold text-gray-900">
                    {formatAmount(
                      selectedReceiptGroup.length > 1
                        ? groupTotal(selectedReceiptGroup)
                        : selectedReceipt.amount,
                      selectedReceipt.currency || 'NGN'
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.status')}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      PAYMENT_STATUS_STYLES[selectedReceipt.payment_status] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {selectedReceipt.payment_status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.method')}</span>
                  <span className="text-right font-medium text-gray-900">
                    {selectedReceipt.payment_method || 'Paystack'}
                  </span>
                </div>
                {receiptDeductions.length > 0 && (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-700">Breakdown</p>
                    {receiptDeductions.map((tx) => {
                      const fee = Number(tx.metadata?.platform_fee || 0);
                      return (
                        <div key={tx.id} className="mt-1.5 space-y-0.5 text-xs text-gray-600">
                          <div className="flex items-center justify-between">
                            <span>{tx.type === 'credit' ? 'Amount credited' : 'Amount deducted'}</span>
                            <span className="font-semibold text-gray-900">
                              {tx.type === 'credit' ? '+' : '−'}₦{Number(tx.amount).toLocaleString()}
                            </span>
                          </div>
                          {fee > 0 && (
                            <div className="flex items-center justify-between">
                              <span>Platform fee deducted ({tx.metadata?.platform_fee_rate ? `${Number(tx.metadata.platform_fee_rate) * 100}%` : ''})</span>
                              <span className="font-semibold text-red-600">−₦{fee.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {receiptLoading && (
                  <p className="mt-2 text-xs text-gray-400">Loading breakdown…</p>
                )}
              </div>
              <div className="mt-6 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
                Thank you for using RentalHub NG.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-4 print:hidden">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => downloadPdf(selectedReceiptGroup)}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <FaFilePdf className="mr-1.5" /> Download PDF
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
              >
                <FaPrint className="mr-1.5" /> Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
