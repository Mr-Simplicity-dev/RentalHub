const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  amountMatchesStoredPayment,
  verifyPaystackSignature,
} = require('../config/utils/paystackWebhookSecurity');

test('accepts an authentic Paystack signature over the exact raw body', () => {
  const secret = 'test-paystack-secret';
  const rawBody = Buffer.from('{"event":"charge.success","data":{"reference":"RH_1"}}');
  const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

  assert.equal(verifyPaystackSignature({ rawBody, signature, secret }), true);
});

test('rejects malformed, altered and missing Paystack signatures without throwing', () => {
  const secret = 'test-paystack-secret';
  const rawBody = Buffer.from('{"event":"charge.success"}');
  const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

  assert.equal(
    verifyPaystackSignature({
      rawBody: Buffer.from('{"event":"charge.failed"}'),
      signature,
      secret,
    }),
    false
  );
  assert.equal(verifyPaystackSignature({ rawBody, signature: 'not-hex', secret }), false);
  assert.equal(verifyPaystackSignature({ rawBody, signature, secret: '' }), false);
  assert.equal(verifyPaystackSignature({ rawBody: null, signature, secret }), false);
});

test('compares gateway kobo against the stored naira amount exactly', () => {
  assert.equal(amountMatchesStoredPayment('1250.50', 125050), true);
  assert.equal(amountMatchesStoredPayment(1250.5, 125051), false);
  assert.equal(amountMatchesStoredPayment('not-a-number', 125050), false);
  assert.equal(amountMatchesStoredPayment(100, 10000.5), false);
});
