// Detailed rent receipt: property, tenant, landlord, authoritative tenancy
// period and the actual transaction platform fee - all optional, never guessed.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const mailer = require('../config/utils/mailer');
const {
  buildReceiptData,
  loadReceiptContext,
  sendReceiptForPayment,
} = require('../config/utils/paymentReceipt');

const rentPayment = {
  id: 500,
  user_id: 21,
  payment_type: 'rent_payment',
  amount: 750000,
  currency: 'NGN',
  payment_status: 'completed',
  payment_method: 'paystack',
  payment_channel: 'card',
  transaction_reference: 'ARH_RENT_500_1792312345678',
  created_at: new Date('2026-10-18T11:27:00Z'),
  property_id: 7,
};

const defaultProperty = {
  title: '3-Bedroom Apartment',
  full_address: '',
  area: 'Gwarinpa',
  city: 'Abuja',
  lga_name: null,
  payment_frequency: 'yearly',
  landlord_id: 8,
  state_name: 'FCT',
  landlord_name: 'Mr Landlord',
};

const withMockedDb = async (handler, run) => {
  const original = db.query;
  db.query = async (sql, params = []) => handler(String(sql), params) || { rows: [] };
  try {
    return await run();
  } finally {
    db.query = original;
  }
};

const loadContext = async (payment, { property, terms, fee, user } = {}) => {
  let ctx = null;
  await withMockedDb(
    (sql) => {
      if (/FROM payments WHERE id = \$1/.test(sql)) return { rows: [payment] };
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [user || { email: 'tenant@example.test', full_name: 'John Doe' }] };
      }
      if (/FROM properties p/.test(sql)) {
        if (property === null) return { rows: [] };
        return { rows: [property || defaultProperty] };
      }
      if (/FROM tenancy_agreements ta/.test(sql)) return { rows: terms ? [{ terms }] : [] };
      if (/FROM wallet_transactions/.test(sql)) return { rows: fee ? [{ metadata: { platform_fee: fee } }] : [] };
      return { rows: [] };
    },
    async () => {
      ctx = await loadReceiptContext(payment.id);
    }
  );
  return ctx;
};

const yearlyTerms = {
  commencementDate: '2026-10-18',
  expiryDate: '2027-10-17',
  paymentFrequency: 'yearly',
  rentAmount: 750000,
};

test('rent receipt states property, tenant, landlord and the authoritative period', async () => {
  const ctx = await loadContext(rentPayment, { terms: yearlyTerms });
  const data = buildReceiptData(ctx);

  assert.equal(data.receiptNumber, 'ARH-RCPT-000500');
  assert.equal(data.documentType, 'OFFICIAL RENT PAYMENT RECEIPT');
  assert.equal(data.reference, 'ARH_RENT_500_1792312345678');
  assert.equal(data.status, 'PAID');
  assert.equal(data.methodLine, 'Paystack — Card');
  assert.equal(data.currency, 'NGN');
  assert.equal(data.date, '18 October 2026, 12:27 PM WAT');
  assert.deepEqual(data.items, [{ label: 'Rent Amount', amount: '₦750,000' }]);
  assert.equal(data.total, '₦750,000');
  assert.equal(data.totalAmount, 750000);

  assert.equal(data.rent.paymentFor, 'Annual Rent');
  assert.equal(data.rent.propertyTitle, '3-Bedroom Apartment');
  assert.equal(data.rent.propertyAddress, 'Gwarinpa, Abuja, FCT');
  assert.equal(data.rent.tenantName, 'John Doe');
  assert.equal(data.rent.landlordName, 'Mr Landlord');
  assert.deepEqual(data.rent.rentalPeriod, { start: '18 October 2026', end: '17 October 2027' });
});

test('a full street address is preferred over the composed area/city line', async () => {
  const ctx = await loadContext(rentPayment, {
    terms: yearlyTerms,
    property: { ...defaultProperty, full_address: '12 Aminu Kano Crescent, Wuse 2' },
  });
  const data = buildReceiptData(ctx);
  assert.equal(data.rent.propertyAddress, '12 Aminu Kano Crescent, Wuse 2');
});

test('rent period label follows the tenancy payment frequency', async () => {
  const ctx = await loadContext(rentPayment, {
    terms: { commencementDate: '2026-10-01', paymentFrequency: 'monthly' },
  });
  const data = buildReceiptData(ctx);
  assert.equal(data.rent.paymentFor, 'Monthly Rent');
  assert.deepEqual(data.rent.rentalPeriod, { start: '1 October 2026', end: null });
});

