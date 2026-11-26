const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('stream');

// Mock database and mailer BEFORE requiring paymentReceipt / receiptController
const dbModulePath = require.resolve('../config/middleware/database');
const mailerModulePath = require.resolve('../config/utils/mailer');

const queryHandlers = [];
const sentEmails = [];

require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: {
    query: async (sql, params) => {
      for (let i = queryHandlers.length - 1; i >= 0; i--) {
        const res = await queryHandlers[i](sql, params);
        if (res !== undefined) return res;
      }
      return { rows: [] };
    },
  },
};

require.cache[mailerModulePath] = {
  id: mailerModulePath,
  filename: mailerModulePath,
  loaded: true,
  exports: {
    sendEmail: async (payload) => {
      sentEmails.push(payload);
      return { messageId: `mock-${sentEmails.length}` };
    },
  },
};

const refGen = require('../config/utils/referenceGenerator');
const paymentReceipt = require('../config/utils/paymentReceipt');
const receiptAuth = require('../config/utils/receiptAuth');
const { renderReceiptPdf } = require('../config/utils/receiptPdfRenderer');
const receiptController = require('../controllers/receiptController');

const resetMocks = () => {
  queryHandlers.length = 0;
  sentEmails.length = 0;
};

const renderPdfToBuffer = (receipt) =>
  new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    const headers = {};
    stream.setHeader = (k, v) => {
      headers[k.toLowerCase()] = v;
    };
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve({ buffer: Buffer.concat(chunks), headers }));
    stream.on('error', reject);
    renderReceiptPdf(receipt, stream);
  });

const createMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
  };
  return res;
};

// ── 1. Every supported payment type has the correct receipt classification ──
test('1. Payment type receipt classifications match Amana document standards', () => {
  assert.equal(paymentReceipt.classifyPaymentDocumentType('rent_payment'), 'OFFICIAL RENT PAYMENT RECEIPT');
  for (const serviceType of [
    'property_inspection_fee',
    'lawyer_access_fee',
    'lawyer_directory_unlock',
    'agent_access_fee',
    'transportation_booking',
    'fumigation_cleaning_booking',
    'property_protection',
  ]) {
    assert.equal(
      paymentReceipt.classifyPaymentDocumentType(serviceType),
      'OFFICIAL SERVICE PAYMENT RECEIPT',
      `Expected service receipt for ${serviceType}`
    );
  }
  assert.equal(
    paymentReceipt.classifyPaymentDocumentType('general_platform_fee', { protectionRequest: { id: 1 } }),
    'OFFICIAL SERVICE PAYMENT RECEIPT'
  );
  for (const standardType of [
    'tenant_subscription',
    'tenant_multiple_property_subscription',
    'landlord_subscription',
    'registration_fee',
    'registration',
    'registration_foreign_card_adjustment',
    'landlord_listing',
    'property_unlock',
    'wallet_funding',
    'tenant_location_access',
    'tenant_property_alert',
    'evidence_verification',
    'general_platform_fee',
  ]) {
    assert.equal(
      paymentReceipt.classifyPaymentDocumentType(standardType),
      'OFFICIAL PAYMENT RECEIPT',
      `Expected payment receipt for ${standardType}`
    );
  }
});

// ── 2. Failed & Pending payments NEVER display as PAID ──────────────────────
test('2. Failed and pending payments cannot display as PAID and are blocked by controller (409)', async () => {
  resetMocks();
  const baseUser = { id: 10, email: 'tenant@example.com', full_name: 'Amina Tenant' };

  for (const badStatus of ['pending', 'failed', 'cancelled']) {
    const built = paymentReceipt.buildReceiptData({
      payment: {
        id: 501,
        user_id: 10,
        payment_type: 'tenant_subscription',
        amount: 15000,
        payment_status: badStatus,
        payment_method: 'paystack',
        transaction_reference: 'ARH_SUB_501',
        created_at: '2026-10-01T10:00:00Z',
      },
      group: [{ id: 501, payment_type: 'tenant_subscription', amount: 15000 }],
      user: baseUser,
      ref: 'ARH_SUB_501',
    });
    assert.notEqual(built.status, 'PAID');
    assert.equal(built.isPaid, false);
    assert.notEqual(built.totalLabel, 'TOTAL PAID');
  }

  // Controller returns 409 for failed payment
  queryHandlers.push(async (sql) => {
    if (sql.includes('FROM payments WHERE id = $1')) {
      return {
        rows: [{
          id: 502,
          user_id: 10,
          payment_type: 'rent_payment',
          amount: 500000,
          payment_status: 'failed',
          payment_method: 'paystack',
          transaction_reference: 'ARH_RENT_502',
          created_at: '2026-10-01T10:00:00Z',
        }],
      };
    }
    if (sql.includes('FROM users WHERE id = $1')) return { rows: [baseUser] };
    return { rows: [] };
  });

  const req = { params: { kind: 'payment', id: '502' }, user: { id: 10, user_type: 'tenant' }, logger: { warn: () => {}, error: () => {} } };
  const res = createMockRes();
  await receiptController.getDocumentJson(req, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'RECEIPT_NOT_AVAILABLE_FOR_STATUS');

  // sendReceiptForPayment also skips emailing failed payment
  const emailRes = await paymentReceipt.sendReceiptForPayment(502);
  assert.equal(emailRes.skipped, true);
  assert.equal(sentEmails.length, 0);
});

