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
  buildReference,
  paymentReceiptNumber,
  savingsReceiptNumber,
  userPayoutReceiptNumber,
  agentPayoutReceiptNumber,
  adminPayoutReceiptNumber,
  refundReceiptNumber,
  walletTransactionReceiptNumber,
  transportReceiptNumber,
  fumigationReceiptNumber,
  evidenceReceiptNumber,
} = require('./referenceGenerator');

const DOCUMENT_TYPES = Object.freeze({
  PAYMENT: 'OFFICIAL PAYMENT RECEIPT',
  RENT: 'OFFICIAL RENT PAYMENT RECEIPT',
  SERVICE: 'OFFICIAL SERVICE PAYMENT RECEIPT',
  WALLET_RECORD: 'OFFICIAL WALLET TRANSACTION RECORD',
  SAVINGS_CONTRIBUTION: 'RENT SAVINGS CONTRIBUTION RECEIPT',
  PAYOUT: 'OFFICIAL PAYOUT RECEIPT',
  REFUND: 'REFUND CONFIRMATION',
});

const PAYMENT_TYPE_LABELS = {
  tenant_subscription: 'Subscription',
  tenant_multiple_property_subscription: 'Multiple Property Subscription',
  landlord_subscription: 'Landlord Subscription',
  property_unlock: 'Property Unlock',
  landlord_listing: 'Listing Payment',
  rent_payment: 'Rent Payment',
  wallet_funding: 'Wallet Funding',
  registration: 'Registration Fee',
  registration_fee: 'Registration Fee',
  registration_foreign_card_adjustment: 'Diaspora Registration Card Adjustment',
  general_platform_fee: 'Platform Payment',
  lawyer_access_fee: 'Lawyer Access Fee',
  lawyer_directory_unlock: 'Lawyer Directory Access Fee',
  agent_access_fee: 'Agent Access Fee',
  property_inspection_fee: 'Property Inspection Fee',
  evidence_verification: 'Evidence Verification Fee',
  tenant_property_alert: 'Property Alert Subscription',
  tenant_location_access: 'Location Access Fee',
  transportation_booking: 'Transportation Booking',
  fumigation_cleaning_booking: 'Fumigation & Cleaning Service',
  property_protection: 'Property Protection Service',
  landlord_property_fee: 'Landlord Property Billing',
  rent_savings_setup_fee: 'Rent Savings Setup Fee',
  rent_calculator_fee: 'Rent Calculator Fee',
};

const SERVICE_PAYMENT_TYPES = new Set([
  'property_inspection_fee',
  'lawyer_access_fee',
  'lawyer_directory_unlock',
  'agent_access_fee',
  'transportation_booking',
  'fumigation_cleaning_booking',
  'property_protection',
]);

const COMPLETED_PAYMENT_STATUSES = new Set(['completed', 'success', 'successful', 'paid']);
const RECEIPT_ELIGIBLE_PAYMENT_STATUSES = new Set([
  'completed',
  'success',
  'successful',
  'paid',
  'refunded',
]);
const COMPLETED_PAYOUT_STATUSES = new Set(['processed', 'completed', 'success', 'paid']);
const FAILED_OR_REVERSED_PAYOUT_STATUSES = new Set(['failed', 'reversed', 'rejected', 'cancelled']);

const isCompletedPaymentStatus = (status) =>
  COMPLETED_PAYMENT_STATUSES.has(String(status || '').trim().toLowerCase());

const isReceiptEligiblePaymentStatus = (status) =>
  RECEIPT_ELIGIBLE_PAYMENT_STATUSES.has(String(status || '').trim().toLowerCase());

const isCompletedPayoutStatus = (status) =>
  COMPLETED_PAYOUT_STATUSES.has(String(status || '').trim().toLowerCase());

const isFailedOrReversedPayoutStatus = (status) =>
  FAILED_OR_REVERSED_PAYOUT_STATUSES.has(String(status || '').trim().toLowerCase());

const humanizePaymentType = (type) =>
  PAYMENT_TYPE_LABELS[type] ||
  String(type || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') ||
  'Payment';

const formatNgn = (amount) => `₦${Number(amount || 0).toLocaleString()}`;

const baseReference = (reference) =>
  String(reference || '').replace(/_(LAWYER|AGENT)_FEE$/, '');

const classifyPaymentDocumentType = (paymentType, { protectionRequest = null } = {}) => {
  if (paymentType === 'rent_payment') return DOCUMENT_TYPES.RENT;
  if (protectionRequest || SERVICE_PAYMENT_TYPES.has(paymentType)) {
    return DOCUMENT_TYPES.SERVICE;
  }
  return DOCUMENT_TYPES.PAYMENT;
};

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

const rentPaymentFor = (frequency) => {
  const key = String(frequency || '').toLowerCase();
  if (key === 'monthly') return 'Monthly Rent';
  if (key === 'quarterly') return 'Quarterly Rent';
  if (key === 'yearly' || key === 'annual' || key === 'annually') return 'Annual Rent';
  return 'Rent Payment';
};

const getPaymentGroup = async (paymentId) => {
  const paymentResult = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
  const payment = paymentResult.rows[0] || null;
  if (!payment) return null;

  const ref = baseReference(payment.transaction_reference);
  let group = [payment];
  if (ref) {
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

// Load detailed rent context for a rent_payment: property, address, tenant,
// landlord, authoritative tenancy period and actual platform fee recorded
// against this payment. Missing optional rows never break receipt generation.
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
      landlordId: property?.landlord_id || null,
      landlordName: property?.landlord_name || '',
      stateName: property?.state_name || null,
      lgaName: property?.lga_name || null,
      rentalPeriod: rentalStart ? { start: rentalStart, end: rentalEnd } : null,
      platformFee,
    };
  } catch (error) {
    logger.warn('rent receipt context failed', { error: error.message });
    return null;
  }
};

const loadPaymentGeoAndServiceContext = async (payment, user, rent) => {
  let stateName = rent?.stateName || user?.assigned_state || null;
  let lgaName = rent?.lgaName || user?.assigned_lga || user?.assigned_city || null;
  let propertyTitle = rent?.propertyTitle || '';
  let protectionRequest = null;

  if (!rent && payment.property_id) {
    try {
      const propRes = await db.query(
        `SELECT p.title, p.lga_name, s.state_name
         FROM properties p
         LEFT JOIN states s ON s.id = p.state_id
         WHERE p.id = $1 LIMIT 1`,
        [payment.property_id]
      );
      const prop = propRes.rows[0];
      if (prop) {
        propertyTitle = prop.title || '';
        stateName = prop.state_name || stateName;
        lgaName = prop.lga_name || lgaName;
      }
    } catch {
      // Optional enrichment
    }
  }

  if (payment.payment_type === 'general_platform_fee') {
    try {
      const protRes = await db.query(
        `SELECT r.id, r.service_code, r.property_id, r.amount, r.status,
                pp.title AS protection_property_title, pp.state_name AS protection_state
         FROM protection_service_requests r
         LEFT JOIN protection_properties pp ON pp.id = r.property_id
         WHERE r.payment_id = $1
         LIMIT 1`,
        [payment.id]
      );
      if (protRes.rows.length) {
        protectionRequest = protRes.rows[0];
        if (!stateName && protectionRequest.protection_state) {
          stateName = protectionRequest.protection_state;
        }
      }
    } catch {
      // protection_service_requests may not exist in minimal test schemas
    }
  }

  return {
    geo: { stateName, lgaName },
    propertyTitle,
    protectionRequest,
  };
};

