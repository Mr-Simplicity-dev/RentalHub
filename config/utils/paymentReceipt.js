/**
 * Shared payment-receipt helpers: groups combined payments (registration
 * base + lawyer/agent add-ons share a base reference), builds receipt data,
 * emails receipts, and renders PDFs.
 */

const db = require('../middleware/database');
const { sendPaymentReceiptEmail } = require('./emailService');

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
  lawyer_access_fee: 'Lawyer Access Fee',
  agent_access_fee: 'Agent Access Fee',
  property_inspection_fee: 'Property Inspection Fee',
  evidence_verification: 'Evidence Verification',
  tenant_property_alert: 'Property Alert',
  tenant_location_access: 'Location Access',
};

const humanizePaymentType = (type) =>
  PAYMENT_TYPE_LABELS[type] ||
  String(type || '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') ||
  'Payment';

const formatNgn = (amount) => `₦${Number(amount || 0).toLocaleString()}`;

const baseReference = (reference) =>
  String(reference || '').replace(/_(LAWYER|AGENT)_FEE$/, '');

const getPaymentGroup = async (paymentId) => {
  const paymentResult = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
  const payment = paymentResult.rows[0] || null;
  if (!payment) return null;

  const ref = baseReference(payment.transaction_reference);
  let group = [payment];

  if (ref && ref !== payment.transaction_reference) {
    const groupResult = await db.query(
      `SELECT * FROM payments
       WHERE user_id = $1
         AND (
           transaction_reference = $2
           OR transaction_reference = $2 || '_LAWYER_FEE'
           OR transaction_reference = $2 || '_AGENT_FEE'
         )
       ORDER BY id`,
      [payment.user_id, ref]
    );
    if (groupResult.rows.length) group = groupResult.rows;
  }

  return { payment, group, ref };
};

const buildReceiptData = ({ payment, group, user, ref }) => {
  const items = group.map((p) => ({
    label: humanizePaymentType(p.payment_type),
    amount: formatNgn(p.amount),
  }));

  return {
    email: user.email,
    fullName: user.full_name,
    receiptNumber: `RCPT-${String(payment.id).padStart(6, '0')}`,
    reference: ref || payment.transaction_reference || '',
    date: new Date(payment.created_at).toLocaleString('en-NG'),
    items,
    total: formatNgn(group.reduce((sum, p) => sum + Number(p.amount || 0), 0)),
    status: payment.payment_status,
    method: payment.payment_method || 'Paystack',
  };
};

const loadReceiptContext = async (paymentId) => {
  const ctx = await getPaymentGroup(paymentId);
  if (!ctx) return null;
  const userResult = await db.query(
    'SELECT email, full_name FROM users WHERE id = $1',
    [ctx.payment.user_id]
  );
  const user = userResult.rows[0] || null;
  if (!user) return null;
  return { ...ctx, user };
};

const sendReceiptForPayment = async (paymentId) => {
  try {
    const ctx = await loadReceiptContext(paymentId);
    if (!ctx) return { success: false, error: 'Receipt context not found' };
    return await sendPaymentReceiptEmail(buildReceiptData(ctx));
  } catch (error) {
    console.error('sendReceiptForPayment error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  PAYMENT_TYPE_LABELS,
  baseReference,
  buildReceiptData,
  formatNgn,
  getPaymentGroup,
  humanizePaymentType,
  loadReceiptContext,
  sendReceiptForPayment,
};
