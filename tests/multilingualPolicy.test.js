const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAzureTranslatorConfig,
  isAzureTranslatorAvailable,
  getPublicMultilingualConfig,
} = require('../config/utils/multilingualConfig');
const {
  TRANSLATION_AVAILABILITY,
  SPOKEN_NOTIFICATION_DEFAULTS,
  PROMO_RENDER_POLICY,
  canServeMachineTranslation,
  requiresHumanReviewBeforeProduction,
  buildSourceHash,
  assertSourceHashMatch,
  isPromoRenderAllowed,
  canSendToTranslator,
} = require('../config/utils/translationPolicy');

test('Azure Translator config is disabled-safe and never exposes secrets in public config', () => {
  const env = {
    AZURE_TRANSLATOR_ENABLED: 'true',
    AZURE_TRANSLATOR_KEY: 'secret-key',
    AZURE_TRANSLATOR_REGION: 'southafricanorth',
    AZURE_TRANSLATOR_ENDPOINT: 'https://api.cognitive.microsofttranslator.com/',
    PROPERTY_DESCRIPTION_TRANSLATION_ENABLED: 'true',
    MESSAGE_TRANSLATION_ENABLED: 'true',
  };
  const config = getAzureTranslatorConfig(env);
  assert.equal(config.configured, true);
  assert.equal(config.endpoint, 'https://api.cognitive.microsofttranslator.com');
  assert.equal(isAzureTranslatorAvailable(env), true);

  const pub = getPublicMultilingualConfig(env);
  assert.deepEqual(Object.keys(pub), ['features']);
  assert.deepEqual(Object.keys(pub.features).sort(), [
    'messageTranslationEnabled',
    'propertyDescriptionTranslationEnabled',
  ]);
  assert.equal(pub.features.propertyDescriptionTranslationEnabled, true);
  assert.equal(pub.features.messageTranslationEnabled, true);
  const serialized = JSON.stringify(pub);
  for (const leaked of ['secret-key', 'southafricanorth', 'api.cognitive.microsofttranslator.com', '3.0']) {
    assert.equal(serialized.includes(leaked), false);
  }
});

test('translation availability rules match approved policy', () => {
  assert.equal(canServeMachineTranslation('property_description'), true);
  assert.equal(canServeMachineTranslation('landlord_tenant_message'), true);
  assert.equal(canServeMachineTranslation('promotional_video'), false);
  assert.equal(canServeMachineTranslation('payment_announcement'), false);

  assert.equal(requiresHumanReviewBeforeProduction('property_description'), false);
  assert.equal(requiresHumanReviewBeforeProduction('landlord_tenant_message'), false);
  assert.equal(requiresHumanReviewBeforeProduction('promotional_video'), true);
  assert.equal(requiresHumanReviewBeforeProduction('payment_announcement'), true);

  assert.equal(TRANSLATION_AVAILABILITY.property_description.mustProvideOriginal, true);
  assert.equal(TRANSLATION_AVAILABILITY.landlord_tenant_message.mustLabelMachineTranslation, true);
});

test('promo render policy preserves English assets and blocks unapproved non-English renders', () => {
  assert.deepEqual(PROMO_RENDER_POLICY.editions, ['flagship', 'tenant', 'landlord', 'protection']);
  assert.deepEqual(PROMO_RENDER_POLICY.formats, ['9x16', '16x9']);
  assert.equal(PROMO_RENDER_POLICY.maxCombinations, 32);
  assert.equal(PROMO_RENDER_POLICY.preserveExistingEnglishAssets, true);

  assert.equal(isPromoRenderAllowed({ language: 'en', englishAssetExists: true }).allowed, true);
  assert.equal(
    isPromoRenderAllowed({ language: 'ha', scriptApproved: false, nativeAudioApproved: true }).allowed,
    false
  );
  assert.equal(
    isPromoRenderAllowed({ language: 'ig', scriptApproved: true, nativeAudioApproved: true }).allowed,
    true
  );
});

test('messaging translation privacy blocks attachments and non-private contexts', () => {
  assert.deepEqual(canSendToTranslator({ contentType: 'text', hasAttachment: false, isPrivateConversation: true }), {
    allowed: true,
    reason: 'ok',
  });
  assert.equal(canSendToTranslator({ contentType: 'text', hasAttachment: true, isPrivateConversation: true }).allowed, false);
  assert.equal(canSendToTranslator({ contentType: 'text', hasAttachment: false, isPrivateConversation: false }).allowed, false);
});

test('source hash tracking detects original-content changes', () => {
  const original = 'Spacious 2-bedroom apartment in Lekki';
  const hash = buildSourceHash(original);
  assert.equal(assertSourceHashMatch(original, hash).matches, true);
  assert.equal(assertSourceHashMatch(original + ' updated', hash).matches, false);
});

test('spoken notification defaults encode delivery safety rules', () => {
  assert.equal(SPOKEN_NOTIFICATION_DEFAULTS.preventDuplicateAcrossTabs, true);
  assert.equal(SPOKEN_NOTIFICATION_DEFAULTS.preventMultiDeviceSimultaneousWhenPossible, true);
  assert.equal(SPOKEN_NOTIFICATION_DEFAULTS.ignoreExpiredOnReconnect, true);
  assert.equal(SPOKEN_NOTIFICATION_DEFAULTS.playbackDoesNotMarkRead, true);
  assert.equal(SPOKEN_NOTIFICATION_DEFAULTS.userToggleIndependent, true);
  assert.ok(SPOKEN_NOTIFICATION_DEFAULTS.eventTtlMs > 0);
});
