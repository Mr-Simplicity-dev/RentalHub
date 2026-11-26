const db = require('../config/middleware/database');
const {
  getMultilingualFeatureFlags,
  isAzureTranslatorAvailable,
} = require('../config/utils/multilingualConfig');
const {
  buildSourceHash,
  canSendToTranslator,
  canServeMachineTranslation,
  isSupportedAppLanguage,
  normalizeLanguage,
} = require('../config/utils/translationPolicy');
const { getTenantPropertyUnlock } = require('../config/utils/propertyEntitlement');
const { TranslationError, translatePlainText } = require('./azureTranslatorService');

const MAX_SOURCE_LENGTH = 5000;
const MACHINE_TRANSLATION_LABEL = 'Machine translation';
const APPROVED_LISTING_STATUSES = new Set(['available']);
const URL_LIKE_PATTERN = new RegExp(
  [
    '(?:https?|ftp|file|blob)://',
    '\\bwww\\.',
    '//[^\\s<>]+',
    '(?:[a-z0-9-]+\\.)+[a-z]{2,}(?::\\d+)?(?:[/?#]|\\b)',
    '\\bdata:(?:image|audio|video|application|text)/',
    '\\?[^\\s#]*=',
  ].join('|'),
  'i'
);

const translationResult = ({ originalText, translatedText, sourceLanguage, targetLanguage }) => ({
  domain: null,
  original_text: originalText,
  translated_text: translatedText,
  source_language: sourceLanguage,
  target_language: targetLanguage,
  machine_translated: true,
  machine_translation_label: MACHINE_TRANSLATION_LABEL,
  source_hash: buildSourceHash(originalText),
});

const assertTranslationAvailable = ({ domain, feature, env }) => {
  const flags = getMultilingualFeatureFlags(env);
  if (!flags[feature] || !isAzureTranslatorAvailable(env) || !canServeMachineTranslation(domain)) {
    throw new TranslationError('TRANSLATION_UNAVAILABLE', 'Translation is not available.', 503);
  }
};

const resolveTargetLanguage = (value) => {
  const language = normalizeLanguage(value);
  if (!isSupportedAppLanguage(language)) {
    throw new TranslationError('UNSUPPORTED_TARGET_LANGUAGE', 'Unsupported target language.', 400);
  }
  return language;
};

const requirePlainText = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > MAX_SOURCE_LENGTH || /<[^>]*>/.test(text) || URL_LIKE_PATTERN.test(text)) {
    throw new TranslationError('TRANSLATION_INVALID_TEXT', 'No translatable text was found.', 422);
  }
  return text;
};

const isApprovedListing = (property) => (
  Boolean(property)
  && property.is_available === true
  && property.is_verified === true
  && (property.deleted_at === null || property.deleted_at === undefined)
  && APPROVED_LISTING_STATUSES.has(String(property.status || '').trim().toLowerCase())
);

const ownershipGateAllows = async (property, query) => {
  try {
    const result = await query(
      `SELECT enabled, ownership_gate_enabled_at
       FROM feature_flags
       WHERE key = 'require_property_ownership_verification'`
    );
    const flag = result.rows[0];
    if (!flag || flag.enabled !== true) return true;
    const enabledAt = flag.ownership_gate_enabled_at || null;
    if (!enabledAt) return false;
    if (property.ownership_verification_status === 'verified') return true;
    return new Date(property.created_at).getTime() <= new Date(enabledAt).getTime();
  } catch {
    return false;
  }
};

const hasFullDescriptionAccess = async (user, property, query) => {
  if (await isAuthorizedPropertyUser(user, property, query)) return true;
  const userId = Number(user?.id);
  if (!Number.isInteger(userId) || userId <= 0) return false;
  try {
    const result = await getTenantPropertyUnlock({
      userId,
      propertyId: property.id,
      dbQuery: query,
    });
    return result.rows.length > 0;
  } catch {
    return false;
  }
};