test('platform fee is reported from the actual transaction, never invented', async () => {
  const withoutFee = buildReceiptData(await loadContext(rentPayment, { terms: yearlyTerms }));
  assert.equal(withoutFee.rent.platformFee, null);

  const withFee = buildReceiptData(await loadContext(rentPayment, { terms: yearlyTerms, fee: 18750 }));
  assert.equal(withFee.rent.platformFee, 18750);
  // The fee is deducted from the landlord payout, so it never inflates the
  // amount the tenant actually paid.
  assert.equal(withFee.total, '₦750,000');
  assert.equal(withFee.totalAmount, 750000);
});

test('a rent receipt still renders when property and tenancy records are missing', async () => {
  const ctx = await loadContext(rentPayment, { property: null, terms: null, fee: null });
  const data = buildReceiptData(ctx);

  assert.equal(data.rent.propertyTitle, '');
  assert.equal(data.rent.propertyAddress, '');
  assert.equal(data.rent.landlordName, '');
  assert.equal(data.rent.paymentFor, 'Rent Payment');
  assert.equal(data.rent.rentalPeriod, null);
  assert.equal(data.rent.platformFee, null);
  assert.equal(data.total, '₦750,000');
  assert.equal(data.status, 'PAID');
});

test('legacy rent references stay on the receipt unchanged', async () => {
  const ctx = await loadContext(
    { ...rentPayment, transaction_reference: 'RENT_500_OLDTS' },
    { terms: yearlyTerms }
  );
  const data = buildReceiptData(ctx);
  assert.equal(data.reference, 'RENT_500_OLDTS');
  assert.equal(data.receiptNumber, 'ARH-RCPT-000500');
});

test('a rent payment is labelled Rent Amount even when the period is unknown', async () => {
  const ctx = await loadContext(rentPayment, { property: null, terms: null });
  const data = buildReceiptData(ctx);
  assert.deepEqual(data.items, [{ label: 'Rent Amount', amount: '₦750,000' }]);
});

test('non-rent payments render the generic receipt with no rent block', async () => {
  const ctx = await loadContext({
    ...rentPayment,
    id: 501,
    payment_type: 'wallet_funding',
    property_id: null,
    transaction_reference: 'ARH_WALLET_501_1792312345678',
  });
  const data = buildReceiptData(ctx);
  assert.equal(data.documentType, 'OFFICIAL PAYMENT RECEIPT');
  assert.equal(data.rent, null);
  assert.equal(data.receiptNumber, 'ARH-RCPT-000501');
});

test('the rent receipt email carries the detailed rent block and platform fee note', async () => {
  const originalSend = mailer.sendEmail;
  const sent = [];
  mailer.sendEmail = async (payload) => {
    sent.push(payload);
    return { success: true };
  };

  try {
    await withMockedDb(
      (sql) => {
        if (/FROM payments WHERE id = \$1/.test(sql)) return { rows: [rentPayment] };
        if (/FROM users WHERE id = \$1/.test(sql)) {
          return { rows: [{ email: 'tenant@example.test', full_name: 'John Doe' }] };
        }
        if (/FROM properties p/.test(sql)) return { rows: [defaultProperty] };
        if (/FROM tenancy_agreements ta/.test(sql)) return { rows: [{ terms: yearlyTerms }] };
        if (/FROM wallet_transactions/.test(sql)) return { rows: [{ metadata: { platform_fee: 18750 } }] };
        return { rows: [] };
      },
      async () => {
        const result = await sendReceiptForPayment(500);
        assert.equal(result.success, true);
      }
    );
  } finally {
    mailer.sendEmail = originalSend;
  }

  assert.equal(sent.length, 1);
  const html = sent[0].html;
  assert.match(sent[0].subject, /ARH-RCPT-000500/);
  assert.match(html, /OFFICIAL RENT PAYMENT RECEIPT/);
  assert.match(html, /Payment For:<\/strong> Annual Rent/);
  assert.match(html, /3-Bedroom Apartment/);
  assert.match(html, /Gwarinpa, Abuja, FCT/);
  assert.match(html, /Rental Period:<\/strong> 18 October 2026 - 17 October 2027/);
  assert.match(html, /Rent Amount/);
  assert.match(html, /₦18,750/);
  assert.match(html, /not charged to you/);
  assert.match(html, /computer-generated receipt/);
});
