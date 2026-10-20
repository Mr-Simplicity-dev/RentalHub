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

const CHANNEL_LABELS = {
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  bank: 'Bank',
  ussd: 'USSD',
  qr: 'QR Code',
  mobile_money: 'Mobile Money',
  pos: 'POS',
  transfer: 'Transfer',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};
const humanizeChannel = (channel) =>
  CHANNEL_LABELS[channel] ||
  String(channel || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ||
  '';

const RECEIPT_STATUS_LABELS = {
  completed: 'PAID',
  success: 'PAID',
  paid: 'PAID',
  pending: 'PENDING',
  processing: 'PROCESSING',
  failed: 'FAILED',
  reversed: 'REVERSED',
  refunded: 'REFUNDED',
  cancelled: 'CANCELLED',
  abandoned: 'ABANDONED',
};

const STATUS_LABELS = {
  completed: 'Completed',
  success: 'Success',
  paid: 'Paid',
  pending: 'Pending',
  processing: 'Processing',
  failed: 'Failed',
  reversed: 'Reversed',
  refunded: 'Refunded',
  processed: 'Processed',
  rejected: 'Rejected',
  approved: 'Approved',
  cancelled: 'Cancelled',
};

const humanizeStatus = (status) =>
  STATUS_LABELS[status] ||
  String(status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const receiptStatus = (status) =>
  RECEIPT_STATUS_LABELS[status] || humanizeStatus(status).toUpperCase();

const METHOD_LABELS = {
  paystack: 'Paystack',
  wallet: 'Wallet',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  banktransfer: 'Bank Transfer',
  transfer: 'Bank Transfer',
  ussd: 'USSD',
  qr: 'QR',
  pos: 'POS',
  mobile_money: 'Mobile Money',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
};

const humanizeMethod = (method) => METHOD_LABELS[method] || humanizeChannel(method) || 'Paystack';

const humanizeMethodLine = (method, channel) => {
  const methodLabel = humanizeMethod(method);
  const channelLabel = channel ? humanizeChannel(channel) : '';
  if (!channelLabel || channelLabel.toLowerCase() === methodLabel.toLowerCase()) return methodLabel;
  return `${methodLabel} — ${channelLabel}`;
};

const formatNigerianDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${datePart}, ${timePart} WAT`;
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
  const [receiptData, setReceiptData] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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
    setReceiptData(null);
    const base = group[0];
    if (!base?.id) return;
    try {
      // Same shared receipt data the email and PDF are built from, so the
      // modal can never disagree with them.
      const res = await paymentService.getReceiptData(base.id);
      if (res?.success) setReceiptData(res.data);
    } catch {
      setReceiptData(null);
    }
  };

  const groupTotal = (group) =>
    group.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const formatReceiptNumber = (payment) =>
    `ARH-RCPT-${String(payment?.id || 0).padStart(6, '0')}`;

  const downloadPdf = async (group) => {
    const base = group[0];
    if (!base?.id || downloadingPdf) return;

    setDownloadingPdf(true);
    try {
      const blob = await paymentService.downloadReceiptPdf(base.id);

      // When the server answers with JSON (an error or an expired session) axios
      // still hands back a Blob, so the "PDF" saved was a corrupt file the
      // browser could not open. Detect that and surface the real message.
      const looksLikePdf = blob && blob.type === 'application/pdf';
      if (!looksLikePdf && blob && blob.type && blob.type.includes('json')) {
        const text = await blob.text();
        let message = 'Failed to download receipt';
        try {
          message = JSON.parse(text)?.message || message;
        } catch {
          // Not JSON after all; keep the generic message.
        }
        throw new Error(message);
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${String(base.id).padStart(6, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success('Receipt downloaded');
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to download receipt');
    } finally {
      setDownloadingPdf(false);
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
                        {formatNigerianDateTime(first.created_at)}
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
                          {humanizeStatus(first.payment_status)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {t('payment_history.method')}: {humanizeMethodLine(first.payment_method, first.payment_channel)}
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
                      {formatNigerianDateTime(first.created_at)}
                    </div>
                  </div>

                  <div className="text-left md:text-right">
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          PAYMENT_STATUS_STYLES[combinedStatus] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {humanizeStatus(combinedStatus)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {t('payment_history.method')}: {humanizeMethodLine(first.payment_method, first.payment_channel)}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            className="my-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="receipt-print-area flex-1 overflow-y-auto p-6">
              <div className="border-b border-gray-200 pb-4 text-center">
                <img
                  src="/rentalhub-mark.svg"
                  alt="Amana RentalHub NG"
                  className="mx-auto h-10 w-10 rounded-xl object-contain"
                />
                <div className="amana-mark mt-1 text-lg">Amana</div>
                <h2 className="text-lg font-bold text-gray-900">Amana RentalHub NG</h2>
                <p className="text-xs text-gray-500">{receiptData?.documentType || t('wallet.receipt')}</p>
                <p className="mt-1 text-xs font-semibold text-gray-700">
                  {receiptData?.receiptNumber || formatReceiptNumber(selectedReceipt)}
                </p>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.payer')}</span>
                  <span className="text-right font-medium text-gray-900">
                    {receiptData?.fullName || user?.full_name || user?.email}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">Email</span>
                  <span className="break-all text-right font-medium text-gray-900">
                    {receiptData?.email || user?.email || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.ref')}</span>
                  <span className="break-all text-right font-medium text-gray-900">
                    {receiptData?.reference || selectedReceipt.group_key || selectedReceipt.transaction_reference}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.date')}</span>
                  <span className="text-right font-medium text-gray-900">
                    {receiptData?.date || formatNigerianDateTime(selectedReceipt.created_at)}
                  </span>
                </div>
              </div>

              {receiptData?.rent && (
                <div className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3 text-sm">
                  {receiptData.rent.paymentFor && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-500">Payment For</span>
                      <span className="text-right font-medium text-gray-900">{receiptData.rent.paymentFor}</span>
                    </div>
                  )}
                  {receiptData.rent.propertyTitle && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-500">Property</span>
                      <span className="text-right font-medium text-gray-900">{receiptData.rent.propertyTitle}</span>
                    </div>
                  )}
                  {receiptData.rent.propertyAddress && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-gray-500">Property Address</span>
                      <span className="text-right font-medium text-gray-900">{receiptData.rent.propertyAddress}</span>
                    </div>
                  )}
                  {receiptData.rent.tenantName && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-500">Tenant</span>
                      <span className="text-right font-medium text-gray-900">{receiptData.rent.tenantName}</span>
                    </div>
                  )}
                  {receiptData.rent.landlordName && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-500">Landlord</span>
                      <span className="text-right font-medium text-gray-900">{receiptData.rent.landlordName}</span>
                    </div>
                  )}
                  {receiptData.rent.rentalPeriod && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-500">Rental Period</span>
                      <span className="text-right font-medium text-gray-900">
                        {receiptData.rent.rentalPeriod.end
                          ? `${receiptData.rent.rentalPeriod.start} - ${receiptData.rent.rentalPeriod.end}`
                          : receiptData.rent.rentalPeriod.start}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {receiptData?.items?.length ? (
                <div className="mt-3 rounded-lg border border-gray-200">
                  {receiptData.items.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between gap-4 px-3 py-2 text-sm ${
                        index > 0 ? 'border-t border-gray-100' : ''
                      }`}
                    >
                      <span className="text-gray-700">{item.label}</span>
                      <span className="font-medium text-gray-900">{item.amount}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900">
                    <span>Total Paid</span>
                    <span>{receiptData.total}</span>
                  </div>
                </div>
              ) : selectedReceiptGroup.length > 1 ? (
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
              ) : (
                <div className="mt-3 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                    <span className="text-gray-700">{t('payment_history.payment_for')}</span>
                    <span className="font-medium text-gray-900">
                      {formatPaymentType(selectedReceipt.payment_type, t)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900">
                    <span>Total Paid</span>
                    <span>{formatAmount(selectedReceipt.amount, selectedReceipt.currency || 'NGN')}</span>
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.status')}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      PAYMENT_STATUS_STYLES[selectedReceipt.payment_status] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {receiptData?.status || receiptStatus(selectedReceipt.payment_status)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">{t('payment_history.method')}</span>
                  <span className="text-right font-medium text-gray-900">
                    {receiptData?.methodLine ||
                      humanizeMethodLine(selectedReceipt.payment_method, selectedReceipt.payment_channel)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500">Currency</span>
                  <span className="text-right font-medium text-gray-900">
                    {receiptData?.currency || selectedReceipt.currency || 'NGN'}
                  </span>
                </div>
                {Number(receiptData?.rent?.platformFee) > 0 && (
                  <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                    Platform/Service Fee: ₦{Number(receiptData.rent.platformFee).toLocaleString()} (deducted
                    from the landlord&apos;s payout — not charged to you)
                  </p>
                )}
              </div>
              <div className="mt-6 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
                Thank you for using Amana RentalHub NG. This is a computer-generated receipt and does not
                require a signature.
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 p-4 print:hidden">
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => downloadPdf(selectedReceiptGroup)}
                disabled={downloadingPdf}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FaFilePdf className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {downloadingPdf ? 'Preparing…' : 'Download PDF'}
              </button>
              <button
                type="button"
                onClick={() => {
                  document.body.classList.add('printing-receipt');
                  const cleanup = () => {
                    document.body.classList.remove('printing-receipt');
                    window.removeEventListener('afterprint', cleanup);
                  };
                  window.addEventListener('afterprint', cleanup);
                  window.print();
                }}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
              >
                <FaPrint className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" /> Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