// ── 3. Cross-role authorization & IDOR protection ───────────────────────────
test('3. Strict role authorization blocks cross-user IDOR across tenant, landlord, agent, provider, ordinary admin, and finance jurisdictions', async () => {
  resetMocks();

  // Payment owned by tenant 10 on landlord 20's property in Lagos (Ikeja)
  const paymentCtx = {
    payment: { id: 123, user_id: 10, payment_type: 'rent_payment', payment_status: 'completed' },
    rent: { landlordId: 20, stateName: 'Lagos', lgaName: 'Ikeja' },
    geo: { stateName: 'Lagos', lgaName: 'Ikeja' },
  };

  // Tenant 10 -> allowed (payer)
  assert.deepEqual(
    await receiptAuth.authorizePaymentReceipt({ id: 10, user_type: 'tenant' }, paymentCtx),
    { allowed: true, perspective: 'payer' }
  );
  // Tenant 11 (other tenant) -> DENIED
  assert.equal(
    (await receiptAuth.authorizePaymentReceipt({ id: 11, user_type: 'tenant' }, paymentCtx)).allowed,
    false
  );
  // Landlord 20 (property owner) -> allowed (landlord perspective!)
  assert.deepEqual(
    await receiptAuth.authorizePaymentReceipt({ id: 20, user_type: 'landlord' }, paymentCtx),
    { allowed: true, perspective: 'landlord' }
  );
  // Landlord 21 (other landlord) -> DENIED
  assert.equal(
    (await receiptAuth.authorizePaymentReceipt({ id: 21, user_type: 'landlord' }, paymentCtx)).allowed,
    false
  );
  // Ordinary admins (lga_admin, lga_support_admin, recruitment_admin) -> DENIED
  for (const ordinaryRole of ['lga_admin', 'lga_support_admin', 'state_support_admin', 'recruitment_admin']) {
    assert.equal(
      (await receiptAuth.authorizePaymentReceipt({ id: 99, user_type: ordinaryRole, assigned_state: 'Lagos', assigned_lga: 'Ikeja' }, paymentCtx)).allowed,
      false,
      `${ordinaryRole} must NOT access other users' financial receipts`
    );
  }
  // State financial admin in Lagos -> allowed; in Kano -> DENIED
  assert.equal(
    (await receiptAuth.authorizePaymentReceipt({ id: 70, user_type: 'state_financial_admin', assigned_state: 'Lagos' }, paymentCtx)).allowed,
    true
  );
  assert.equal(
    (await receiptAuth.authorizePaymentReceipt({ id: 71, user_type: 'state_financial_admin', assigned_state: 'Kano' }, paymentCtx)).allowed,
    false
  );
  // Zonal financial admin in South-West -> allowed; in North-West -> DENIED
  assert.equal(
    (await receiptAuth.authorizePaymentReceipt({ id: 72, user_type: 'zonal_financial_admin', assigned_zone: 'South West' }, paymentCtx)).allowed,
    true
  );
  assert.equal(
    (await receiptAuth.authorizePaymentReceipt({ id: 73, user_type: 'zonal_financial_admin', assigned_zone: 'North West' }, paymentCtx)).allowed,
    false
  );
  // Super-admin & super_financial_admin & financial_admin -> allowed
  for (const superFinRole of ['super_admin', 'super_financial_admin', 'financial_admin']) {
    assert.equal(
      (await receiptAuth.authorizePaymentReceipt({ id: 1, user_type: superFinRole }, paymentCtx)).allowed,
      true
    );
  }

  // Agent payout: agent 30 allowed, agent 31 DENIED
  const agentPayoutCtx = { withdrawal: { id: 91, agent_user_id: 30 }, geo: { stateName: 'Lagos' } };
  assert.equal((await receiptAuth.authorizeAgentPayoutReceipt({ id: 30, user_type: 'agent' }, agentPayoutCtx)).allowed, true);
  assert.equal((await receiptAuth.authorizeAgentPayoutReceipt({ id: 31, user_type: 'agent' }, agentPayoutCtx)).allowed, false);

  // Transportation booking: tenant 10 & assigned driver 40 allowed; other driver 41 & fumigation admin DENIED
  const trnCtx = { booking: { id: 19, tenant_id: 10, driver_id: 40 }, geo: { stateName: 'Lagos' } };
  assert.equal((await receiptAuth.authorizeTransportationReceipt({ id: 10, user_type: 'tenant' }, trnCtx)).allowed, true);
  assert.equal((await receiptAuth.authorizeTransportationReceipt({ id: 40, user_type: 'agent' }, trnCtx)).allowed, true);
  assert.equal((await receiptAuth.authorizeTransportationReceipt({ id: 41, user_type: 'agent' }, trnCtx)).allowed, false);
  assert.equal((await receiptAuth.authorizeTransportationReceipt({ id: 42, user_type: 'super_fumigation_admin' }, trnCtx)).allowed, false);

  // Fumigation booking: assigned team 50 allowed; other provider 51 & transport admin DENIED
  const fumCtx = { booking: { id: 23, tenant_id: 10, team_id: 50, provider_user_id: 50 }, geo: { stateName: 'Lagos' } };
  assert.equal((await receiptAuth.authorizeFumigationReceipt({ id: 50, user_type: 'agent' }, fumCtx)).allowed, true);
  assert.equal((await receiptAuth.authorizeFumigationReceipt({ id: 51, user_type: 'agent' }, fumCtx)).allowed, false);
  assert.equal((await receiptAuth.authorizeFumigationReceipt({ id: 52, user_type: 'super_transportation_admin' }, fumCtx)).allowed, false);
});

