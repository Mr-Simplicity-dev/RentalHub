const test = require('node:test');
const assert = require('node:assert/strict');

const { convertUsdToNgn } = require('../config/utils/fxRates');

test('USD to NGN conversion applies markup and rounds up to the nearest naira', () => {
  assert.equal(convertUsdToNgn(12.85, 1500, 2), 19661); // ceil(12.85*1500*1.02)
  assert.equal(convertUsdToNgn(5, 1500, 0), 7500);
  assert.equal(convertUsdToNgn(10.01, 1400.5, 2.5), 14370); // ceil(10.01*1400.5*1.025)
});

test('USD to NGN conversion handles exact amounts and high rates', () => {
  assert.equal(convertUsdToNgn(1, 1000, 0), 1000);
  assert.equal(convertUsdToNgn(12.85, 1650.25, 0), 21206); // ceil(21205.7125)
});

test('USD to NGN conversion rejects invalid inputs', () => {
  assert.throws(() => convertUsdToNgn(0, 1500, 2), /greater than zero/);
  assert.throws(() => convertUsdToNgn(-5, 1500, 2), /greater than zero/);
  assert.throws(() => convertUsdToNgn('abc', 1500, 2), /greater than zero/);
  assert.throws(() => convertUsdToNgn(10, 0, 2), /greater than zero/);
  assert.throws(() => convertUsdToNgn(10, 'nope', 2), /greater than zero/);
});

test('diaspora pricing targets exist with USD base amount of 12.85', () => {
  const { PRICING_TARGETS } = require('../config/utils/locationPricing');

  assert.equal(PRICING_TARGETS.tenant_registration_diaspora.currency, 'USD');
  assert.equal(PRICING_TARGETS.tenant_registration_diaspora.base_amount, 12.85);
  assert.equal(PRICING_TARGETS.landlord_registration_diaspora.currency, 'USD');
  assert.equal(PRICING_TARGETS.landlord_registration_diaspora.base_amount, 12.85);

  assert.equal(PRICING_TARGETS.tenant_registration.currency, 'NGN');
  assert.equal(PRICING_TARGETS.landlord_registration.currency, 'NGN');
});
