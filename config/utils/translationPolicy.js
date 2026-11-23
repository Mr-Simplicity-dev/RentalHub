const crypto = require('crypto');

const SUPPORTED_PROMO_LANGUAGES = Object.freeze(['en', 'ha', 'ig', 'yo']);
const SUPPORTED_APP_LANGUAGES = Object.freeze(['en', 'ru', 'fr', 'ar', 'zh', 'ha', 'ig', 'yo']);

const TRANSLATION_AVAILABILITY = Object.freeze({
  property_description: Object.freeze({
    mode: 'on_demand_machine',
    requiresHumanReviewBeforeProduction: false,
    allowMachineDraft: true,
    mustLabelMachineTranslation: true,
    mustProvideOriginal: true,
  }),
  landlord_tenant_message: Object.freeze({
    mode: 'on_demand_machine',
    requiresHumanReviewBeforeProduction: false,
    allowMachineDraft: true,
    mustLabelMachineTranslation: true,
    mustProvideOriginal: true,
  }),
  promotional_video: Object.freeze({
    mode: 'human_reviewed_published_asset',
    requiresHumanReviewBeforeProduction: true,
    requiresApprovedNativeAudio: true,
    allowMachineDraft: false,
    mustLabelMachineTranslation: false,
  }),
  payment_announcement: Object.freeze({
    mode: 'approved_fixed_script',
    requiresHumanReviewBeforeProduction: true,
    requiresApprovedRecording: true,
    allowMachineDraft: false,
    mustLabelMachineTranslation: false,
  }),
});

const SPOKEN_NOTIFICATION_DEFAULTS = Object.freeze({
  eventTtlMs: 15 * 60 * 1000,
  ackGraceMs: 2 * 60 * 1000,
  maxQueuePerUser: 20,
  preventDuplicateAcrossTabs: true,
  preventMultiDeviceSimultaneousWhenPossible: true,
  ignoreExpiredOnReconnect: true,
  playbackDoesNotMarkRead: true,
  userToggleIndependent: true,
});

const PROMO_RENDER_POLICY = Object.freeze({
  editions: Object.freeze(['flagship', 'tenant', 'landlord', 'protection']),
  formats: Object.freeze(['9x16', '16x9']),
  languages: Object.freeze(['en', 'ha', 'ig', 'yo']),
  maxCombinations: 32,
  preserveExistingEnglishAssets: true,
  renderOnlyWhenScriptAndApprovedAudioAvailable: true,
});

const normalizeLanguage = (value) => {
  const normalized = String(value || '').trim().toLowerCase().split('-')[0];
  return normalized || 'en';
};

const isSupportedAppLanguage = (value) => SUPPORTED_APP_LANGUAGES.includes(normalizeLanguage(value));
const isSupportedPromoLanguage = (value) => SUPPORTED_PROMO_LANGUAGES.includes(normalizeLanguage(value));

const getTranslationAvailability = (domain) => TRANSLATION_AVAILABILITY[domain] || null;

const canServeMachineTranslation = (domain) => {
  const policy = getTranslationAvailability(domain);
  return Boolean(policy && policy.allowMachineDraft);
};

const requiresHumanReviewBeforeProduction = (domain) => {
  const policy = getTranslationAvailability(domain);
  return Boolean(policy && policy.requiresHumanReviewBeforeProduction);
};

const buildSourceHash = (value) => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

const assertSourceHashMatch = (sourceValue, expectedHash) => {
  const actual = buildSourceHash(sourceValue);
  return {
    matches: actual === String(expectedHash || ''),
    actual,
    expected: String(expectedHash || ''),
  };
};

const isPromoRenderAllowed = ({ language, scriptApproved, nativeAudioApproved, englishAssetExists = false }) => {
  const lang = normalizeLanguage(language);
  if (!isSupportedPromoLanguage(lang)) {
    return { allowed: false, reason: 'unsupported_language' };
  }
  if (lang === 'en' && englishAssetExists) {
    return { allowed: true, reason: 'existing_english_asset' };
  }
  if (lang !== 'en' && (!scriptApproved || !nativeAudioApproved)) {
    return { allowed: false, reason: 'script_or_native_audio_not_approved' };
  }
  return { allowed: true, reason: 'approved' };
};

const canSendToTranslator = ({ contentType = 'text', hasAttachment = false, isPrivateConversation = true }) => {
  if (hasAttachment) {
    return { allowed: false, reason: 'attachments_not_sent_to_translator' };
  }
  if (!isPrivateConversation) {
    return { allowed: false, reason: 'private_conversation_required' };
  }
  if (!['text', 'plain_text'].includes(String(contentType || 'text'))) {
    return { allowed: false, reason: 'unsupported_content_type' };
  }
  return { allowed: true, reason: 'ok' };
};

module.exports = {
  SUPPORTED_PROMO_LANGUAGES,
  SUPPORTED_APP_LANGUAGES,
  TRANSLATION_AVAILABILITY,
  SPOKEN_NOTIFICATION_DEFAULTS,
  PROMO_RENDER_POLICY,
  normalizeLanguage,
  isSupportedAppLanguage,
  isSupportedPromoLanguage,
  getTranslationAvailability,
  canServeMachineTranslation,
  requiresHumanReviewBeforeProduction,
  buildSourceHash,
  assertSourceHashMatch,
  isPromoRenderAllowed,
  canSendToTranslator,
};