// ── 4. Landlord Rent Received view vs Tenant Rent Receipt (privacy + same ARH) ──
test('4. Landlord rent confirmation keeps identical ARH number, shows fee/net breakdown, and omits tenant private email', () => {
  const ctx = {
    payment: {
      id: 123,
      user_id: 10,
      payment_type: 'rent_payment',
      amount: 1200000,
      payment_status: 'completed',
      payment_method: 'paystack',
      payment_channel: 'bank_transfer',
      transaction_reference: 'RENT_LEGACY_123',
      created_at: '2026-10-10T09:00:00Z',
    },
    group: [{ id: 123, payment_type: 'rent_payment', amount: 1200000 }],
    user: { email: 'private.tenant@example.com', full_name: 'Chidi Tenant' },
    ref: 'RENT_LEGACY_123',
    rent: {
      paymentFor: 'Annual Rent',
      propertyTitle: '2-Bedroom Flat, Lekki',
      propertyAddress: '14 Admiralty Way, Lekki, Lagos',
      tenantName: 'Chidi Tenant',
      landlordId: 20,
      landlordName: 'Alhaji Musa Landlord',
      rentalPeriod: { start: '1 November 2026', end: '31 October 2027' },
      platformFee: 60000,
    },
  };

  const tenantView = paymentReceipt.buildReceiptData(ctx, { viewerPerspective: 'payer' });
  const landlordView = paymentReceipt.buildReceiptData(ctx, { viewerPerspective: 'landlord' });

  // Same immutable ARH receipt number and preserved legacy reference
  assert.equal(tenantView.receiptNumber, 'ARH-RCPT-000123');
  assert.equal(landlordView.receiptNumber, 'ARH-RCPT-000123');
  assert.equal(tenantView.reference, 'RENT_LEGACY_123');
  assert.equal(landlordView.reference, 'RENT_LEGACY_123');

  // Tenant sees their own email; Landlord does NOT see tenant's private email
  assert.equal(tenantView.email, 'private.tenant@example.com');
  assert.equal(landlordView.email, '');
  assert.equal(landlordView.subtitle, 'Landlord Rent Received Confirmation Record');
  assert.equal(landlordView.rent.netLandlordAmount, 1140000);
});

