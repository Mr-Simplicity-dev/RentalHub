const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { canCompleteFromSuccessWebhook } = require('../config/utils/paymentState');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('a late Paystack success webhook cannot re-complete a refunded payment', () => {
  const src = read('services/paymentService.js');
  const start = src.indexOf('async function handleSuccessfulPayment');
  const end = src.indexOf('async function handleTransferWebhook');
  const handler = src.slice(start, end);
  assert.match(handler, /if \(!canCompleteFromSuccessWebhook\(storedPayment\.payment_status\)\)/);
  assert.match(handler, /AND payment_status = 'pending'/);
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

test('only pending payments can complete through the success webhook', () => {
  assert.equal(canCompleteFromSuccessWebhook('pending'), true);
  assert.equal(canCompleteFromSuccessWebhook('failed'), false);
  assert.equal(canCompleteFromSuccessWebhook('refunded'), false);
  assert.equal(canCompleteFromSuccessWebhook('completed'), false);
  assert.equal(canCompleteFromSuccessWebhook(undefined), false);
});

test('a late success for a failed payment returns before any completion side effects', () => {
  const src = read('services/paymentService.js');
  const start = src.indexOf('async function handleSuccessfulPayment');
  const end = src.indexOf('async function handleTransferWebhook');
  const handler = src.slice(start, end);

  assert.match(handler, /canCompleteFromSuccessWebhook\(storedPayment\.payment_status\)/);
  assert.match(handler, /AND payment_status = 'pending'/);
  assert.equal(handler.includes("payment_status <> 'refunded'"), false);

  const guardIndex = handler.indexOf('if (!canCompleteFromSuccessWebhook(storedPayment.payment_status))');
  const updateIndex = handler.indexOf('const updateResult = await db.query(');
  const notifyIndex = handler.indexOf("notifyRentPayment(paymentId, 'completed')");
  const unlockIndex = handler.indexOf('INSERT INTO tenant_property_unlocks');
  assert.ok(guardIndex > -1 && guardIndex < updateIndex);
  assert.ok(updateIndex < notifyIndex);
  assert.ok(updateIndex < unlockIndex);

  const paymentSource = read('services/paymentService.js');
  const notifySection = paymentSource.slice(
    paymentSource.indexOf("if (event === 'completed')"),
    paymentSource.indexOf("if (event === 'completed')") + 1800
  );
  assert.match(notifySection, /emitSpokenEvent/);
});

test('existing successful Paystack completion still has the pending-state guard', () => {
  const src = read('services/paymentService.js');
  assert.match(src, /await handleSuccessfulPayment\(event\.data, webhookLogger\)/);
  assert.match(src, /canCompleteFromSuccessWebhook/);
});
