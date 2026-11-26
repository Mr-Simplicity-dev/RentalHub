const test = require('node:test');
const assert = require('node:assert/strict');
const { translatePropertyDescriptionForUser } = require('../services/translationService');
const { removePropertyContacts } = require('../config/utils/propertyContactPrivacy');

const PRIVATE_VALUES = [
  '08012345678',
  '+234 801 234 5678',
  'owner@example.test',
  '+1 415 555 0132',
];

const env = {
  PROPERTY_DESCRIPTION_TRANSLATION_ENABLED: 'true',
  MESSAGE_TRANSLATION_ENABLED: 'false',
  AZURE_TRANSLATOR_ENABLED: 'true',
  AZURE_TRANSLATOR_KEY: 'synthetic-key',
  AZURE_TRANSLATOR_REGION: 'synthetic-region',
};

const propertyRow = (description) => ({
  id: 12,
  description,
  landlord_id: 7,
  is_available: true,
  is_verified: true,
  status: 'available',
  deleted_at: null,
  ownership_verification_status: 'verified',
  created_at: new Date().toISOString(),
});

const dbQuery = async (sql) => {
  if (sql.includes('FROM feature_flags')) {
    return { rows: [{ enabled: false, ownership_gate_enabled_at: null }] };
  }
  if (sql.includes('FROM properties')) {
    return { rows: [propertyRow('Clean rooms with borehole water. Quiet area. Call 08012345678 or +234 801 234 5678. Email owner@example.test. WhatsApp: +1 415 555 0132.')] };
  }
  return { rows: [] };
};

test('property translation redacts contacts before Azure receives the description', async () => {
  let azureText = null;
  const result = await translatePropertyDescriptionForUser({
    user: { id: 7 },
    propertyId: 12,
    targetLanguage: 'en',
    deps: {
      env,
      dbQuery,
      translatePlainText: async ({ text }) => {
        azureText = text;
        return {
          translatedText: 'Clean rooms with borehole water. Call 08012345678 or owner@example.test.',
          sourceLanguage: 'en',
        };
      },
    },
  });

  assert.equal(typeof azureText, 'string');
  assert.ok(azureText.includes('Clean rooms with borehole water.'));
  for (const value of PRIVATE_VALUES) {
    assert.equal(azureText.includes(value), false, `Azure payload leaked ${value}`);
  }
  for (const value of PRIVATE_VALUES) {
    assert.equal(result.original_text.includes(value), false, `original_text leaked ${value}`);
    assert.equal(result.translated_text.includes(value), false, `translated_text leaked ${value}`);
  }
  assert.equal(result.machine_translated, true);
  assert.equal(result.machine_translation_label, 'Machine translation');
});

test('the shared privacy helper covers translated response fields', () => {
  const result = removePropertyContacts({
    original_text: 'Call 08012345678 now',
    translated_text: 'Email owner@example.test now',
  });
  assert.equal(result.original_text.includes('08012345678'), false);
  assert.equal(result.translated_text.includes('owner@example.test'), false);
});