// ── 5. Refund Confirmation links original transaction + partial remaining ───
test('5. Refund confirmation links original payment, computes partial remaining amount, and never looks like a new payment', async () => {
  const refundReceipt = paymentReceipt.buildRefundReceiptData({
    refund: {
      id: 55,
      payment_id: 123,
      tenant_id: 10,
      landlord_id: 20,
      original_amount: 1200000,
      approved_amount: 400000,
      refund_type: 'partial_months',
      refund_months: 4,
      status: 'refunded',
      reason: 'Early relocation agreement',
      original_reference: 'ARH_RENT_123_1700000000',
      paystack_refund_reference: 'RF_998877',
      tenant_name: 'Chidi Tenant',
      tenant_email: 'chidi@example.com',
      landlord_name: 'Musa Landlord',
      property_title: '2-Bedroom Flat, Lekki',
      refunded_at: '2026-10-15T12:00:00Z',
    },
  });

  assert.equal(refundReceipt.documentType, 'REFUND CONFIRMATION');
  assert.equal(refundReceipt.receiptNumber, 'ARH-RFND-000055');
  assert.equal(refundReceipt.isPaid, false);
  assert.equal(refundReceipt.totalLabel, 'AMOUNT REFUNDED');
  assert.equal(refundReceipt.refund.originalReceiptNumber, 'ARH-RCPT-000123');
  assert.equal(refundReceipt.refund.originalReference, 'ARH_RENT_123_1700000000');
  assert.equal(refundReceipt.refund.refundReference, 'RF_998877');
  assert.equal(refundReceipt.refund.remainingAmount, 800000);

  const { buffer } = await renderPdfToBuffer(refundReceipt);
  assert.equal(buffer.subarray(0, 5).toString('utf8'), '%PDF-');
  assert.ok(buffer.length > 1000);
});

// ── 6. Payout receipts keyed by withdrawal ID, masked accounts, failed notice ──
test('6. Payout receipts use withdrawal ID (not user ID), mask full bank accounts, and handle failed/reversed safely', async () => {
  const fullAcct = '0123456789';

  const userPayout = paymentReceipt.buildUserPayoutReceiptData({
    withdrawal: {
      id: 184,
      user_id: 999999,
      amount: 250000,
      status: 'processed',
      bank_name: 'GTBank',
      account_number: fullAcct,
      account_name: 'Amina Tenant',
      paystack_transfer_reference: 'ARH_WLW_184_1700000000',
      processed_at: '2026-10-12T15:00:00Z',
      full_name: 'Amina Tenant',
      email: 'amina@example.com',
    },
  });
  assert.equal(userPayout.receiptNumber, 'ARH-WDR-000184');
  assert.notEqual(userPayout.receiptNumber, 'ARH-WDR-999999');
  assert.equal(userPayout.payout.maskedAccountNumber, '••••••6789');
  assert.equal(JSON.stringify(userPayout).includes(fullAcct), false);

  const failedAgentPayout = paymentReceipt.buildAgentPayoutReceiptData({
    withdrawal: {
      id: 91,
      agent_user_id: 888888,
      amount: 45000,
      status: 'approved',
      paystack_transfer_status: 'reversed',
      payout_failed_reason: 'Account restricted',
      paystack_transfer_reference: 'AGW_91_1690000000',
      bank_details: { bank_name: 'Access Bank', account_number: fullAcct, account_name: 'Tunde Agent' },
      full_name: 'Tunde Agent',
      email: 'tunde@example.com',
      created_at: '2026-10-12T15:00:00Z',
    },
    bankDetails: { bank_name: 'Access Bank', account_number: fullAcct, account_name: 'Tunde Agent' },
  });
  assert.equal(failedAgentPayout.receiptNumber, 'ARH-AG-PAY-000091');
  assert.equal(failedAgentPayout.isPaid, false);
  assert.equal(failedAgentPayout.status, 'REVERSED');
  assert.equal(failedAgentPayout.totalLabel, 'WITHDRAWAL AMOUNT');
  assert.equal(JSON.stringify(failedAgentPayout).includes(fullAcct), false);

  const adminPayout = paymentReceipt.buildAdminPayoutReceiptData({
    withdrawal: {
      id: 37,
      admin_id: 777777,
      amount: 85000,
      status: 'completed',
      bank_name: 'Zenith Bank',
      account_number: fullAcct,
      account_name: 'State Admin',
      paystack_transfer_reference: 'ARH_SAW_37_1700000000',
      full_name: 'State Admin',
      email: 'state@example.com',
      processed_at: '2026-10-12T15:00:00Z',
    },
  });
  assert.equal(adminPayout.receiptNumber, 'ARH-SAW-PAY-000037');
  assert.equal(JSON.stringify(adminPayout).includes(fullAcct), false);
});