const buildReceiptData = (
  { payment, group, user, ref, diasporaQuote, rent, propertyTitle, protectionRequest },
  options = {}
) => {
  const viewerPerspective = options.viewerPerspective || 'payer';
  const isRent = payment.payment_type === 'rent_payment';
  const isPaid = isCompletedPaymentStatus(payment.payment_status);
  const statusUpper = receiptStatus(payment.payment_status);
  const totalAmount = (group || [payment]).reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const items = (group || [payment]).map((p) => {
    let label = humanizePaymentType(p.payment_type);
    if (isRent && p.payment_type === 'rent_payment') {
      label = 'Rent Amount';
    } else if (protectionRequest && p.id === payment.id) {
      label = `Property Protection (${humanizePaymentType(protectionRequest.service_code)})`;
    }
    return {
      label,
      amount: formatNgn(p.amount),
    };
  });

  const documentType = classifyPaymentDocumentType(payment.payment_type, { protectionRequest });
  const isLandlordView = viewerPerspective === 'landlord' && isRent;

  const contextRows = [];
  if (!isRent && propertyTitle) {
    contextRows.push({ label: 'Property', value: propertyTitle });
  }
  if (protectionRequest) {
    contextRows.push({
      label: 'Protection Service',
      value: humanizePaymentType(protectionRequest.service_code),
    });
    if (protectionRequest.protection_property_title) {
      contextRows.push({
        label: 'Protected Property',
        value: protectionRequest.protection_property_title,
      });
    }
  }

  // Distinguish landlord rent-received record without exposing unrelated private tenant email
  const exposedEmail = isLandlordView ? '' : user.email || '';
  const subtitle = isLandlordView ? 'Landlord Rent Received Confirmation Record' : null;
  const recipientName = isRent && rent?.landlordName ? rent.landlordName : 'Amana RentalHub NG';

  const platformFee = Number(rent?.platformFee || 0);
  const netLandlordAmount = isRent ? Math.max(0, totalAmount - platformFee) : null;

  return {
    documentKind: 'payment',
    viewerPerspective,
    email: exposedEmail,
    fullName: user.full_name || '',
    recipientName,
    receiptNumber: paymentReceiptNumber(payment.id),
    reference: ref || payment.transaction_reference || '',
    date: formatNigerianDateTime(payment.completed_at || payment.created_at),
    items,
    total: formatNgn(totalAmount),
    totalAmount,
    totalLabel: isLandlordView
      ? 'GROSS RENT RECEIVED'
      : isPaid
        ? 'TOTAL PAID'
        : statusUpper === 'REFUNDED'
          ? 'ORIGINAL AMOUNT (REFUNDED)'
          : 'AMOUNT',
    isPaid,
    status: statusUpper,
    rawStatus: payment.payment_status,
    method: humanizePaymentMethod(payment.payment_method),
    channel: humanizePaymentChannel(payment.payment_channel),
    methodLine: paymentMethodLine(payment.payment_method, payment.payment_channel),
    currency: payment.currency || 'NGN',
    documentType,
    subtitle,
    paymentType: payment.payment_type,
    paymentId: payment.id,
    rent: rent
      ? {
          paymentFor: rent.paymentFor,
          propertyTitle: rent.propertyTitle,
          propertyAddress: rent.propertyAddress,
          tenantName: rent.tenantName,
          landlordName: rent.landlordName,
          rentalPeriod: rent.rentalPeriod,
          platformFee: rent.platformFee,
          netLandlordAmount,
        }
      : null,
    contextRows,
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
    'SELECT id, email, full_name, user_type, assigned_state, assigned_lga, assigned_city FROM users WHERE id = $1',
    [ctx.payment.user_id]
  );
  const user = userResult.rows[0] || null;
  if (!user) return null;

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
    } catch {
      // non-fatal
    }
  }

  const rent = await loadRentContext(ctx.payment, user);
  const { geo, propertyTitle, protectionRequest } = await loadPaymentGeoAndServiceContext(
    ctx.payment,
    user,
    rent
  );
  return { ...ctx, user, diasporaQuote, rent, geo, propertyTitle, protectionRequest };
};

// ── Rent Savings Contribution Receipt ───────────────────────────────────────

const loadSavingsContributionContext = async (contributionId) => {
  const result = await db.query(
    `SELECT c.*, p.monthly_savings_amount, p.target_savings_amount, p.property_id,
            u.full_name, u.email, u.assigned_state, u.assigned_lga
     FROM rent_savings_contributions c
     JOIN rent_savings_plans p ON p.id = c.plan_id
     LEFT JOIN users u ON u.id = c.tenant_id
     WHERE c.id = $1`,
    [contributionId]
  );
  const contribution = result.rows[0] || null;
  if (!contribution) return null;
  return {
    contribution,
    geo: { stateName: contribution.assigned_state || null, lgaName: contribution.assigned_lga || null },
  };
};

const buildSavingsContributionReceiptData = ({ contribution }) => {
  const amount = Number(contribution.amount || 0);
  const fee = Number(contribution.commission_1pct || 0);
  const net = Number(contribution.net_saved || 0);
  const receiptNumber = savingsReceiptNumber(contribution.id);
  const reference = contribution.payment_reference || buildReference('RSC', contribution.plan_id, contribution.id);

  return {
    documentKind: 'savings',
    documentType: DOCUMENT_TYPES.SAVINGS_CONTRIBUTION,
    receiptNumber,
    reference,
    fullName: contribution.full_name || '',
    email: contribution.email || '',
    recipientName: 'Amana Rent Savings Plan',
    partyLabel: 'Saver',
    date: formatNigerianDateTime(contribution.contributed_at || contribution.created_at),
    status: 'SAVED',
    rawStatus: 'completed',
    isPaid: true,
    method: 'Wallet Balance',
    channel: '',
    methodLine: 'Wallet Balance',
    currency: 'NGN',
    items: [
      { label: 'Rent Savings Contribution', amount: formatNgn(amount) },
      { label: 'Platform Service Fee (1%)', amount: formatNgn(fee) },
      { label: 'Net Amount Saved', amount: formatNgn(net) },
    ],
    contextRows: [
      { label: 'Savings Plan', value: `#${contribution.plan_id}` },
      { label: 'Savings Month', value: contribution.saved_for_month || '' },
    ].filter((row) => row.value),
    total: formatNgn(net),
    totalAmount: net,
    totalLabel: 'AMOUNT SAVED',
    contributionId: contribution.id,
  };
};

