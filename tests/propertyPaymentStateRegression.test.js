const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('a late Paystack success webhook cannot re-complete a refunded payment', () => {
  const src = read('services/paymentService.js');
  const start = src.indexOf('async function handleSuccessfulPayment');
  const end = src.indexOf('async function handleTransferWebhook');
  const handler = src.slice(start, end);
  assert.match(handler, /storedPayment\.payment_status === 'completed' \|\| storedPayment\.payment_status === 'refunded'/);
  assert.match(handler, /AND payment_status <> 'refunded'/);
  assert.match(handler, /if \(!completedPayment\)/);
});

test('manual property unlock verification refuses a refunded payment', () => {
  const src = read('services/paymentService.js');
  const start = src.indexOf('exports.verifyPropertyUnlock');
  const section = src.slice(start, start + 5000);
  assert.match(section, /payment\.payment_status === 'refunded'/);
});

test('property description entitlement still uses the shared row-existence helper', () => {
  const helper = read('config/utils/propertyEntitlement.js');
  const service = read('services/propertyService.js');
  const translation = read('services/translationService.js');
  assert.match(helper, /SELECT id, unlocked_at/);
  assert.equal(helper.includes('payment_status'), false);
  assert.equal(helper.includes('DELETE'), false);
  assert.match(service, /getTenantPropertyUnlock/);
  assert.match(translation, /getTenantPropertyUnlock/);
});