// ── 7. Wallet transaction record & Savings receipt & Missing optional data ──
test('7. Wallet transaction record is distinct from payment receipt, savings receipt stays ARH-RCPT-SAV, and missing optional fields never break PDF', async () => {
  const walletDoc = paymentReceipt.buildWalletTransactionReceiptData({
    transaction: {
      id: 77,
      user_id: 10,
      amount: 10000,
      type: 'debit',
      status: 'completed',
      source: 'property_fee',
      description: 'Monthly property maintenance fee',
      created_at: '2026-10-12T15:00:00Z',
      full_name: 'Landlord One',
      email: 'landlord@example.com',
    },
  });
  assert.equal(walletDoc.documentType, 'OFFICIAL WALLET TRANSACTION RECORD');
  assert.equal(walletDoc.receiptNumber, 'ARH-WTX-000077');
  assert.equal(walletDoc.isPaid, false);

  const savingsDoc = paymentReceipt.buildSavingsContributionReceiptData({
    contribution: {
      id: 42,
      plan_id: 7,
      tenant_id: 10,
      amount: 50000,
      commission_1pct: 500,
      net_saved: 49500,
      saved_for_month: '2026-10',
      contributed_at: '2026-10-05T10:00:00Z',
      full_name: 'Saver One',
      email: 'saver@example.com',
    },
  });
  assert.equal(savingsDoc.documentType, 'RENT SAVINGS CONTRIBUTION RECEIPT');
  assert.equal(savingsDoc.receiptNumber, 'ARH-RCPT-SAV-000042');
  assert.equal(savingsDoc.total, '₦49,500');

  // Missing optional fields (no address, no bank name, no email, no items)
  const sparseDoc = paymentReceipt.buildReceiptData({
    payment: { id: 8, user_id: 1, payment_type: 'property_unlock', amount: 2500, payment_status: 'completed', created_at: '2026-10-01T00:00:00Z' },
    group: [{ id: 8, payment_type: 'property_unlock', amount: 2500 }],
    user: { full_name: '', email: '' },
    ref: '',
  });
  const { buffer } = await renderPdfToBuffer(sparseDoc);
  assert.equal(buffer.subarray(0, 5).toString('utf8'), '%PDF-');
});