// ── Wallet Transaction Record (Internal Ledger Movement) ────────────────────

const loadWalletTransactionContext = async (walletTxId) => {
  const result = await db.query(
    `SELECT wt.*, u.full_name, u.email, u.assigned_state, u.assigned_lga,
            p.transaction_reference AS linked_payment_reference
     FROM wallet_transactions wt
     LEFT JOIN users u ON u.id = wt.user_id
     LEFT JOIN payments p ON p.id = wt.payment_id
     WHERE wt.id = $1`,
    [walletTxId]
  );
  const transaction = result.rows[0] || null;
  if (!transaction) return null;
  return {
    transaction,
    geo: { stateName: transaction.assigned_state || null, lgaName: transaction.assigned_lga || null },
  };
};

const buildWalletTransactionReceiptData = ({ transaction }) => {
  const amount = Number(transaction.amount || 0);
  const isCredit = String(transaction.type || '').toLowerCase() === 'credit';
  const statusLabel = humanizeStatus(transaction.status || 'completed').toUpperCase();
  const receiptNumber = walletTransactionReceiptNumber(transaction.id);
  const reference =
    transaction.reference ||
    transaction.linked_payment_reference ||
    buildReference('WTX', transaction.id);

  const items = [
    {
      label: transaction.description || `${humanizePaymentType(transaction.source)} (${isCredit ? 'Credit' : 'Debit'})`,
      amount: `${isCredit ? '+' : '-'}${formatNgn(amount)}`,
    },
  ];
  const platformFee = Number(transaction.metadata?.platform_fee || 0);
  if (platformFee > 0) {
    items.push({ label: 'Recorded Platform Fee', amount: formatNgn(platformFee) });
  }

  return {
    documentKind: 'wallet-transaction',
    documentType: DOCUMENT_TYPES.WALLET_RECORD,
    subtitle: 'Internal Wallet Ledger Statement — Not an External Payment Receipt',
    receiptNumber,
    reference,
    fullName: transaction.full_name || '',
    email: transaction.email || '',
    partyLabel: 'Account Holder',
    date: formatNigerianDateTime(transaction.created_at),
    status: statusLabel,
    rawStatus: transaction.status || 'completed',
    isPaid: false,
    method: 'Amana Wallet',
    channel: isCredit ? 'Wallet Credit' : 'Wallet Debit',
    methodLine: `Amana Wallet — ${isCredit ? 'Credit' : 'Debit'}`,
    currency: 'NGN',
    contextRows: [
      { label: 'Movement Type', value: isCredit ? 'Credit' : 'Debit' },
      { label: 'Source', value: humanizePaymentType(transaction.source || 'wallet') },
      transaction.payment_id
        ? { label: 'Related Receipt', value: paymentReceiptNumber(transaction.payment_id) }
        : null,
      transaction.available_at
        ? { label: 'Available Date', value: formatNigerianDateTime(transaction.available_at) }
        : null,
    ].filter(Boolean),
    items,
    total: `${isCredit ? '+' : '-'}${formatNgn(amount)}`,
    totalAmount: amount,
    totalLabel: isCredit ? 'AMOUNT CREDITED' : 'AMOUNT DEBITED',
    walletTransactionId: transaction.id,
  };
};

// ── Payout Receipts (User Wallet / Agent / Admin Withdrawals) ───────────────

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

const loadUserPayoutContext = async (withdrawalId) => {
  const res = await db.query(
    `SELECT w.*, u.full_name, u.email, u.assigned_state, u.assigned_lga
     FROM withdrawal_requests w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.id = $1`,
    [withdrawalId]
  );
  const withdrawal = res.rows[0] || null;
  if (!withdrawal) return null;
  return {
    withdrawal,
    geo: { stateName: withdrawal.assigned_state || null, lgaName: withdrawal.assigned_lga || null },
  };
};

const buildUserPayoutReceiptData = ({ withdrawal }) => {
  const rawStatus =
    withdrawal.paystack_transfer_status === 'reversed'
      ? 'reversed'
      : withdrawal.paystack_transfer_status === 'failed'
        ? 'failed'
        : withdrawal.status;
  const completed = isCompletedPayoutStatus(rawStatus);
  const failedOrReversed = isFailedOrReversedPayoutStatus(rawStatus);
  const amount = Number(withdrawal.amount || 0);
  const maturityCommission = Number(withdrawal.maturity_commission || 0);
  const receiptNumber = userPayoutReceiptNumber(withdrawal.id);
  const reference =
    withdrawal.paystack_transfer_reference ||
    buildReference('WLW', withdrawal.id);

  const items = [
    {
      label:
        withdrawal.withdrawal_type === 'rent_savings_maturity'
          ? 'Rent Savings Maturity Withdrawal'
          : 'Wallet Withdrawal Payout',
      amount: formatNgn(amount),
    },
  ];
  if (maturityCommission > 0) {
    items.push({ label: 'Maturity Commission (2%)', amount: formatNgn(maturityCommission) });
  }

  return {
    documentKind: 'user-payout',
    documentType: DOCUMENT_TYPES.PAYOUT,
    subtitle: failedOrReversed ? `Payout ${humanizeStatus(rawStatus)} Record` : null,
    receiptNumber,
    reference,
    fullName: withdrawal.full_name || '',
    email: withdrawal.email || '',
    partyLabel: 'Recipient',
    date: formatNigerianDateTime(withdrawal.processed_at || withdrawal.updated_at || withdrawal.created_at),
    status: humanizeStatus(rawStatus).toUpperCase(),
    rawStatus,
    isPaid: completed,
    method: 'Bank Transfer',
    channel: withdrawal.paystack_transfer_reference ? 'Paystack Transfer' : 'Platform Payout',
    methodLine: withdrawal.paystack_transfer_reference
      ? 'Bank Transfer — Paystack'
      : 'Bank Transfer',
    currency: 'NGN',
    payout: {
      withdrawalId: withdrawal.id,
      transferReference: reference,
      bankName: withdrawal.bank_name || '',
      maskedAccountNumber: maskAccountNumber(withdrawal.account_number),
      accountName: withdrawal.account_name || '',
      payoutDate: withdrawal.processed_at ? formatNigerianDateTime(withdrawal.processed_at) : null,
    },
    noticeBanner: failedOrReversed
      ? `${withdrawal.payout_failed_reason || 'Transfer could not be completed.'} Funds have been returned to your wallet.`
      : null,
    items,
    total: formatNgn(amount),
    totalAmount: amount,
    totalLabel: completed ? 'TOTAL PAID OUT' : 'WITHDRAWAL AMOUNT',
    withdrawalId: withdrawal.id,
  };
};

