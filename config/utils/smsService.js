const axios = require('axios');
const crypto = require('crypto');
const db = require('../middleware/database');

const DEFAULT_TERMII_BASE_URL = 'https://api.ng.termii.com';
const DEFAULT_TWILIO_BASE_URL = 'https://api.twilio.com';
const DEFAULT_COUNTRY_CODE = '234';
const DEFAULT_SMS_TRACKING_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SMS_FALLBACK_AFTER_SECONDS = 120;
const TERMII_CHANNELS = new Set(['generic', 'dnd', 'whatsapp']);
const SMS_PROVIDERS = ['termii', 'twilio'];

let smsDeliverySchemaReady = false;

const cleanEnv = (value) => String(value || '').trim();

function isEnabled(value, defaultValue = false) {
  const normalized = cleanEnv(value).toLowerCase();
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

function normalizeTermiiChannel(channel) {
  const normalized = cleanEnv(channel || 'generic').toLowerCase();

  if (!TERMII_CHANNELS.has(normalized)) {
    throw new Error(`Invalid TERMII_CHANNEL "${channel}". Use generic, dnd, or whatsapp.`);
  }

  return normalized;
}

function getTermiiConfig() {
  const apiKey = cleanEnv(process.env.TERMII_API_KEY);
  const senderId = cleanEnv(process.env.TERMII_SENDER_ID || process.env.TERMII_FROM);

  if (!apiKey) {
    throw new Error('TERMII_API_KEY is not set in environment variables');
  }

  if (!senderId) {
    throw new Error('TERMII_SENDER_ID is not set in environment variables');
  }

  return {
    apiKey,
    senderId,
    baseUrl: cleanEnv(process.env.TERMII_BASE_URL || DEFAULT_TERMII_BASE_URL).replace(/\/+$/, ''),
    channel: normalizeTermiiChannel(process.env.TERMII_CHANNEL || 'generic'),
    timeout: Number(process.env.TERMII_TIMEOUT_MS || process.env.SMS_TIMEOUT_MS || 15000),
  };
}

function normalizeProviderName(provider) {
  const normalized = cleanEnv(provider).toLowerCase();
  if (normalized === 'termmi') return 'termii';
  return normalized;
}

function getSmsProviderOrder() {
  const configuredOrder = cleanEnv(process.env.SMS_PROVIDER_ORDER || process.env.SMS_PROVIDERS);
  const primaryProvider = normalizeProviderName(
    process.env.SMS_PRIMARY_PROVIDER || process.env.SMS_PROVIDER || 'termii'
  );

  const order = configuredOrder
    ? configuredOrder
        .split(',')
        .map(normalizeProviderName)
        .filter((provider) => SMS_PROVIDERS.includes(provider))
    : [
        SMS_PROVIDERS.includes(primaryProvider) ? primaryProvider : 'termii',
        ...SMS_PROVIDERS.filter((provider) => provider !== primaryProvider),
      ];

  const uniqueOrder = [];
  order.forEach((provider) => {
    if (!uniqueOrder.includes(provider)) {
      uniqueOrder.push(provider);
    }
  });

  SMS_PROVIDERS.forEach((provider) => {
    if (!uniqueOrder.includes(provider)) {
      uniqueOrder.push(provider);
    }
  });

  return uniqueOrder;
}

function getTwilioConfig() {
  const accountSid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const authToken = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
  const from = cleanEnv(process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER);
  const messagingServiceSid = cleanEnv(process.env.TWILIO_MESSAGING_SERVICE_SID);

  if (!accountSid) {
    throw new Error('TWILIO_ACCOUNT_SID is not set in environment variables');
  }

  if (!authToken) {
    throw new Error('TWILIO_AUTH_TOKEN is not set in environment variables');
  }

  if (!from && !messagingServiceSid) {
    throw new Error('TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID is not set in environment variables');
  }

  return {
    accountSid,
    authToken,
    from,
    messagingServiceSid,
    baseUrl: cleanEnv(process.env.TWILIO_BASE_URL || DEFAULT_TWILIO_BASE_URL).replace(/\/+$/, ''),
    timeout: Number(process.env.TWILIO_TIMEOUT_MS || process.env.SMS_TIMEOUT_MS || 15000),
  };
}

/**
 * Termii expects international phone numbers without a leading "+".
 * Nigerian local numbers like 08012345678 are converted to 2348012345678.
 */
function normalizePhone(phone) {
  if (!phone) return null;

  let digits = String(phone).trim();

  if (!digits) return null;

  digits = digits.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  digits = digits.replace(/\D/g, '');

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  const countryCode = cleanEnv(process.env.SMS_DEFAULT_COUNTRY_CODE || DEFAULT_COUNTRY_CODE).replace(/\D/g, '');

  if (countryCode && digits.startsWith('0')) {
    digits = `${countryCode}${digits.slice(1)}`;
  } else if (countryCode === '234' && /^[789]\d{9}$/.test(digits)) {
    digits = `234${digits}`;
  }

  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function getSmsStatusCallbackBaseUrl() {
  const configuredUrl = cleanEnv(
    process.env.SMS_STATUS_CALLBACK_BASE_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.BACKEND_URL ||
      process.env.APP_PUBLIC_URL
  );

  return configuredUrl ? configuredUrl.replace(/\/+$/, '') : null;
}

function addQueryParam(url, key, value) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function getSmsStatusCallbackUrl(provider) {
  const callbackBaseUrl = getSmsStatusCallbackBaseUrl();
  if (!callbackBaseUrl) return null;

  const apiBaseUrl = callbackBaseUrl.endsWith('/api')
    ? callbackBaseUrl
    : `${callbackBaseUrl}/api`;
  let callbackUrl = `${apiBaseUrl}/sms/status/${encodeURIComponent(provider)}`;
  const webhookSecret = cleanEnv(process.env.SMS_WEBHOOK_SECRET);

  if (webhookSecret) {
    callbackUrl = addQueryParam(callbackUrl, 'token', webhookSecret);
  }

  return callbackUrl;
}

function normalizeDeliveryStatus(status) {
  const normalized = cleanEnv(status).toLowerCase().replace(/[\s-]+/g, '_');

  if (!normalized || normalized === 'unknown') {
    return 'pending';
  }

  if (
    normalized.includes('undelivered') ||
    normalized.includes('not_delivered') ||
    normalized.includes('failed') ||
    normalized.includes('failure') ||
    normalized.includes('rejected') ||
    normalized.includes('expired') ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled') ||
    normalized.includes('error') ||
    normalized.includes('insufficient') ||
    normalized.includes('unroutable') ||
    normalized === 'dnd'
  ) {
    return 'failed';
  }

  if (normalized.includes('delivered') || normalized === 'read') {
    return 'delivered';
  }

  return 'pending';
}

async function ensureSmsDeliverySchema() {
  if (smsDeliverySchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS sms_delivery_attempts (
      id SERIAL PRIMARY KEY,
      delivery_group_id VARCHAR(64) NOT NULL,
      purpose VARCHAR(80) NOT NULL DEFAULT 'sms',
      phone_number VARCHAR(32) NOT NULL,
      message TEXT NOT NULL,
      verification_code VARCHAR(20),
      provider VARCHAR(30) NOT NULL,
      provider_order INTEGER NOT NULL DEFAULT 1,
      provider_message_id VARCHAR(160),
      provider_status VARCHAR(120),
      normalized_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      provider_response JSONB,
      last_error TEXT,
      fallback_triggered BOOLEAN NOT NULL DEFAULT FALSE,
      fallback_of INTEGER REFERENCES sms_delivery_attempts(id) ON DELETE SET NULL,
      fallback_reason TEXT,
      expires_at TIMESTAMP NOT NULL,
      status_received_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sms_delivery_attempts_group
      ON sms_delivery_attempts (delivery_group_id, id);

    CREATE INDEX IF NOT EXISTS idx_sms_delivery_attempts_provider_message
      ON sms_delivery_attempts (provider, provider_message_id)
      WHERE provider_message_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_sms_delivery_attempts_pending
      ON sms_delivery_attempts (normalized_status, fallback_triggered, expires_at, created_at);
  `);

  smsDeliverySchemaReady = true;
}

function safeJsonStringify(value) {
  if (value === undefined) return null;

  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({
      error: 'Provider response could not be serialized',
    });
  }
}

function buildTrackingContext(options = {}) {
  const trackingDisabled =
    options.trackDelivery === false ||
    isEnabled(process.env.SMS_DELIVERY_TRACKING_DISABLED, false);

  if (trackingDisabled) {
    return null;
  }

  let expiresAt = options.expiresAt ? new Date(options.expiresAt) : null;

  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    expiresAt = new Date(Date.now() + DEFAULT_SMS_TRACKING_TTL_MS);
  }

  return {
    deliveryGroupId: cleanEnv(options.deliveryGroupId) || crypto.randomUUID(),
    purpose: cleanEnv(options.purpose || 'sms') || 'sms',
    verificationCode:
      options.verificationCode === undefined || options.verificationCode === null
        ? null
        : String(options.verificationCode),
    expiresAt,
    fallbackOf: options.fallbackOf || null,
    fallbackReason: cleanEnv(options.fallbackReason || ''),
    attemptedProviders: Array.isArray(options.attemptedProviders)
      ? options.attemptedProviders.map(normalizeProviderName).filter((provider) => SMS_PROVIDERS.includes(provider))
      : [],
  };
}

async function recordSmsAttempt({
  deliveryGroupId,
  purpose,
  phoneNumber,
  message,
  verificationCode = null,
  provider,
  providerOrder = 1,
  providerMessageId = null,
  providerStatus = 'pending',
  normalizedStatus = 'pending',
  providerResponse,
  lastError = null,
  fallbackOf = null,
  fallbackReason = null,
  expiresAt,
}) {
  await ensureSmsDeliverySchema();

  const result = await db.query(
    `INSERT INTO sms_delivery_attempts (
       delivery_group_id, purpose, phone_number, message, verification_code,
       provider, provider_order, provider_message_id, provider_status,
       normalized_status, provider_response, last_error, fallback_of,
       fallback_reason, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
     RETURNING id`,
    [
      deliveryGroupId,
      purpose,
      phoneNumber,
      message,
      verificationCode,
      provider,
      providerOrder,
      providerMessageId,
      providerStatus,
      normalizedStatus,
      safeJsonStringify(providerResponse),
      lastError,
      fallbackOf,
      fallbackReason,
      expiresAt,
    ]
  );

  return result.rows[0];
}

async function recordSmsAttemptSafely(attempt) {
  try {
    return await recordSmsAttempt(attempt);
  } catch (error) {
    console.error('[SMS] Failed to record delivery attempt:', error.message);
    return null;
  }
}

function readPayloadValue(payload, keys) {
  if (!payload || typeof payload !== 'object') return null;

  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      return payload[key];
    }
  }

  const lowerCaseMap = Object.keys(payload).reduce((acc, key) => {
    acc[key.toLowerCase()] = payload[key];
    return acc;
  }, {});

  for (const key of keys) {
    const value = lowerCaseMap[key.toLowerCase()];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  for (const nestedKey of ['data', 'event', 'payload']) {
    const nestedPayload = payload[nestedKey];
    if (nestedPayload && typeof nestedPayload === 'object') {
      const value = readPayloadValue(nestedPayload, keys);
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
  }

  return null;
}

function extractProviderMessageId(provider, payload) {
  if (provider === 'twilio') {
    return cleanEnv(
      readPayloadValue(payload, ['MessageSid', 'SmsSid', 'message_sid', 'sms_sid', 'sid'])
    );
  }

  if (provider === 'termii') {
    return cleanEnv(
      readPayloadValue(payload, ['message_id', 'messageId', 'messageID', 'messageid', 'id'])
    );
  }

  return cleanEnv(readPayloadValue(payload, ['message_id', 'messageId', 'MessageSid', 'sid']));
}

function extractProviderStatus(provider, payload) {
  const providerError = extractProviderError(provider, payload);

  if (provider === 'twilio') {
    return cleanEnv(
      readPayloadValue(payload, ['MessageStatus', 'SmsStatus', 'message_status', 'sms_status', 'status'])
    ) || (providerError ? 'failed' : 'unknown');
  }

  if (provider === 'termii') {
    return cleanEnv(
      readPayloadValue(payload, ['status', 'message_status', 'delivery_status', 'dlr_status', 'dlrStatus'])
    ) || (providerError ? 'failed' : 'unknown');
  }

  return cleanEnv(readPayloadValue(payload, ['status', 'message_status'])) || (providerError ? 'failed' : 'unknown');
}

function extractProviderError(provider, payload) {
  const errorCode = readPayloadValue(payload, ['ErrorCode', 'error_code', 'code']);
  const errorMessage = readPayloadValue(payload, ['ErrorMessage', 'error_message', 'error', 'reason', 'failure_reason']);

  if (errorCode && errorMessage) {
    return `${errorCode}: ${errorMessage}`;
  }

  if (errorMessage) {
    return String(errorMessage);
  }

  if (provider === 'twilio' && errorCode) {
    return `Twilio error ${errorCode}`;
  }

  return null;
}

function getTermiiErrorMessage(error) {
  const responseData = error?.response?.data;

  if (typeof responseData === 'string' && responseData.trim()) {
    return responseData.trim();
  }

  if (responseData?.message) {
    return responseData.message;
  }

  if (responseData?.error) {
    return responseData.error;
  }

  if (error?.code === 'ECONNABORTED') {
    return 'Termii request timed out';
  }

  return error?.message || 'Termii SMS send failed';
}

function getTwilioErrorMessage(error) {
  const responseData = error?.response?.data;

  if (typeof responseData === 'string' && responseData.trim()) {
    return responseData.trim();
  }

  if (responseData?.message) {
    return responseData.message;
  }

  if (responseData?.error_message) {
    return responseData.error_message;
  }

  if (error?.code === 'ECONNABORTED') {
    return 'Twilio request timed out';
  }

  return error?.message || 'Twilio SMS send failed';
}

async function sendViaTermii(to, message) {
  const config = getTermiiConfig();
  const text = String(message || '').trim();

  if (!text) {
    throw new Error('SMS message is required');
  }

  const response = await axios.post(
    `${config.baseUrl}/api/sms/send`,
    {
      api_key: config.apiKey,
      to,
      from: config.senderId,
      sms: text,
      type: 'plain',
      channel: config.channel,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: config.timeout,
    }
  );

  const data = response.data || {};
  const responseCode = cleanEnv(data.code).toLowerCase();

  if (responseCode && responseCode !== 'ok') {
    throw new Error(data.message || `Termii returned "${data.code}"`);
  }

  return {
    success: true,
    provider: 'termii',
    channel: 'sms',
    route: config.channel,
    to,
    messageId: data.message_id || null,
    status: data.message || data.code || 'accepted',
    providerResponse: data,
  };
}

async function sendViaTwilio(to, message, options = {}) {
  const config = getTwilioConfig();
  const text = String(message || '').trim();

  if (!text) {
    throw new Error('SMS message is required');
  }

  const twilioTo = `+${to}`;
  const body = new URLSearchParams({
    To: twilioTo,
    Body: text,
  });
  const statusCallbackUrl = cleanEnv(options.statusCallbackUrl || getSmsStatusCallbackUrl('twilio'));

  if (config.messagingServiceSid) {
    body.append('MessagingServiceSid', config.messagingServiceSid);
  } else {
    body.append('From', config.from);
  }

  if (statusCallbackUrl) {
    body.append('StatusCallback', statusCallbackUrl);
  }

  const response = await axios.post(
    `${config.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    body.toString(),
    {
      auth: {
        username: config.accountSid,
        password: config.authToken,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: config.timeout,
    }
  );

  const data = response.data || {};

  return {
    success: true,
    provider: 'twilio',
    channel: 'sms',
    route: config.messagingServiceSid ? 'messaging_service' : 'from_number',
    to: twilioTo,
    messageId: data.sid || null,
    status: data.status || 'queued',
    providerResponse: data,
  };
}

async function sendViaProvider(provider, to, message, options = {}) {
  if (provider === 'termii') {
    return sendViaTermii(to, message, options);
  }

  if (provider === 'twilio') {
    return sendViaTwilio(to, message, options);
  }

  throw new Error(`Unsupported SMS provider "${provider}"`);
}

function getProviderErrorMessage(provider, error) {
  if (provider === 'termii') return getTermiiErrorMessage(error);
  if (provider === 'twilio') return getTwilioErrorMessage(error);
  return error?.message || `${provider} SMS send failed`;
}

async function sendSMS(phoneNumber, message, options = {}) {
  const to = normalizePhone(phoneNumber);
  const text = String(message || '').trim();

  if (!to) {
    return { success: false, provider: 'none', error: 'Invalid phone number' };
  }

  if (!text) {
    return { success: false, provider: 'none', error: 'SMS message is required' };
  }

  const providerOrder = getSmsProviderOrder();
  const trackingContext = buildTrackingContext(options);
  const alreadyAttempted = trackingContext?.attemptedProviders || [];
  const failures = [];
  let providerOrderNumber = alreadyAttempted.length;

  for (const provider of providerOrder) {
    if (alreadyAttempted.includes(provider)) {
      continue;
    }

    providerOrderNumber += 1;

    try {
      const result = await sendViaProvider(provider, to, text, {
        statusCallbackUrl: getSmsStatusCallbackUrl(provider),
      });
      const idSuffix = result.messageId ? ` (message id: ${result.messageId})` : '';
      console.log(`[SMS] Sent to ${result.to || to} via ${provider} ${result.route || 'sms'}${idSuffix}`);

      if (trackingContext) {
        const attempt = await recordSmsAttemptSafely({
          deliveryGroupId: trackingContext.deliveryGroupId,
          purpose: trackingContext.purpose,
          phoneNumber: to,
          message: text,
          verificationCode: trackingContext.verificationCode,
          provider,
          providerOrder: providerOrderNumber,
          providerMessageId: result.messageId,
          providerStatus: result.status,
          normalizedStatus: 'pending',
          providerResponse: result.providerResponse,
          fallbackOf: trackingContext.fallbackOf,
          fallbackReason: trackingContext.fallbackReason || null,
          expiresAt: trackingContext.expiresAt,
        });

        result.delivery_group_id = trackingContext.deliveryGroupId;
        result.delivery_attempt_id = attempt?.id || null;
      }

      if (failures.length > 0) {
        result.fallback_used = true;
        result.failed_providers = failures;
      }

      delete result.providerResponse;
      return result;
    } catch (error) {
      const errorMessage = getProviderErrorMessage(provider, error);
      failures.push({ provider, error: errorMessage });
      console.error(`[SMS] ${provider} send failed for ${to}: ${errorMessage}`);

      if (trackingContext) {
        await recordSmsAttemptSafely({
          deliveryGroupId: trackingContext.deliveryGroupId,
          purpose: trackingContext.purpose,
          phoneNumber: to,
          message: text,
          verificationCode: trackingContext.verificationCode,
          provider,
          providerOrder: providerOrderNumber,
          providerStatus: 'immediate_failed',
          normalizedStatus: 'failed',
          providerResponse: error?.response?.data || { message: errorMessage },
          lastError: errorMessage,
          fallbackOf: trackingContext.fallbackOf,
          fallbackReason: trackingContext.fallbackReason || null,
          expiresAt: trackingContext.expiresAt,
        });
      }
    }
  }

  return {
    success: false,
    provider: providerOrder[0] || 'none',
    channel: 'sms',
    error: failures.map((failure) => `${failure.provider}: ${failure.error}`).join(' | ') || 'All SMS providers failed',
    failed_providers: failures,
    delivery_group_id: trackingContext?.deliveryGroupId,
  };
}

async function triggerSmsFallbackForAttempt(attempt, reason) {
  const expiresAt = new Date(attempt.expires_at).getTime();

  if (!expiresAt || expiresAt <= Date.now()) {
    return {
      success: false,
      fallbackSent: false,
      reason: 'expired',
    };
  }

  const marked = await db.query(
    `UPDATE sms_delivery_attempts
     SET fallback_triggered = TRUE,
         fallback_reason = COALESCE($2, fallback_reason),
         updated_at = NOW()
     WHERE id = $1
       AND fallback_triggered = FALSE
     RETURNING id`,
    [attempt.id, reason]
  );

  if (!marked.rows.length) {
    return {
      success: true,
      fallbackSent: false,
      reason: 'already_triggered',
    };
  }

  const attemptedResult = await db.query(
    `SELECT provider
     FROM sms_delivery_attempts
     WHERE delivery_group_id = $1
     ORDER BY id ASC`,
    [attempt.delivery_group_id]
  );
  const attemptedProviders = attemptedResult.rows.map((row) => normalizeProviderName(row.provider));
  const remainingProviders = getSmsProviderOrder().filter((provider) => !attemptedProviders.includes(provider));
  const failures = [];

  if (!remainingProviders.length) {
    return {
      success: false,
      fallbackSent: false,
      reason: 'no_provider_left',
    };
  }

  for (const provider of remainingProviders) {
    const providerOrderNumber = attemptedProviders.length + failures.length + 1;

    try {
      const result = await sendViaProvider(provider, attempt.phone_number, attempt.message, {
        statusCallbackUrl: getSmsStatusCallbackUrl(provider),
      });

      const fallbackRecord = await recordSmsAttemptSafely({
        deliveryGroupId: attempt.delivery_group_id,
        purpose: attempt.purpose,
        phoneNumber: attempt.phone_number,
        message: attempt.message,
        verificationCode: attempt.verification_code,
        provider,
        providerOrder: providerOrderNumber,
        providerMessageId: result.messageId,
        providerStatus: result.status,
        normalizedStatus: 'pending',
        providerResponse: result.providerResponse,
        fallbackOf: attempt.id,
        fallbackReason: reason,
        expiresAt: attempt.expires_at,
      });

      console.log(
        `[SMS] Delivery fallback sent via ${provider} for group ${attempt.delivery_group_id}`
      );

      return {
        success: true,
        fallbackSent: true,
        provider,
        deliveryAttemptId: fallbackRecord?.id || null,
      };
    } catch (error) {
      const errorMessage = getProviderErrorMessage(provider, error);
      failures.push({ provider, error: errorMessage });
      console.error(`[SMS] Delivery fallback via ${provider} failed: ${errorMessage}`);

      await recordSmsAttemptSafely({
        deliveryGroupId: attempt.delivery_group_id,
        purpose: attempt.purpose,
        phoneNumber: attempt.phone_number,
        message: attempt.message,
        verificationCode: attempt.verification_code,
        provider,
        providerOrder: providerOrderNumber,
        providerStatus: 'fallback_failed',
        normalizedStatus: 'failed',
        providerResponse: error?.response?.data || { message: errorMessage },
        lastError: errorMessage,
        fallbackOf: attempt.id,
        fallbackReason: reason,
        expiresAt: attempt.expires_at,
      });
    }
  }

  return {
    success: false,
    fallbackSent: false,
    reason: 'fallback_failed',
    failedProviders: failures,
  };
}

async function processSmsDeliveryStatus(provider, payload = {}) {
  const normalizedProvider = normalizeProviderName(provider);

  if (!SMS_PROVIDERS.includes(normalizedProvider)) {
    return {
      success: false,
      tracked: false,
      message: `Unsupported SMS provider "${provider}"`,
    };
  }

  const providerMessageId = extractProviderMessageId(normalizedProvider, payload);
  const providerStatus = extractProviderStatus(normalizedProvider, payload);
  const normalizedStatus = normalizeDeliveryStatus(providerStatus);
  const providerError = extractProviderError(normalizedProvider, payload);

  if (!providerMessageId) {
    return {
      success: true,
      tracked: false,
      message: 'SMS status received without a provider message id',
    };
  }

  await ensureSmsDeliverySchema();

  const existingResult = await db.query(
    `SELECT *
     FROM sms_delivery_attempts
     WHERE provider = $1
       AND provider_message_id = $2
     ORDER BY id DESC
     LIMIT 1`,
    [normalizedProvider, providerMessageId]
  );

  if (!existingResult.rows.length) {
    return {
      success: true,
      tracked: false,
      message: 'No matching SMS delivery attempt was found',
    };
  }

  const attempt = existingResult.rows[0];

  await db.query(
    `UPDATE sms_delivery_attempts
     SET provider_status = $1,
         normalized_status = $2,
         provider_response = $3::jsonb,
         last_error = COALESCE($4, last_error),
         status_received_at = NOW(),
         updated_at = NOW()
     WHERE id = $5`,
    [
      providerStatus,
      normalizedStatus,
      safeJsonStringify(payload),
      providerError,
      attempt.id,
    ]
  );

  let fallback = null;

  if (normalizedStatus === 'failed') {
    fallback = await triggerSmsFallbackForAttempt(
      attempt,
      `delivery_status:${providerStatus || 'failed'}`
    );
  }

  return {
    success: true,
    tracked: true,
    provider: normalizedProvider,
    providerMessageId,
    status: normalizedStatus,
    fallback,
  };
}

async function processPendingSmsFallbacks() {
  if (!isEnabled(process.env.SMS_TIMEOUT_FALLBACK_ENABLED, true)) {
    return {
      success: true,
      disabled: true,
      checked: 0,
      fallbackSent: 0,
    };
  }

  await ensureSmsDeliverySchema();

  const fallbackAfterSeconds = Math.max(
    Number(process.env.SMS_FALLBACK_AFTER_SECONDS || DEFAULT_SMS_FALLBACK_AFTER_SECONDS),
    30
  );
  const limit = Math.max(Number(process.env.SMS_FALLBACK_SCAN_LIMIT || 25), 1);

  const candidatesResult = await db.query(
    `SELECT a.*
     FROM sms_delivery_attempts a
     WHERE a.normalized_status = 'pending'
       AND a.status_received_at IS NULL
       AND a.fallback_triggered = FALSE
       AND a.expires_at > NOW()
       AND a.created_at <= NOW() - ($1::int * INTERVAL '1 second')
       AND NOT EXISTS (
         SELECT 1
         FROM sms_delivery_attempts newer
         WHERE newer.delivery_group_id = a.delivery_group_id
           AND newer.id > a.id
       )
     ORDER BY a.created_at ASC
     LIMIT $2`,
    [fallbackAfterSeconds, limit]
  );

  const summary = {
    success: true,
    checked: candidatesResult.rows.length,
    fallbackSent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const candidate of candidatesResult.rows) {
    try {
      const fallback = await triggerSmsFallbackForAttempt(
        candidate,
        `timeout:${fallbackAfterSeconds}s`
      );

      if (fallback.fallbackSent) {
        summary.fallbackSent += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error('[SMS] Pending fallback check failed:', error.message);
    }
  }

  return summary;
}

async function sendVerificationCode(phoneNumber) {
  const code = Math.floor(100000 + Math.random() * 900000);
  const expiresAt = Date.now() + DEFAULT_SMS_TRACKING_TTL_MS;
  const message = `Your Rental Hub NG verification code is: ${code}. Valid for 10 minutes. Do not share this code.`;

  const result = await sendSMS(phoneNumber, message, {
    purpose: 'otp_verification',
    verificationCode: code,
    expiresAt,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    code,
    channel: result.channel,
    provider: result.provider,
    fallback_used: result.fallback_used === true,
    delivery_group_id: result.delivery_group_id,
    delivery_attempt_id: result.delivery_attempt_id,
    expiresAt,
  };
}

module.exports = {
  sendSMS,
  sendVerificationCode,
  normalizePhone,
  getSmsProviderOrder,
  getSmsStatusCallbackUrl,
  ensureSmsDeliverySchema,
  processSmsDeliveryStatus,
  processPendingSmsFallbacks,
};
