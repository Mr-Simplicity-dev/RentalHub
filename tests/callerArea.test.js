const test = require('node:test');
const assert = require('node:assert');
const { toDigits, resolveCallerArea } = require('../services/callerArea');

test('caller area: phone digit normalization', () => {
  assert.strictEqual(toDigits('+234 803 123 4567'), '2348031234567');
  assert.strictEqual(toDigits('0803-123-4567'), '08031234567');
  assert.strictEqual(toDigits(''), '');
  assert.strictEqual(toDigits(null), '');
});

test('caller area: short/empty numbers resolve to null without a lookup', async () => {
  assert.strictEqual(await resolveCallerArea(''), null);
  assert.strictEqual(await resolveCallerArea('123'), null);
  assert.strictEqual(await resolveCallerArea('   '), null);
  assert.strictEqual(await resolveCallerArea(null), null);
});