const loadAgentPayoutContext = async (withdrawalId) => {
  const res = await db.query(
    `SELECT aw.*, u.full_name, u.email, u.assigned_state, u.assigned_lga
     FROM agent_withdrawal_requests aw
     LEFT JOIN users u ON u.id = aw.agent_user_id
     WHERE aw.id = $1`,
    [withdrawalId]
  );
  const withdrawal = res.rows[0] || null;
  if (!withdrawal) return null;

  let bankDetails = {};
  if (withdrawal.bank_details && typeof withdrawal.bank_details === 'object') {
    bankDetails = withdrawal.bank_details;
  } else if (typeof withdrawal.bank_details === 'string') {
    try {
      bankDetails = JSON.parse(withdrawal.bank_details);
    } catch {
      bankDetails = {};
    }
  }

  let commissions = [];
  try {
    const commRes = await db.query(
      `SELECT source, amount, paid_on
       FROM agent_commission_ledger
       WHERE agent_user_id = $1 AND payment_status = 'paid'
       ORDER BY paid_on DESC NULLS LAST, id DESC
       LIMIT 20`,
      [withdrawal.agent_user_id]
    );
    commissions = commRes.rows || [];
  } catch {
    commissions = [];
  }

  return {
    withdrawal,
    bankDetails,
    commissions,
    geo: { stateName: withdrawal.assigned_state || null, lgaName: withdrawal.assigned_lga || null },
  };
};

const buildAgentPayoutReceiptData = ({ withdrawal, bankDetails = {}, commissions = [] }) => {
  const rawStatus =
    withdrawal.paystack_transfer_status === 'reversed'
      ? 'reversed'
      : withdrawal.paystack_transfer_status === 'failed'
        ? 'failed'
        : withdrawal.status;
  const completed = isCompletedPayoutStatus(rawStatus);
  const failedOrReversed = isFailedOrReversedPayoutStatus(rawStatus);
  const amount = Number(withdrawal.amount || 0);
  const receiptNumber = agentPayoutReceiptNumber(withdrawal.id);
  const reference =
    withdrawal.paystack_transfer_reference ||
    withdrawal.payment_reference ||
    buildReference('AGW', withdrawal.id);

  const items = commissions.length
    ? commissions.map((c) => ({
        label: humanizePaymentType(c.source || 'agent_commission'),
        amount: formatNgn(c.amount),
      }))
    : [{ label: 'Agent Commission Payout', amount: formatNgn(amount) }];

  const bankName = withdrawal.bank_name || bankDetails.bank_name || bankDetails.bankName || '';
  const accountNumber =
    withdrawal.account_number || bankDetails.account_number || bankDetails.accountNumber || '';
  const accountName =
    withdrawal.account_name || bankDetails.account_name || bankDetails.accountName || '';

  return {
    documentKind: 'agent-payout',
    documentType: DOCUMENT_TYPES.PAYOUT,
    subtitle: failedOrReversed
      ? `Agent Payout ${humanizeStatus(rawStatus)} Record`
      : 'Agent Commission Payout Advice',
    receiptNumber,
    reference,
    fullName: withdrawal.full_name || '',
    email: withdrawal.email || '',
    partyLabel: 'Agent Recipient',
    date: formatNigerianDateTime(
      withdrawal.completed_date || withdrawal.updated_at || withdrawal.created_at
    ),
    status: humanizeStatus(rawStatus).toUpperCase(),
    rawStatus,
    isPaid: completed,
    method: 'Bank Transfer',
    channel: withdrawal.withdrawal_method === 'bank_transfer' ? 'Paystack Transfer' : humanizePaymentMethod(withdrawal.withdrawal_method || 'bank_transfer'),
    methodLine: 'Bank Transfer — Agent Payout',
    currency: 'NGN',
    payout: {
      withdrawalId: withdrawal.id,
      transferReference: reference,
      bankName,
      maskedAccountNumber: maskAccountNumber(accountNumber),
      accountName,
      payoutDate: withdrawal.completed_date
        ? formatNigerianDateTime(withdrawal.completed_date)
        : null,
    },
    noticeBanner: failedOrReversed
      ? `${withdrawal.rejection_reason || withdrawal.payout_failed_reason || 'Transfer could not be completed.'} Amount returned to agent earnings.`
      : null,
    items,
    total: formatNgn(amount),
    totalAmount: amount,
    totalLabel: completed ? 'TOTAL PAID OUT' : 'WITHDRAWAL AMOUNT',
    withdrawalId: withdrawal.id,
  };
};

const loadAdminPayoutContext = async (withdrawalId) => {
  const res = await db.query(
    `SELECT aw.*, u.full_name, u.email, u.user_type, u.assigned_state, u.assigned_lga
     FROM admin_withdrawals aw
     LEFT JOIN users u ON u.id = aw.admin_id
     WHERE aw.id = $1`,
    [withdrawalId]
  );
  const withdrawal = res.rows[0] || null;
  if (!withdrawal) return null;
  return {
    withdrawal,
    geo: { stateName: withdrawal.assigned_state || null, lgaName: withdrawal.assigned_lga || null },
  };
};

const buildAdminPayoutReceiptData = ({ withdrawal }) => {
  const rawStatus =
    withdrawal.paystack_transfer_status === 'reversed'
      ? 'reversed'
      : withdrawal.paystack_transfer_status === 'failed'
        ? 'failed'
        : withdrawal.status;
  const completed = isCompletedPayoutStatus(rawStatus);
  const failedOrReversed = isFailedOrReversedPayoutStatus(rawStatus);
  const amount = Number(withdrawal.amount || 0);
  const receiptNumber = adminPayoutReceiptNumber(withdrawal.id);
  const reference =
    withdrawal.paystack_transfer_reference ||
    buildReference('SAW', withdrawal.id);

  let snapshot = [];
  if (Array.isArray(withdrawal.commissions_snapshot)) {
    snapshot = withdrawal.commissions_snapshot;
  } else if (typeof withdrawal.commissions_snapshot === 'string') {
    try {
      const parsed = JSON.parse(withdrawal.commissions_snapshot);
      if (Array.isArray(parsed)) snapshot = parsed;
    } catch {
      snapshot = [];
    }
  }

  const items = snapshot.length
    ? snapshot.map((c) => ({
        label: humanizePaymentType(c.source || 'admin_commission'),
        amount: formatNgn(c.amount),
      }))
    : [{ label: 'Administrator Commission Payout', amount: formatNgn(amount) }];

  return {
    documentKind: 'admin-payout',
    documentType: DOCUMENT_TYPES.PAYOUT,
    subtitle: failedOrReversed
      ? `Administrator Payout ${humanizeStatus(rawStatus)} Record`
      : 'Administrator Commission Payout',
    receiptNumber,
    reference,
    fullName: withdrawal.full_name || '',
    email: withdrawal.email || '',
    partyLabel: 'Administrator Recipient',
    date: formatNigerianDateTime(
      withdrawal.processed_at || withdrawal.updated_at || withdrawal.created_at
    ),
    status: humanizeStatus(rawStatus).toUpperCase(),
    rawStatus,
    isPaid: completed,
    method: 'Bank Transfer',
    channel: 'Paystack Transfer',
    methodLine: 'Bank Transfer — Commission Payout',
    currency: 'NGN',
    payout: {
      withdrawalId: withdrawal.id,
      transferReference: reference,
      bankName: withdrawal.bank_name || '',
      maskedAccountNumber: maskAccountNumber(withdrawal.account_number),
      accountName: withdrawal.account_name || '',
      payoutDate: withdrawal.processed_at
        ? formatNigerianDateTime(withdrawal.processed_at)
        : null,
    },
    noticeBanner: failedOrReversed
      ? `${withdrawal.payout_failed_reason || 'Transfer could not be completed.'} Commission balance restored.`
      : null,
    items,
    total: formatNgn(amount),
    totalAmount: amount,
    totalLabel: completed ? 'TOTAL PAID OUT' : 'WITHDRAWAL AMOUNT',
    withdrawalId: withdrawal.id,
  };
};

