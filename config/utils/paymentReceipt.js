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

const buildReceiptData = ({ payment, group, user, ref, diasporaQuote }) => {
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
    // Diaspora registration quotes (USD + FX) surfaced on the receipt.
    quoteUsd: diasporaQuote?.quote_amount_usd ?? null,
    fxRate: diasporaQuote?.fx_rate ?? null,
    fxMarkupPct: diasporaQuote?.fx_markup_pct ?? null,
    quoteCurrency: diasporaQuote?.quote_currency ?? null,
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

  return { ...ctx, user, diasporaQuote };
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

// ── Payout receipts (admin / agent / tenant / landlord withdrawals) ─────────

const sendPayoutReceiptEmail = async ({
  email,
  fullName,
  payoutNumber,
  amount,
  bankName,
  accountNumber,
  accountName,
  reference,
  date,
  status,
  note = '',
  itemLines = [],
}) => {
  try {
    const linesHtml = (itemLines || [])
      .map(
        (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(item.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${esc(item.amount)}</td>
      </tr>`
      )
      .join('');

    await sendEmail({
      to: email,
      subject: `Payout Receipt ${payoutNumber} - RentalHub NG`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6; max-width: 560px; margin: 0 auto;">
          <div style="text-align:center; padding-bottom:16px; border-bottom:2px solid #0284c7;">
            <h2 style="margin:0; color:#0f172a;">RentalHub NG</h2>
            <p style="margin:4px 0 0; color:#64748b;">Official Payout Receipt</p>
            <p style="margin:6px 0 0; font-weight:600; color:#0f172a;">${esc(payoutNumber)}</p>
          </div>
          <div style="padding:16px 0; font-size:14px; color:#334155;">
            <p style="margin:4px 0;"><strong>Recipient:</strong> ${esc(fullName || email)}</p>
            <p style="margin:4px 0;"><strong>Date:</strong> ${esc(date)}</p>
            <p style="margin:4px 0;"><strong>Transfer Reference:</strong> ${esc(reference)}</p>
            <p style="margin:4px 0;"><strong>Status:</strong> ${esc(status)}</p>
            <p style="margin:4px 0;"><strong>Bank:</strong> ${esc(bankName || '')} ${esc(accountNumber || '')}</p>
            ${accountName ? `<p style="margin:4px 0;"><strong>Account:</strong> ${esc(accountName)}</p>` : ''}
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
            Thank you for using RentalHub NG.
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('sendPayoutReceiptEmail error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendAdminPayoutReceipt = async ({
  adminId,
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
      payoutNumber: `PAY-${String(adminId).padStart(6, '0')}`,
      amount,
      bankName,
      accountNumber,
      accountName,
      reference,
      date: new Date().toLocaleString('en-NG'),
      status,
      note,
      itemLines,
    });
  } catch (error) {
    console.error('sendAdminPayoutReceipt error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendAgentPayoutReceipt = async ({ agentUserId, amount, reference, status = 'processed', note = '' }) => {
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
      payoutNumber: `AG-PAY-${String(agentUserId).padStart(6, '0')}`,
      amount,
      bankName: '',
      accountNumber: '',
      accountName: '',
      reference,
      date: new Date().toLocaleString('en-NG'),
      status,
      note,
      itemLines,
    });
  } catch (error) {
    console.error('sendAgentPayoutReceipt error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendUserPayoutReceipt = async ({
  userId,
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
      payoutNumber: `WDR-${String(userId).padStart(6, '0')}`,
      amount,
      bankName,
      accountNumber,
      accountName,
      reference,
      date: new Date().toLocaleString('en-NG'),
      status,
      note,
    });
  } catch (error) {
    console.error('sendUserPayoutReceipt error:', error.message);
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
  sendAdminPayoutReceipt,
  sendAgentPayoutReceipt,
  sendReceiptForPayment,
  sendUserPayoutReceipt,
};
