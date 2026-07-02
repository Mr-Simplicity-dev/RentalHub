const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCredentialRevalidationFields,
  maskCredentialValue,
  isValidCredentialBirthDate,
} = require('../config/utils/credentialRevalidation');

test('credential revalidation accepts only supported unique fields', () => {
  assert.deepEqual(
    normalizeCredentialRevalidationFields(['nin', 'live_photo', 'nin', 'email', '']),
    ['nin', 'live_photo']
  );
});

test('credential revalidation masks identity values except their final four characters', () => {
  assert.equal(maskCredentialValue('12345678901'), '*******8901');
  assert.equal(maskCredentialValue('A12345'), '****2345');
  assert.equal(maskCredentialValue(''), null);
});

test('credential revalidation requires a real past date of birth', () => {
  assert.equal(isValidCredentialBirthDate('1990-05-20'), true);
  assert.equal(isValidCredentialBirthDate('2023-02-29'), false);
  assert.equal(isValidCredentialBirthDate('2024-02-29'), true);
  assert.equal(isValidCredentialBirthDate('not-a-date'), false);
  assert.equal(isValidCredentialBirthDate('2999-01-01'), false);
});