// ── Refund Confirmation Document ────────────────────────────────────────────

const loadRefundContext = async (refundId) => {
  const res = await db.query(
    `SELECT rr.*,
            p.amount AS original_amount,
            p.transaction_reference AS original_reference,
            p.currency AS original_currency,
            p.payment_method AS original_payment_method,
            tu.full_name AS tenant_name,
            tu.email AS tenant_email,
            lu.full_name AS landlord_name,
            prop.title AS property_title,
            prop.lga_name AS property_lga,
            s.state_name AS property_state
     FROM refund_requests rr
     LEFT JOIN payments p ON p.id = rr.payment_id
     LEFT JOIN users tu ON tu.id = rr.tenant_id
     LEFT JOIN users lu ON lu.id = rr.landlord_id
     LEFT JOIN properties prop ON prop.id = rr.property_id
     LEFT JOIN states s ON s.id = prop.state_id
     WHERE rr.id = $1`,
    [refundId]
  );
  const refund = res.rows[0] || null;
  if (!refund) return null;
  return {
    refund,
    geo: { stateName: refund.property_state || null, lgaName: refund.property_lga || null },
  };
};

const buildRefundReceiptData = ({ refund }, options = {}) => {
  const viewerPerspective = options.viewerPerspective || 'tenant';
  const originalAmount = Number(refund.original_amount ?? refund.amount ?? 0);
  const refundedAmount = Number(
    refund.approved_amount ?? refund.requested_refund_amount ?? refund.amount ?? 0
  );
  const remainingAmount = Math.max(0, originalAmount - refundedAmount);
  const receiptNumber = refundReceiptNumber(refund.id);
  const originalReceiptNumber = refund.payment_id ? paymentReceiptNumber(refund.payment_id) : '';
  const refundReference =
    refund.paystack_refund_reference ||
    buildReference('REFUND', refund.id, refund.payment_id || 0);

  const refundTypeLabel =
    refund.refund_type === 'partial_months'
      ? `Partial Refund (${refund.refund_months || ''} Months)`.trim()
      : refund.refund_type === 'partial_custom'
        ? 'Partial Refund'
        : 'Full Refund';

  const rawStatus = String(refund.status || 'pending').toLowerCase();
  const statusDisplay =
    rawStatus === 'refunded'
      ? 'REFUNDED'
      : rawStatus === 'approved'
        ? 'APPROVED (WALLET CREDITED)'
        : humanizeStatus(rawStatus).toUpperCase();

  const items = [
    { label: 'Original Payment Amount', amount: formatNgn(originalAmount) },
    { label: `${refundTypeLabel} Amount`, amount: formatNgn(refundedAmount) },
  ];
  if (remainingAmount > 0) {
    items.push({ label: 'Remaining Non-Refunded Amount', amount: formatNgn(remainingAmount) });
  }

  return {
    documentKind: 'refund',
    viewerPerspective,
    documentType: DOCUMENT_TYPES.REFUND,
    subtitle: 'Official Refund Record — Not a New Payment Receipt',
    receiptNumber,
    reference: refundReference,
    fullName: refund.tenant_name || '',
    email: viewerPerspective === 'landlord' ? '' : refund.tenant_email || '',
    recipientName: refund.tenant_name || '',
    partyLabel: 'Refund Recipient',
    date: formatNigerianDateTime(
      refund.refunded_at || refund.reviewed_at || refund.updated_at || refund.created_at
    ),
    status: statusDisplay,
    rawStatus,
    isPaid: false,
    method: rawStatus === 'refunded' ? 'Paystack / Wallet Refund' : 'Wallet Credit',
    channel: '',
    methodLine: rawStatus === 'refunded' ? 'Paystack / Wallet Refund' : 'Amana Wallet Credit',
    currency: refund.original_currency || 'NGN',
    refund: {
      refundId: refund.id,
      originalPaymentId: refund.payment_id || null,
      originalReceiptNumber,
      originalReference: refund.original_reference || '',
      refundReference,
      refundType: refund.refund_type || 'full',
      refundTypeLabel,
      originalAmount,
      originalAmountFormatted: formatNgn(originalAmount),
      refundedAmount,
      refundedAmountFormatted: formatNgn(refundedAmount),
      remainingAmount,
      remainingAmountFormatted: formatNgn(remainingAmount),
      propertyTitle: refund.property_title || '',
      landlordName: refund.landlord_name || '',
      reason: refund.reason || '',
    },
    items,
    total: formatNgn(refundedAmount),
    totalAmount: refundedAmount,
    totalLabel: 'AMOUNT REFUNDED',
    refundId: refund.id,
  };
};

// ── Transportation & Fumigation Service Receipts ────────────────────────────

const loadTransportationReceiptContext = async (bookingId) => {
  const res = await db.query(
    `SELECT tb.*,
            ts.service_name, ts.provider_name, ts.vehicle_type,
            u.full_name AS tenant_name, u.email AS tenant_email,
            p.title AS property_title, p.lga_name AS property_lga, s.state_name AS property_state
     FROM transportation_bookings tb
     LEFT JOIN transportation_services ts ON ts.id = tb.service_id
     LEFT JOIN users u ON u.id = tb.tenant_id
     LEFT JOIN properties p ON p.id = tb.property_id
     LEFT JOIN states s ON s.id = p.state_id
     WHERE tb.id = $1`,
    [bookingId]
  );
  const booking = res.rows[0] || null;
  if (!booking) return null;
  return {
    booking,
    geo: { stateName: booking.property_state || null, lgaName: booking.property_lga || null },
  };
};

