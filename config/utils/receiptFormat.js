// Shared display helpers for financial receipts (email, PDF and web) so the
// three surfaces can never disagree on formatting.

const RECEIPT_NOTICE = 'This is a computer-generated receipt and does not require a signature.';

const PLATFORM_BRAND = 'Amana RentalHub NG';
const PLATFORM_DOMAIN = 'rentalhub.com.ng';
const PLATFORM_SUPPORT_EMAIL = 'support@rentalhub.com.ng';

// Escape untrusted values before interpolation into receipt HTML.
const escapeHtml = (value) =>
  String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Payment status -> receipt-facing label. PAID is only ever shown for a
// genuinely settled payment; anything else keeps its own honest label.
const PAYMENT_STATUS_LABELS = {
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

// Generic status humanization for non-receipt UI (Completed, Pending, ...).
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

const humanize = (value) => {
  const text = String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const humanizeStatus = (status) => STATUS_LABELS[status] || humanize(status);

const receiptStatus = (status) =>
  PAYMENT_STATUS_LABELS[String(status || '').toLowerCase()] || humanize(status).toUpperCase();

const PAYMENT_METHOD_LABELS = {
  paystack: 'Paystack',
  wallet: 'Wallet',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  banktransfer: 'Bank Transfer',
  transfer: 'Bank Transfer',
  mobile_money: 'Mobile Money',
  mobilemoney: 'Mobile Money',
  ussd: 'USSD',
  qr: 'QR',
  pos: 'POS',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
};

const humanizePaymentMethod = (method) => {
  const key = String(method || '').toLowerCase();
  if (PAYMENT_METHOD_LABELS[key]) return PAYMENT_METHOD_LABELS[key];
  return humanize(method) || 'Paystack';
};

const humanizePaymentChannel = (channel) => {
  const key = String(channel || '').toLowerCase();
  if (PAYMENT_METHOD_LABELS[key]) return PAYMENT_METHOD_LABELS[key];
  return humanize(channel);
};

// "Paystack - Card" style combined method line used on receipts.
const paymentMethodLine = (method, channel) => {
  const methodLabel = humanizePaymentMethod(method);
  const channelLabel = channel ? humanizePaymentChannel(channel) : '';
  if (!channelLabel || channelLabel.toLowerCase() === methodLabel.toLowerCase()) return methodLabel;
  return `${methodLabel} \u2014 ${channelLabel}`;
};

// Explicit Nigerian time - never depend on the server timezone.
const formatNigerianDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
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

const formatNigerianDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

// Mask a bank account number for user-facing documents: ****7890
const maskAccountNumber = (accountNumber) => {
  const value = String(accountNumber || '').replace(/\s+/g, '');
  if (!value) return '';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
};

module.exports = {
  RECEIPT_NOTICE,
  PLATFORM_BRAND,
  PLATFORM_DOMAIN,
  PLATFORM_SUPPORT_EMAIL,
  escapeHtml,
  esc: escapeHtml,
  PAYMENT_STATUS_LABELS,
  STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  humanize,
  humanizeStatus,
  receiptStatus,
  humanizePaymentMethod,
  humanizePaymentChannel,
  paymentMethodLine,
  formatNigerianDateTime,
  formatNigerianDate,
  maskAccountNumber,
};
