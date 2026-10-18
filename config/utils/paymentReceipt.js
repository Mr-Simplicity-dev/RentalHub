/**
 * Shared payment-receipt helpers: groups combined payments (registration
 * base + lawyer/agent add-ons share a base reference), builds the single
 * receipt-data object reused by email, PDF and the Payment History modal,
 * and emails payment/payout receipts.
 */

const db = require('../middleware/database');
const logger = require('./logger');
const mailer = require('./mailer');
const { sendPaymentReceiptEmail } = require('./emailService');
const {
  RECEIPT_NOTICE,
  esc,
  receiptStatus,
  humanizeStatus,
  humanizePaymentMethod,
  humanizePaymentChannel,
  paymentMethodLine,
  formatNigerianDateTime,
  maskAccountNumber,
} = require('./receiptFormat');
const {
  paymentReceiptNumber,
  userPayoutReceiptNumber,
  agentPayoutReceiptNumber,
  adminPayoutReceiptNumber,
} = require('./referenceGenerator');

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

const DOCUMENT_TYPE_GENERIC = 'OFFICIAL PAYMENT RECEIPT';
const DOCUMENT_TYPE_RENT = 'OFFICIAL RENT PAYMENT RECEIPT';

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

// Period dates come from tenancy terms as date-only strings; render them
// explicitly in African/Lagos so the receipt never depends on server tz.
const formatPeriodDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

// "Payment For" from the actual billing period - never guess "Annual Rent".
const rentPaymentFor = (frequency) => {
  const key = String(frequency || '').toLowerCase();
  if (key === 'monthly') return 'Monthly Rent';
  if (key === 'quarterly') return 'Quarterly Rent';
  if (key === 'yearly' || key === 'annual' || key === 'annually') return 'Annual Rent';
  return 'Rent Payment';
};

const buildReceiptData = ({ payment, group, user, ref, diasporaQuote, rent }) => {
  const isRent = payment.payment_type === 'rent_payment';
  const items = group.map((p) => ({
    label: isRent && p.payment_type === 'rent_payment'
      ? 'Rent Amount'
      : humanizePaymentType(p.payment_type),
    amount: formatNgn(p.amount),
  }));

  return {
    email: user.email,
    fullName: user.full_name,
    receiptNumber: paymentReceiptNumber(payment.id),
    reference: ref || payment.transaction_reference || '',
    date: formatNigerianDateTime(payment.created_at),
    items,
    total: formatNgn(group.reduce((sum, p) => sum + Number(p.amount || 0), 0)),
    totalAmount: group.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    status: receiptStatus(payment.payment_status),
    method: humanizePaymentMethod(payment.payment_method),
    channel: humanizePaymentChannel(payment.payment_channel),
    methodLine: paymentMethodLine(payment.payment_method, payment.payment_channel),
    currency: payment.currency || 'NGN',
    documentType: isRent ? DOCUMENT_TYPE_RENT : DOCUMENT_TYPE_GENERIC,
    paymentType: payment.payment_type,
    paymentId: payment.id,
    // Detailed rent context (property/tenant/landlord/period/fee) when the
    // payment is a rent payment; null otherwise. Optional fields may be empty.
    rent: rent || null,
    // Diaspora registration quotes (USD + FX) surfaced on the receipt.
    quoteUsd: diasporaQuote?.quote_amount_usd ?? null,
    fxRate: diasporaQuote?.fx_rate ?? null,
    fxMarkupPct: diasporaQuote?.fx_markup_pct ?? null,
    quoteCurrency: diasporaQuote?.quote_currency ?? null,
  };
};