const buildTransportationReceiptData = ({ booking }, options = {}) => {
  const viewerPerspective = options.viewerPerspective || 'payer';
  const amount = Number(booking.total_price || 0);
  const isPaid = isCompletedPaymentStatus(booking.payment_status);
  const statusUpper = receiptStatus(booking.payment_status);
  const receiptNumber = transportReceiptNumber(booking.id);
  const reference = booking.payment_id ? String(booking.payment_id) : booking.booking_reference || buildReference('TRANSPORT', booking.id);

  const items = [
    {
      label: booking.service_name || 'Property Relocation / Transportation Service',
      amount: formatNgn(amount),
    },
  ];

  const contextRows = [
    { label: 'Booking Reference', value: booking.booking_reference || `#${booking.id}` },
    { label: 'Service', value: booking.service_name || 'Transportation' },
    booking.provider_name ? { label: 'Service Provider', value: booking.provider_name } : null,
    booking.driver_name ? { label: 'Assigned Driver', value: booking.driver_name } : null,
    booking.pickup_address ? { label: 'Pickup Address', value: booking.pickup_address } : null,
    booking.dropoff_address ? { label: 'Dropoff Address', value: booking.dropoff_address } : null,
    booking.move_date ? { label: 'Scheduled Move Date', value: formatPeriodDate(booking.move_date) } : null,
    booking.property_title ? { label: 'Property', value: booking.property_title } : null,
  ].filter(Boolean);

  return {
    documentKind: 'transportation',
    viewerPerspective,
    documentType: DOCUMENT_TYPES.SERVICE,
    subtitle:
      viewerPerspective === 'provider'
        ? 'Transportation Booking Payment Confirmation'
        : null,
    receiptNumber,
    reference,
    fullName: booking.tenant_name || '',
    email: viewerPerspective === 'provider' ? '' : booking.tenant_email || '',
    recipientName: booking.provider_name || 'Amana RentalHub NG',
    date: formatNigerianDateTime(booking.updated_at || booking.created_at),
    status: statusUpper,
    rawStatus: booking.payment_status,
    isPaid,
    method: 'Paystack',
    channel: '',
    methodLine: 'Paystack',
    currency: 'NGN',
    paymentType: 'transportation_booking',
    contextRows,
    items,
    total: formatNgn(amount),
    totalAmount: amount,
    totalLabel: isPaid ? 'TOTAL PAID' : 'BOOKING AMOUNT',
    bookingId: booking.id,
  };
};

const loadFumigationReceiptContext = async (bookingId) => {
  const res = await db.query(
    `SELECT fcb.*,
            fcs.service_name, fcc.category_name,
            fp.payment_reference AS fp_reference,
            fp.payment_method AS fp_method,
            fp.amount AS fp_amount,
            fp.payment_status AS fp_status,
            fp.updated_at AS fp_paid_at,
            u.full_name AS tenant_name, u.email AS tenant_email,
            p.title AS property_title, p.lga_name AS property_lga, s.state_name AS property_state,
            sp.company_name AS provider_company, sp.user_id AS provider_user_id
     FROM fumigation_cleaning_bookings fcb
     LEFT JOIN fumigation_cleaning_services fcs ON fcs.id = fcb.service_id
     LEFT JOIN fumigation_cleaning_categories fcc ON fcc.id = fcs.category_id
     LEFT JOIN LATERAL (
       SELECT payment_reference, payment_method, amount, payment_status, updated_at
       FROM fumigation_payments
       WHERE booking_id = fcb.id
       ORDER BY id DESC
       LIMIT 1
     ) fp ON true
     LEFT JOIN LATERAL (
       SELECT provider_id FROM booking_provider_assignments
       WHERE booking_id = fcb.id
       ORDER BY id DESC
       LIMIT 1
     ) bpa ON true
     LEFT JOIN service_providers sp ON sp.id = bpa.provider_id
     LEFT JOIN users u ON u.id = fcb.tenant_id
     LEFT JOIN properties p ON p.id = fcb.property_id
     LEFT JOIN states s ON s.id = p.state_id
     WHERE fcb.id = $1`,
    [bookingId]
  );
  const booking = res.rows[0] || null;
  if (!booking) return null;
  return {
    booking,
    geo: { stateName: booking.property_state || null, lgaName: booking.property_lga || null },
  };
};

const buildFumigationReceiptData = ({ booking }, options = {}) => {
  const viewerPerspective = options.viewerPerspective || 'payer';
  const amount = Number(booking.fp_amount ?? booking.total_price ?? 0);
  const effectiveStatus = booking.payment_status || booking.fp_status || 'pending';
  const isPaid = isCompletedPaymentStatus(effectiveStatus);
  const statusUpper = receiptStatus(effectiveStatus);
  const receiptNumber = fumigationReceiptNumber(booking.id);
  const reference =
    booking.payment_reference ||
    booking.fp_reference ||
    booking.booking_reference ||
    buildReference('FC', booking.id);

  const items = [
    {
      label: booking.service_name || 'Fumigation & Cleaning Service',
      amount: formatNgn(amount),
    },
  ];

  const contextRows = [
    { label: 'Booking Reference', value: booking.booking_reference || `#${booking.id}` },
    { label: 'Service', value: booking.service_name || 'Fumigation & Cleaning' },
    booking.category_name ? { label: 'Category', value: booking.category_name } : null,
    booking.provider_company ? { label: 'Service Provider', value: booking.provider_company } : null,
    booking.property_title ? { label: 'Property', value: booking.property_title } : null,
    booking.preferred_date ? { label: 'Scheduled Date', value: formatPeriodDate(booking.preferred_date) } : null,
  ].filter(Boolean);

  return {
    documentKind: 'fumigation',
    viewerPerspective,
    documentType: DOCUMENT_TYPES.SERVICE,
    subtitle:
      viewerPerspective === 'provider'
        ? 'Service Booking Payment Confirmation'
        : null,
    receiptNumber,
    reference,
    fullName: booking.tenant_name || '',
    email: viewerPerspective === 'provider' ? '' : booking.tenant_email || '',
    recipientName: booking.provider_company || 'Amana RentalHub NG',
    date: formatNigerianDateTime(booking.fp_paid_at || booking.updated_at || booking.created_at),
    status: statusUpper,
    rawStatus: effectiveStatus,
    isPaid,
    method: humanizePaymentMethod(booking.fp_method || 'paystack'),
    channel: '',
    methodLine: humanizePaymentMethod(booking.fp_method || 'paystack'),
    currency: 'NGN',
    paymentType: 'fumigation_cleaning_booking',
    contextRows,
    items,
    total: formatNgn(amount),
    totalAmount: amount,
    totalLabel: isPaid ? 'TOTAL PAID' : 'BOOKING AMOUNT',
    bookingId: booking.id,
  };
};

// ── Evidence Verification Payment Receipt ───────────────────────────────────

const loadEvidenceReceiptContext = async (evidencePaymentId) => {
  const res = await db.query(
    'SELECT * FROM evidence_verification_payments WHERE id = $1',
    [evidencePaymentId]
  );
  const evidencePayment = res.rows[0] || null;
  if (!evidencePayment) return null;
  return { evidencePayment };
};

