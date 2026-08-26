const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePhoneForTier } = require('../config/utils/helpers');
const {
  COUNTRY_NAMES,
  isCountryNameValid,
} = require('../config/utils/countryWhitelist');

test('local tier accepts only Nigerian mobile numbers', () => {
  assert.equal(validatePhoneForTier('08031234567', 'local').valid, true);
  assert.equal(validatePhoneForTier('+2348031234567', 'local').valid, true);
  assert.equal(validatePhoneForTier('07012345678', 'local').valid, true);
  assert.equal(validatePhoneForTier('09011234567', 'local').valid, true);

  assert.equal(validatePhoneForTier('+447911123456', 'local').valid, false);
  assert.equal(validatePhoneForTier('+14155552671', 'local').valid, false);
  assert.equal(validatePhoneForTier('0803123456', 'local').valid, false);
  assert.equal(validatePhoneForTier('', 'local').valid, false);
});

test('diaspora tier accepts any E.164 international number', () => {
  assert.equal(validatePhoneForTier('+447911123456', 'diaspora').valid, true);
  assert.equal(validatePhoneForTier('+14155552671', 'diaspora').valid, true);
  assert.equal(validatePhoneForTier('+233201234567', 'diaspora').valid, true);
  assert.equal(validatePhoneForTier('+2348031234567', 'diaspora').valid, true);

  assert.equal(validatePhoneForTier('08031234567', 'diaspora').valid, false);
  assert.equal(validatePhoneForTier('447911123456', 'diaspora').valid, false);
  assert.equal(validatePhoneForTier('+1', 'diaspora').valid, false);
});

test('country whitelist recognises real countries and rejects made-up names', () => {
  assert.ok(COUNTRY_NAMES.length > 150, 'whitelist must cover the ISO country set');
  assert.equal(isCountryNameValid('United Kingdom'), true);
  assert.equal(isCountryNameValid('united kingdom'), true);
  assert.equal(isCountryNameValid('United States'), true);
  assert.equal(isCountryNameValid('Ghana'), true);
  assert.equal(isCountryNameValid('Germany'), true);

  assert.equal(isCountryNameValid('Foreign'), false);
  assert.equal(isCountryNameValid(''), false);
  assert.equal(isCountryNameValid('Atlantis'), false);
  assert.equal(isCountryNameValid(null), false);
});

test('prembly response normalisation extracts the document country', () => {
  const { normalizePremblyResponse } = require('../config/utils/premblyResponse');

  const verified = normalizePremblyResponse({
    status: 'success',
    data: {
      verification: {
        verification_status: 'VERIFIED',
        data: { country: 'United Kingdom', passport_number: 'A1234567' },
      },
    },
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.document_country, 'United Kingdom');

  const shallow = normalizePremblyResponse({
    verification: { verification_status: 'VERIFIED' },
    issuing_country: 'Germany',
  });
  assert.equal(shallow.verified, true);
  assert.equal(shallow.document_country, 'Germany');

  const none = normalizePremblyResponse({
    verification: { verification_status: 'VERIFIED' },
  });
  assert.equal(none.verified, true);
  assert.equal(none.document_country, null);
});