// Load the detailed rent context for a rent_payment: property, address,
// tenant, landlord, authoritative tenancy period and any actual platform fee
// recorded against this payment. Every field is optional - a missing record
// must never break receipt generation.
const loadRentContext = async (payment, payer) => {
  if (payment.payment_type !== 'rent_payment' || !payment.property_id) return null;
  try {
    const propertyResult = await db.query(
      `SELECT p.title, p.full_address, p.area, p.city, p.lga_name,
              p.payment_frequency, p.landlord_id,
              s.state_name, lu.full_name AS landlord_name
       FROM properties p
       LEFT JOIN states s ON s.id = p.state_id
       LEFT JOIN users lu ON lu.id = p.landlord_id
       WHERE p.id = $1`,
      [payment.property_id]
    );
    const property = propertyResult.rows[0] || null;

    let terms = null;
    try {
      const agreementResult = await db.query(
        `SELECT tav.terms
         FROM tenancy_agreements ta
         LEFT JOIN tenancy_agreement_versions tav
           ON tav.agreement_id = ta.id AND tav.version = ta.current_version
         WHERE ta.property_id = $1 AND ta.tenant_id = $2
         ORDER BY ta.id DESC
         LIMIT 1`,
        [payment.property_id, payment.user_id]
      );
      terms = agreementResult.rows[0]?.terms || null;
    } catch (agreementError) {
      logger.warn('rent receipt tenancy lookup failed', { error: agreementError.message });
    }

    // The actual platform fee for THIS transaction, recorded when the landlord
    // rent credit was created (deducted from the landlord payout - never
    // invented from today's fee configuration).
    let platformFee = null;
    try {
      const feeResult = await db.query(
        `SELECT metadata FROM wallet_transactions
         WHERE payment_id = $1 AND source = 'rent_payment' AND type = 'credit'
         ORDER BY id
         LIMIT 1`,
        [payment.id]
      );
      const fee = Number(feeResult.rows[0]?.metadata?.platform_fee || 0);
      if (fee > 0) platformFee = fee;
    } catch (feeError) {
      logger.warn('rent receipt fee lookup failed', { error: feeError.message });
    }

    // Only components that actually exist - never invent address parts.
    const propertyAddress = property
      ? String(property.full_address || '').trim() ||
        [property.area, property.city, property.lga_name, property.state_name]
          .filter(Boolean)
          .join(', ')
      : '';

    const rentalStart = formatPeriodDate(terms?.commencementDate);
    const rentalEnd = formatPeriodDate(terms?.expiryDate);

    return {
      paymentFor: rentPaymentFor(terms?.paymentFrequency || property?.payment_frequency),
      propertyTitle: property?.title || '',
      propertyAddress,
      tenantName: payer?.full_name || '',
      landlordName: property?.landlord_name || '',
      rentalPeriod: rentalStart ? { start: rentalStart, end: rentalEnd } : null,
      platformFee,
    };
  } catch (error) {
    logger.warn('rent receipt context failed', { error: error.message });
    return null;
  }
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

  // Diaspora registration payments carry the USD quote on the pending
  // registration record; surface it when the receipt is for a registration.
  let diasporaQuote = null;
  if (ctx.payment.transaction_reference) {
    try {
      const quoteResult = await db.query(
        `SELECT quote_amount_usd, fx_rate, fx_markup_pct, quote_currency
         FROM tenant_registration_payments
         WHERE transaction_reference = $1
         LIMIT 1`,
        [ctx.payment.transaction_reference]
      );
      if (quoteResult.rows.length && Number(quoteResult.rows[0].quote_amount_usd) > 0) {
        diasporaQuote = quoteResult.rows[0];
      }
    } catch (error) {
      // non-fatal: receipts still render without the quote block
    }
  }

  const rent = await loadRentContext(ctx.payment, user);

  return { ...ctx, user, diasporaQuote, rent };
};

const sendReceiptForPayment = async (paymentId) => {
  try {
    const ctx = await loadReceiptContext(paymentId);
    if (!ctx) return { success: false, error: 'Receipt context not found' };
    return await sendPaymentReceiptEmail(buildReceiptData(ctx));
  } catch (error) {
    logger.error('sendReceiptForPayment error', { error: error.message });
    return { success: false, error: error.message };
  }
};

// ── Payout receipts (admin / agent / tenant / landlord withdrawals) ─────────