const buildEvidenceReceiptData = ({ evidencePayment }) => {
  const amount = Number(evidencePayment.amount || 0);
  const isPaid = isCompletedPaymentStatus(evidencePayment.payment_status);
  const statusUpper = receiptStatus(evidencePayment.payment_status);
  const receiptNumber = evidenceReceiptNumber(evidencePayment.id);

  return {
    documentKind: 'evidence',
    documentType: DOCUMENT_TYPES.PAYMENT,
    receiptNumber,
    reference: evidencePayment.transaction_reference || '',
    fullName: evidencePayment.payer_name || evidencePayment.payer_email || '',
    email: evidencePayment.payer_email || '',
    recipientName: 'Amana RentalHub NG',
    date: formatNigerianDateTime(evidencePayment.completed_at || evidencePayment.created_at),
    status: statusUpper,
    rawStatus: evidencePayment.payment_status,
    isPaid,
    method: humanizePaymentMethod(evidencePayment.payment_method || 'paystack'),
    channel: '',
    methodLine: humanizePaymentMethod(evidencePayment.payment_method || 'paystack'),
    currency: evidencePayment.currency || 'NGN',
    paymentType: 'evidence_verification',
    contextRows: [
      { label: 'Dispute Reference', value: `Dispute #${evidencePayment.dispute_id}` },
    ],
    items: [{ label: 'Evidence Verification Fee', amount: formatNgn(amount) }],
    total: formatNgn(amount),
    totalAmount: amount,
    totalLabel: isPaid ? 'TOTAL PAID' : 'AMOUNT',
    evidencePaymentId: evidencePayment.id,
  };
};

// ── Canonical Email Senders ─────────────────────────────────────────────────

const sendReceiptForPayment = async (paymentId) => {
  try {
    const ctx = await loadReceiptContext(paymentId);
    if (!ctx) return { success: false, error: 'Receipt context not found' };
    // Never email an official payment receipt for pending/failed/cancelled payments
    if (!isReceiptEligiblePaymentStatus(ctx.payment.payment_status)) {
      return {
        success: false,
        skipped: true,
        error: `Payment status "${ctx.payment.payment_status}" is not eligible for an official receipt email`,
      };
    }
    return await sendPaymentReceiptEmail(buildReceiptData(ctx));
  } catch (error) {
    logger.error('sendReceiptForPayment error', { error: error.message });
    return { success: false, error: error.message };
  }
};

const sendTransportationPaymentReceipt = async (bookingId) => {
  try {
    const ctx = await loadTransportationReceiptContext(bookingId);
    if (!ctx || !ctx.booking.tenant_email) return { success: false, error: 'Booking receipt context not found' };
    if (!isReceiptEligiblePaymentStatus(ctx.booking.payment_status)) {
      return { success: false, skipped: true };
    }
    return await sendPaymentReceiptEmail(buildTransportationReceiptData(ctx));
  } catch (error) {
    logger.error('sendTransportationPaymentReceipt error', { error: error.message });
    return { success: false, error: error.message };
  }
};

const sendFumigationPaymentReceipt = async (bookingId) => {
  try {
    const ctx = await loadFumigationReceiptContext(bookingId);
    if (!ctx || !ctx.booking.tenant_email) return { success: false, error: 'Fumigation receipt context not found' };
    const status = ctx.booking.payment_status || ctx.booking.fp_status;
    if (!isReceiptEligiblePaymentStatus(status)) {
      return { success: false, skipped: true };
    }
    return await sendPaymentReceiptEmail(buildFumigationReceiptData(ctx));
  } catch (error) {
    logger.error('sendFumigationPaymentReceipt error', { error: error.message });
    return { success: false, error: error.message };
  }
};

const sendEvidencePaymentReceipt = async (evidencePaymentId) => {
  try {
    const ctx = await loadEvidenceReceiptContext(evidencePaymentId);
    if (!ctx || !ctx.evidencePayment.payer_email) return { success: false, error: 'Evidence receipt context not found' };
    if (!isReceiptEligiblePaymentStatus(ctx.evidencePayment.payment_status)) {
      return { success: false, skipped: true };
    }
    return await sendPaymentReceiptEmail(buildEvidenceReceiptData(ctx));
  } catch (error) {
    logger.error('sendEvidencePaymentReceipt error', { error: error.message });
    return { success: false, error: error.message };
  }
};