// ── 8. Actual email invocation, XSS escaping, masked accounts, stability ────
test('8. Actual email invocation sends matching ARH receipt numbers, escapes HTML, and masks bank accounts', async () => {
  resetMocks();
  const fullAcct = '0987654321';

  queryHandlers.push(async (sql, params) => {
    if (sql.includes('FROM payments WHERE id = $1')) {
      return {
        rows: [{
          id: 321,
          user_id: 10,
          payment_type: 'tenant_subscription',
          amount: 10000,
          payment_status: 'completed',
          payment_method: 'paystack',
          payment_channel: 'card',
          transaction_reference: 'ARH_SUB_321',
          created_at: '2026-10-14T10:00:00Z',
        }],
      };
    }
    if (sql.includes('FROM payments') && sql.includes('_LAWYER_FEE')) {
      return { rows: [] };
    }
    if (sql.includes('FROM users WHERE id = $1')) {
      return { rows: [{ id: params[0], email: 'recipient@example.com', full_name: '<script>alert(1)</script> Musa' }] };
    }
    if (sql.includes('FROM refund_requests rr')) {
      return {
        rows: [{
          id: 55,
          payment_id: 321,
          tenant_id: 10,
          original_amount: 10000,
          approved_amount: 10000,
          refund_type: 'full',
          status: 'refunded',
          reason: '<b>Cancelled</b>',
          original_reference: 'ARH_SUB_321',
          tenant_name: 'Musa',
          tenant_email: 'recipient@example.com',
          refunded_at: '2026-10-15T10:00:00Z',
        }],
      };
    }
    if (sql.includes('FROM agent_withdrawal_requests WHERE id = $1')) {
      return { rows: [{ bank_details: { bank_name: 'UBA', account_number: fullAcct, account_name: 'Agent X' } }] };
    }
    return { rows: [] };
  });

  // 8a. Payment receipt email
  const payRes = await paymentReceipt.sendReceiptForPayment(321);
  assert.equal(payRes.success, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'recipient@example.com');
  assert.ok(sentEmails[0].html.includes('ARH-RCPT-000321'));
  assert.equal(sentEmails[0].html.includes('<script>'), false);
  assert.ok(sentEmails[0].html.includes('&lt;script&gt;'));

  // 8b. Agent payout receipt email — asserts masked account & NO full account number
  const agRes = await paymentReceipt.sendAgentPayoutReceipt({
    agentUserId: 10,
    withdrawalId: 91,
    amount: 45000,
    reference: 'ARH_AGW_91_1700000000',
    status: 'processed',
  });
  assert.equal(agRes.success, true);
  assert.equal(sentEmails.length, 2);
  assert.ok(sentEmails[1].html.includes('ARH-AG-PAY-000091'));
  assert.ok(sentEmails[1].html.includes('••••••4321'));
  assert.equal(sentEmails[1].html.includes(fullAcct), false);

  // 8c. Refund confirmation email — asserts ARH-RFND number, original link, escaped HTML
  const rfRes = await paymentReceipt.sendRefundConfirmationEmail(55);
  assert.equal(rfRes.success, true);
  assert.equal(sentEmails.length, 3);
  assert.ok(sentEmails[2].subject.includes('ARH-RFND-000055'));
  assert.ok(sentEmails[2].html.includes('ARH-RCPT-000321'));
  assert.equal(sentEmails[2].html.includes('<b>Cancelled</b>'), false);
  assert.ok(sentEmails[2].html.includes('&lt;b&gt;Cancelled&lt;/b&gt;'));
});

// ── 9. Receipt number stability & legacy reference compatibility ────────────
test('9. Receipt numbers stay identical across repeated requests and legacy references stay compatible', () => {
  assert.equal(refGen.paymentReceiptNumber(123), refGen.paymentReceiptNumber(123));
  assert.equal(refGen.paymentReceiptNumber(123), 'ARH-RCPT-000123');
  assert.equal(refGen.savingsReceiptNumber(123), 'ARH-RCPT-SAV-000123');
  assert.equal(refGen.userPayoutReceiptNumber(184), 'ARH-WDR-000184');
  assert.equal(refGen.agentPayoutReceiptNumber(91), 'ARH-AG-PAY-000091');
  assert.equal(refGen.adminPayoutReceiptNumber(37), 'ARH-SAW-PAY-000037');
  assert.equal(refGen.refundReceiptNumber(55), 'ARH-RFND-000055');
  assert.equal(refGen.walletTransactionReceiptNumber(77), 'ARH-WTX-000077');
  assert.equal(refGen.transportReceiptNumber(19), 'ARH-RCPT-TRN-000019');
  assert.equal(refGen.fumigationReceiptNumber(23), 'ARH-RCPT-FUM-000023');
  assert.equal(refGen.evidenceReceiptNumber(11), 'ARH-RCPT-EVD-000011');

  // Legacy prefixes still accepted
  assert.equal(refGen.matchesPrefix('AGW_91_1700000', 'AGW'), true);
  assert.equal(refGen.matchesPrefix('ARH_AGW_91_1700000', 'AGW'), true);
  assert.equal(refGen.matchesPrefix('WLW_184_1700000', 'WLW'), true);
  assert.equal(refGen.matchesPrefix('SAW_37_1700000', 'SAW'), true);
});

// ── 10. Static verification: duplicate-webhook guard + untouched math ───────
test('10. Webhook/verification receipt email delivery is guarded against duplicate completions', () => {
  const fs = require('fs');
  const path = require('path');
  const psSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'paymentService.js'), 'utf8');
  assert.ok(psSrc.includes("const wasAlreadyCompleted = storedPayment.payment_status === 'completed';"));
  assert.ok(psSrc.includes('if (!wasAlreadyCompleted) {\n      sendReceiptForPayment(paymentId).catch(() => {});'));
});