// Payout receipt numbers identify the WITHDRAWAL transaction, never the
// recipient. Prefer the id passed by the caller; otherwise recover it from
// the persisted payout reference (ARH_SAW_37_..., legacy SAW_37_...,
// ARH_AGW_92_R1, ARH_WDR_REJ_57, ...). Every path is deterministic so
// re-delivering the same payout always yields the same receipt number.
const resolveWithdrawalId = (withdrawalId, reference, kinds = []) => {
  const explicit = Number.parseInt(withdrawalId, 10);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;

  const ref = String(reference || '');
  for (const kind of kinds) {
    const match = ref.match(new RegExp(`(?:^|_)(?:ARH_)?${kind}(?:_REJ)?_(\\d+)`));
    if (match) return Number.parseInt(match[1], 10);
  }
  const trailing = ref.match(/(\d+)(?:_R\d+)?$/);
  if (trailing) return Number.parseInt(trailing[1], 10);
  return 0;
};

const sendPayoutReceiptEmail = async ({
  email,
  fullName,
  payoutNumber,
  amount,
  bankName,
  accountNumber,
  accountName,
  reference,
  status,
  note = '',
  itemLines = [],
}) => {
  try {
    const date = formatNigerianDateTime(new Date());
    const statusLabel = humanizeStatus(status);
    const maskedAccount = maskAccountNumber(accountNumber);
    const bankLine =
      bankName || maskedAccount
        ? `<p style="margin:4px 0;"><strong>Bank:</strong> ${esc(bankName || '')}${maskedAccount ? ` ${esc(maskedAccount)}` : ''}</p>`
        : '';

    const linesHtml = (itemLines || [])
      .map(
        (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(item.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${esc(item.amount)}</td>
      </tr>`
      )
      .join('');

    await mailer.sendEmail({
      to: email,
      subject: `Payout Receipt ${payoutNumber} - Amana RentalHub NG`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6; max-width: 560px; margin: 0 auto;">
          <div style="text-align:center; padding-bottom:16px; border-bottom:2px solid #0284c7;">
            <div style="font-family:'Segoe Script','Brush Script MT',cursive; font-size:26px; color:#6e1b2b;">Amana</div>
            <h2 style="margin:0 0 2px; color:#0f172a;">Amana RentalHub NG</h2>
            <p style="margin:0; color:#64748b; font-size:12px;">rentalhub.com.ng &nbsp;•&nbsp; support@rentalhub.com.ng</p>
            <p style="margin:10px 0 0; color:#64748b;">OFFICIAL PAYOUT RECEIPT</p>
            <p style="margin:6px 0 0; font-weight:600; color:#0f172a;">${esc(payoutNumber)}</p>
          </div>
          <div style="padding:16px 0; font-size:14px; color:#334155;">
            <p style="margin:4px 0;"><strong>Recipient:</strong> ${esc(fullName || email)}</p>
            <p style="margin:4px 0;"><strong>Email:</strong> ${esc(email)}</p>
            <p style="margin:4px 0;"><strong>Date:</strong> ${esc(date)}</p>
            <p style="margin:4px 0;"><strong>Transfer Reference:</strong> ${esc(reference)}</p>
            <p style="margin:4px 0;"><strong>Status:</strong> ${esc(statusLabel)}</p>
            ${bankLine}
            ${accountName ? `<p style="margin:4px 0;"><strong>Account Name:</strong> ${esc(accountName)}</p>` : ''}
          </div>
          ${note ? `
          <div style="padding:12px 16px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; font-size:13px; color:#991b1b;">
            <strong>Note:</strong> ${esc(note)}
          </div>
          <div style="padding-top:12px;"></div>` : ''}
          ${linesHtml ? `
          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#334155;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px 12px; text-align:left;">Item</th>
                <th style="padding:8px 12px; text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>${linesHtml}</tbody>
            <tfoot>
              <tr>
                <td style="padding:10px 12px; font-weight:700; border-top:2px solid #e2e8f0;">Total Paid Out</td>
                <td style="padding:10px 12px; text-align:right; font-weight:700; border-top:2px solid #e2e8f0;">${esc(formatNgn(amount))}</td>
              </tr>
            </tfoot>
          </table>` : `
          <div style="padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:15px; color:#0f172a;">
            <strong>Total Paid Out:</strong> ${esc(formatNgn(amount))}
          </div>`}
          <p style="padding-top:16px; font-size:12px; color:#94a3b8; text-align:center;">
            Thank you for using Amana RentalHub NG. You can view this receipt from your Payment History.
          </p>
          <p style="font-size:10px; color:#cbd5e1; text-align:center; margin-top:4px;">
            ${esc(RECEIPT_NOTICE)}
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    logger.error('sendPayoutReceiptEmail error', { error: error.message });
    return { success: false, error: error.message };
  }
};

const sendAdminPayoutReceipt = async ({
  adminId,
  withdrawalId,
  amount,
  bankName,
  accountNumber,
  accountName,
  reference,
  status = 'processed',
  note = '',
  snapshot = null,
}) => {
  try {
    const user = (await db.query('SELECT email, full_name FROM users WHERE id = $1', [adminId])).rows[0];
    if (!user) return { success: false };

    // Prefer the exact snapshot captured at withdrawal request time.
    let commissions = snapshot;
    if (!commissions) {
      commissions = (
        await db.query(
          `SELECT source, amount, commission_rate, paid_at
           FROM admin_commissions
           WHERE admin_id = $1 AND status = 'paid' AND paid_at >= CURRENT_DATE - INTERVAL '3 days'
           ORDER BY paid_at DESC`
        )
      ).rows;
    }

    const itemLines = (commissions || []).map((c) => ({
      label: humanizePaymentType(c.source || 'commission'),
      amount: formatNgn(c.amount),
    }));
    return await sendPayoutReceiptEmail({
      email: user.email,
      fullName: user.full_name,
      payoutNumber: adminPayoutReceiptNumber(
        resolveWithdrawalId(withdrawalId, reference, ['SAW'])
      ),
      amount,
      bankName,
      accountNumber,
      accountName,
      reference,
      status,
      note,
      itemLines,
    });
  } catch (error) {
    logger.error('sendAdminPayoutReceipt error', { error: error.message });
    return { success: false, error: error.message };
  }
};

const sendAgentPayoutReceipt = async ({
  agentUserId,
  withdrawalId,
  amount,
  reference,
  status = 'processed',
  note = '',
}) => {
  try {
    const user = (await db.query('SELECT email, full_name FROM users WHERE id = $1', [agentUserId])).rows[0];
    if (!user) return { success: false };
    const items = (
      await db.query(
        `SELECT source, amount, paid_on
         FROM agent_commission_ledger
         WHERE agent_user_id = $1 AND payment_status = 'paid' AND paid_on >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY paid_on DESC`
      )
    ).rows;
    const itemLines = items.map((c) => ({
      label: humanizePaymentType(c.source || 'commission'),
      amount: formatNgn(c.amount),
    }));
    return await sendPayoutReceiptEmail({
      email: user.email,
      fullName: user.full_name,
      payoutNumber: agentPayoutReceiptNumber(
        resolveWithdrawalId(withdrawalId, reference, ['AGW', 'AG'])
      ),
      amount,
      bankName: '',
      accountNumber: '',
      accountName: '',
      reference,
      status,
      note,
      itemLines,
    });
  } catch (error) {
    logger.error('sendAgentPayoutReceipt error', { error: error.message });
    return { success: false, error: error.message };
  }
};

const sendUserPayoutReceipt = async ({
  userId,
  withdrawalId,
  amount,
  bankName,
  accountNumber,
  accountName,
  reference,
  status = 'processed',
  note = '',
}) => {
  try {
    const user = (await db.query('SELECT email, full_name FROM users WHERE id = $1', [userId])).rows[0];
    if (!user) return { success: false };
    return await sendPayoutReceiptEmail({
      email: user.email,
      fullName: user.full_name,
      payoutNumber: userPayoutReceiptNumber(
        resolveWithdrawalId(withdrawalId, reference, ['WLW', 'WDR'])
      ),
      amount,
      bankName,
      accountNumber,
      accountName,
      reference,
      status,
      note,
    });
  } catch (error) {
    logger.error('sendUserPayoutReceipt error', { error: error.message });
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
  humanizePaymentChannel,
  loadReceiptContext,
  resolveWithdrawalId,
  sendAdminPayoutReceipt,
  sendAgentPayoutReceipt,
  sendReceiptForPayment,
  sendUserPayoutReceipt,
};