const sendRefundConfirmationEmail = async (refundId) => {
  try {
    const ctx = await loadRefundContext(refundId);
    if (!ctx || !ctx.refund.tenant_email) return { success: false, error: 'Refund context not found' };
    const receipt = buildRefundReceiptData(ctx);
    const itemsHtml = receipt.items
      .map(
        (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(item.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${esc(item.amount)}</td>
      </tr>`
      )
      .join('');

    await mailer.sendEmail({
      to: receipt.email,
      subject: `Refund Confirmation ${receipt.receiptNumber} - Amana RentalHub NG`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6; max-width: 560px; margin: 0 auto;">
          <div style="text-align:center; padding-bottom:16px; border-bottom:2px solid #0284c7;">
            <div style="font-family:'Segoe Script','Brush Script MT',cursive; font-size:26px; color:#6e1b2b;">Amana</div>
            <h2 style="margin:0 0 2px; color:#0f172a;">Amana RentalHub NG</h2>
            <p style="margin:0; color:#64748b; font-size:12px;">rentalhub.com.ng &nbsp;•&nbsp; support@rentalhub.com.ng</p>
            <p style="margin:10px 0 0; color:#64748b;">${esc(DOCUMENT_TYPES.REFUND)}</p>
            <p style="margin:6px 0 0; font-weight:600; color:#0f172a;">${esc(receipt.receiptNumber)}</p>
          </div>
          <div style="padding:16px 0; font-size:14px; color:#334155;">
            <p style="margin:4px 0;"><strong>Recipient:</strong> ${esc(receipt.fullName || receipt.email)}</p>
            <p style="margin:4px 0;"><strong>Date:</strong> ${esc(receipt.date)}</p>
            <p style="margin:4px 0;"><strong>Status:</strong> ${esc(receipt.status)}</p>
            <p style="margin:4px 0;"><strong>Original Receipt:</strong> ${esc(receipt.refund.originalReceiptNumber || '—')}</p>
            <p style="margin:4px 0;"><strong>Original Reference:</strong> ${esc(receipt.refund.originalReference || '—')}</p>
            <p style="margin:4px 0;"><strong>Refund Reference:</strong> ${esc(receipt.refund.refundReference)}</p>
            <p style="margin:4px 0;"><strong>Refund Type:</strong> ${esc(receipt.refund.refundTypeLabel)}</p>
            ${receipt.refund.propertyTitle ? `<p style="margin:4px 0;"><strong>Property:</strong> ${esc(receipt.refund.propertyTitle)}</p>` : ''}
            ${receipt.refund.reason ? `<p style="margin:4px 0;"><strong>Reason:</strong> ${esc(receipt.refund.reason)}</p>` : ''}
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#334155;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px 12px; text-align:left;">Description</th>
                <th style="padding:8px 12px; text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr>
                <td style="padding:10px 12px; font-weight:700; border-top:2px solid #e2e8f0;">Amount Refunded</td>
                <td style="padding:10px 12px; text-align:right; font-weight:700; border-top:2px solid #e2e8f0;">${esc(receipt.total)}</td>
              </tr>
            </tfoot>
          </table>
          <p style="padding-top:16px; font-size:12px; color:#94a3b8; text-align:center;">
            Thank you for using Amana RentalHub NG.
          </p>
          <p style="font-size:10px; color:#cbd5e1; text-align:center; margin-top:4px;">
            ${esc(RECEIPT_NOTICE)}
          </p>
        </div>
      `,
    });
    return { success: true, receiptNumber: receipt.receiptNumber };
  } catch (error) {
    logger.error('sendRefundConfirmationEmail error', { error: error.message });
    return { success: false, error: error.message };
  }
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
    const failedOrReversed = isFailedOrReversedPayoutStatus(status);
    const docHeading = failedOrReversed ? 'PAYOUT STATUS RECORD' : DOCUMENT_TYPES.PAYOUT;
    const totalHeading = failedOrReversed ? 'Withdrawal Amount' : 'Total Paid Out';
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
      subject: `${failedOrReversed ? 'Payout Notice' : 'Payout Receipt'} ${payoutNumber} - Amana RentalHub NG`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6; max-width: 560px; margin: 0 auto;">
          <div style="text-align:center; padding-bottom:16px; border-bottom:2px solid #0284c7;">
            <div style="font-family:'Segoe Script','Brush Script MT',cursive; font-size:26px; color:#6e1b2b;">Amana</div>
            <h2 style="margin:0 0 2px; color:#0f172a;">Amana RentalHub NG</h2>
            <p style="margin:0; color:#64748b; font-size:12px;">rentalhub.com.ng &nbsp;•&nbsp; support@rentalhub.com.ng</p>
            <p style="margin:10px 0 0; color:#64748b;">${esc(docHeading)}</p>
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
                <td style="padding:10px 12px; font-weight:700; border-top:2px solid #e2e8f0;">${esc(totalHeading)}</td>
                <td style="padding:10px 12px; text-align:right; font-weight:700; border-top:2px solid #e2e8f0;">${esc(formatNgn(amount))}</td>
              </tr>
            </tfoot>
          </table>` : `
          <div style="padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:15px; color:#0f172a;">
            <strong>${esc(totalHeading)}:</strong> ${esc(formatNgn(amount))}
          </div>`}
          <p style="padding-top:16px; font-size:12px; color:#94a3b8; text-align:center;">
            Thank you for using Amana RentalHub NG. You can view this receipt from your dashboard.
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

    let commissions = snapshot;
    if (!commissions) {
      commissions = (
        await db.query(
          `SELECT source, amount, commission_rate, paid_at
           FROM admin_commissions
           WHERE admin_id = $1 AND status = 'paid' AND paid_at >= CURRENT_DATE - INTERVAL '3 days'
           ORDER BY paid_at DESC`,
          [adminId]
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
  bankName = '',
  accountNumber = '',
  accountName = '',
  reference,
  status = 'processed',
  note = '',
}) => {
  try {
    const user = (await db.query('SELECT email, full_name FROM users WHERE id = $1', [agentUserId])).rows[0];
    if (!user) return { success: false };

    const resolvedId = resolveWithdrawalId(withdrawalId, reference, ['AGW', 'AG']);

    let resolvedBankName = bankName;
    let resolvedAccountNumber = accountNumber;
    let resolvedAccountName = accountName;
    if ((!resolvedBankName || !resolvedAccountNumber) && resolvedId > 0) {
      try {
        const wRes = await db.query(
          'SELECT bank_details FROM agent_withdrawal_requests WHERE id = $1 LIMIT 1',
          [resolvedId]
        );
        const bd = wRes.rows[0]?.bank_details;
        const parsed = typeof bd === 'string' ? JSON.parse(bd) : bd || {};
        resolvedBankName = resolvedBankName || parsed.bank_name || parsed.bankName || '';
        resolvedAccountNumber = resolvedAccountNumber || parsed.account_number || parsed.accountNumber || '';
        resolvedAccountName = resolvedAccountName || parsed.account_name || parsed.accountName || '';
      } catch {
        // Optional enrichment
      }
    }

    let items = [];
    try {
      items = (
        await db.query(
          `SELECT source, amount, paid_on
           FROM agent_commission_ledger
           WHERE agent_user_id = $1 AND payment_status = 'paid' AND paid_on >= CURRENT_DATE - INTERVAL '7 days'
           ORDER BY paid_on DESC`,
          [agentUserId]
        )
      ).rows;
    } catch {
      items = [];
    }

    const itemLines = items.map((c) => ({
      label: humanizePaymentType(c.source || 'commission'),
      amount: formatNgn(c.amount),
    }));

    return await sendPayoutReceiptEmail({
      email: user.email,
      fullName: user.full_name,
      payoutNumber: agentPayoutReceiptNumber(resolvedId),
      amount,
      bankName: resolvedBankName,
      accountNumber: resolvedAccountNumber,
      accountName: resolvedAccountName,
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
  DOCUMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  classifyPaymentDocumentType,
  isCompletedPaymentStatus,
  isReceiptEligiblePaymentStatus,
  isCompletedPayoutStatus,
  isFailedOrReversedPayoutStatus,
  baseReference,
  buildReceiptData,
  buildSavingsContributionReceiptData,
  buildWalletTransactionReceiptData,
  buildUserPayoutReceiptData,
  buildAgentPayoutReceiptData,
  buildAdminPayoutReceiptData,
  buildRefundReceiptData,
  buildTransportationReceiptData,
  buildFumigationReceiptData,
  buildEvidenceReceiptData,
  formatNgn,
  getPaymentGroup,
  humanizePaymentType,
  humanizePaymentChannel,
  loadReceiptContext,
  loadSavingsContributionContext,
  loadWalletTransactionContext,
  loadUserPayoutContext,
  loadAgentPayoutContext,
  loadAdminPayoutContext,
  loadRefundContext,
  loadTransportationReceiptContext,
  loadFumigationReceiptContext,
  loadEvidenceReceiptContext,
  resolveWithdrawalId,
  sendAdminPayoutReceipt,
  sendAgentPayoutReceipt,
  sendReceiptForPayment,
  sendUserPayoutReceipt,
  sendRefundConfirmationEmail,
  sendTransportationPaymentReceipt,
  sendFumigationPaymentReceipt,
  sendEvidencePaymentReceipt,
  sendPayoutReceiptEmail,
};