// Translation must never trigger the feature-flag or agent-system schema
// initialisation performed by those feature helpers. Read only the rows needed.
const isAuthorizedPropertyUser = async (user, property, query) => {
  try {
    const userId = Number(user?.id);
    if (!Number.isInteger(userId) || userId <= 0) return false;
    if (Number(property.landlord_id) === userId) return true;

    const result = await query(
      `SELECT la.id
       FROM landlord_agents la
       JOIN users u ON u.id = la.agent_user_id
       WHERE la.landlord_user_id = $1
         AND la.agent_user_id = $2
         AND la.status = 'active'
         AND la.can_manage_properties = TRUE
         AND u.user_type = 'agent'
       LIMIT 1`,
      [property.landlord_id, userId]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
};

const translatePropertyDescriptionForUser = async ({ user, propertyId, targetLanguage, deps = {} }) => {
  const env = deps.env || process.env;
  const query = deps.dbQuery || db.query.bind(db);
  const translate = deps.translatePlainText || translatePlainText;
  assertTranslationAvailable({ domain: 'property_description', feature: 'propertyDescriptionTranslationEnabled', env });
  const target = resolveTargetLanguage(targetLanguage);

  const numericId = Number(propertyId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new TranslationError('INVALID_PROPERTY', 'Invalid property.', 400);
  }

  const result = await query(
    `SELECT id, description, landlord_id, is_available, is_verified, status, deleted_at,
            ownership_verification_status, created_at
     FROM properties WHERE id = $1`,
    [numericId]
  );
  const property = result.rows[0];
  if (!property) throw new TranslationError('PROPERTY_NOT_FOUND', 'Property not found.', 404);
  if (!isApprovedListing(property) || !await ownershipGateAllows(property, query)) {
    throw new TranslationError('PROPERTY_TRANSLATION_FORBIDDEN', 'Property not found.', 404);
  }
  if (!await hasFullDescriptionAccess(user, property, query)) {
    throw new TranslationError('PROPERTY_TRANSLATION_FORBIDDEN', 'Property not found.', 404);
  }

  const sourceText = requirePlainText(property.description);
  const permission = canSendToTranslator({ contentType: 'text', hasAttachment: false, isPrivateConversation: true });
  if (!permission.allowed) throw new TranslationError('TRANSLATION_NOT_ALLOWED', 'Translation is not available.', 422);

  const translated = await translate({
    text: sourceText,
    targetLanguage: target,
    env,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });

  return {
    ...translationResult({
      originalText: sourceText,
      translatedText: translated.translatedText,
      sourceLanguage: translated.sourceLanguage,
      targetLanguage: target,
    }),
    domain: 'property_description',
    property_id: numericId,
  };
};

const ATTACHMENT_KEY_PATTERN = /attach|file|media|audio|voice|image|photo|pdf|document|mime|url/i;

const hasAttachmentMetadata = (row) => Object.entries(row || {}).some(([key, value]) => {
  if (key === 'message_text' || value === null || value === undefined || value === '') return false;
  return ATTACHMENT_KEY_PATTERN.test(key);
});

const isLandlordTenantPair = (senderRole, receiverRole) => {
  const roles = [String(senderRole || '').toLowerCase(), String(receiverRole || '').toLowerCase()].sort();
  return roles[0] === 'landlord' && roles[1] === 'tenant';
};

const translateMessageForUser = async ({ user, messageId, targetLanguage, deps = {} }) => {
  const env = deps.env || process.env;
  const query = deps.dbQuery || db.query.bind(db);
  const translate = deps.translatePlainText || translatePlainText;
  assertTranslationAvailable({ domain: 'landlord_tenant_message', feature: 'messageTranslationEnabled', env });
  const target = resolveTargetLanguage(targetLanguage);

  const numericId = Number(messageId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new TranslationError('INVALID_MESSAGE', 'Invalid message.', 400);
  }
  const userId = Number(user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new TranslationError('UNAUTHORIZED', 'Unauthorized.', 401);
  }

  const result = await query(
    `SELECT m.*, s.user_type AS sender_role, r.user_type AS receiver_role
     FROM messages m
     JOIN users s ON s.id = m.sender_id
     JOIN users r ON r.id = m.receiver_id
     WHERE m.id = $1`,
    [numericId]
  );
  const message = result.rows[0];
  if (!message) throw new TranslationError('MESSAGE_NOT_FOUND', 'Message not found.', 404);

  const isParticipant = Number(message.sender_id) === userId || Number(message.receiver_id) === userId;
  if (!isParticipant) throw new TranslationError('MESSAGE_TRANSLATION_FORBIDDEN', 'Message not found.', 404);
  if (!isLandlordTenantPair(message.sender_role, message.receiver_role)) {
    throw new TranslationError('NOT_LANDLORD_TENANT_CONVERSATION', 'Only landlord-tenant messages can be translated.', 403);
  }
  if (String(message.message_type || 'general') !== 'general') {
    throw new TranslationError('UNSUPPORTED_MESSAGE_TYPE', 'This message cannot be translated.', 403);
  }
  if (hasAttachmentMetadata(message)) {
    throw new TranslationError('ATTACHMENT_NOT_TRANSLATABLE', 'Messages with attachments cannot be translated.', 403);
  }

  const sourceText = requirePlainText(message.message_text);
  const permission = canSendToTranslator({ contentType: 'text', hasAttachment: false, isPrivateConversation: true });
  if (!permission.allowed) throw new TranslationError('TRANSLATION_NOT_ALLOWED', 'Translation is not available.', 422);

  const translated = await translate({
    text: sourceText,
    targetLanguage: target,
    env,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });

  return {
    ...translationResult({
      originalText: sourceText,
      translatedText: translated.translatedText,
      sourceLanguage: translated.sourceLanguage,
      targetLanguage: target,
    }),
    domain: 'landlord_tenant_message',
    message_id: numericId,
  };
};

module.exports = {
  MACHINE_TRANSLATION_LABEL,
  TranslationError,
  translateMessageForUser,
  translatePropertyDescriptionForUser,
};
