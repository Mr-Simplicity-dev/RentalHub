const DEFAULT_TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';
const DEFAULT_TRANSLATOR_API_VERSION = '3.0';

const asBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

const asPositiveInt = (value, defaultValue) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

const getAzureTranslatorConfig = (env = process.env) => {
  const key = String(env.AZURE_TRANSLATOR_KEY || '').trim();
  const region = String(env.AZURE_TRANSLATOR_REGION || '').trim();
  const endpoint = String(env.AZURE_TRANSLATOR_ENDPOINT || DEFAULT_TRANSLATOR_ENDPOINT).trim().replace(/\/+$/, '');
  const apiVersion = String(env.AZURE_TRANSLATOR_API_VERSION || DEFAULT_TRANSLATOR_API_VERSION).trim();
  const enabled = asBoolean(env.AZURE_TRANSLATOR_ENABLED, true);
  const configured = Boolean(key && region && endpoint);

  return {
    enabled,
    configured,
    key,
    region,
    endpoint,
    apiVersion,
    timeoutMs: asPositiveInt(env.AZURE_TRANSLATOR_TIMEOUT_MS, 15000),
    maxRetries: Math.min(asPositiveInt(env.AZURE_TRANSLATOR_MAX_RETRIES, 2), 5),
  };
};

const isAzureTranslatorAvailable = (env = process.env) => {
  const config = getAzureTranslatorConfig(env);
  return config.enabled && config.configured;
};

const getAzureSpeechConfig = (env = process.env) => {
  const key = String(env.AZURE_SPEECH_KEY || '').trim();
  const region = String(env.AZURE_SPEECH_REGION || '').trim();
  return {
    configured: Boolean(key && region),
    region,
  };
};

const getMultilingualFeatureFlags = (env = process.env) => ({
  promoMultilangEnabled: asBoolean(env.PROMO_MULTILANG_ENABLED, false),
  spokenNotificationsEnabled: asBoolean(env.SPOKEN_NOTIFICATIONS_ENABLED, false),
  propertyDescriptionTranslationEnabled: asBoolean(env.PROPERTY_DESCRIPTION_TRANSLATION_ENABLED, false),
  messageTranslationEnabled: asBoolean(env.MESSAGE_TRANSLATION_ENABLED, false),
});

const getPublicMultilingualConfig = (env = process.env) => {
  const flags = getMultilingualFeatureFlags(env);
  return {
    features: {
      propertyDescriptionTranslationEnabled: flags.propertyDescriptionTranslationEnabled,
      messageTranslationEnabled: flags.messageTranslationEnabled,
    },
  };
};

module.exports = {
  DEFAULT_TRANSLATOR_ENDPOINT,
  DEFAULT_TRANSLATOR_API_VERSION,
  asBoolean,
  asPositiveInt,
  getAzureTranslatorConfig,
  isAzureTranslatorAvailable,
  getAzureSpeechConfig,
  getMultilingualFeatureFlags,
  getPublicMultilingualConfig,
};
