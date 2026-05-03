const axios = require('axios');

const DEFAULT_TERMII_BASE_URL = 'https://api.ng.termii.com';
const DEFAULT_COUNTRY_CODE = '234';
const TERMII_CHANNELS = new Set(['generic', 'dnd', 'whatsapp']);

const cleanEnv = (value) => String(value || '').trim();

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
    timeout: Number(process.env.TERMII_TIMEOUT_MS || 15000),
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
    status: data.message || data.code || 'sent',
  };
}

exports.sendSMS = async (phoneNumber, message) => {
  const to = normalizePhone(phoneNumber);

  if (!to) {
    return { success: false, provider: 'termii', error: 'Invalid phone number' };
  }

  try {
    const result = await sendViaTermii(to, message);
    const idSuffix = result.messageId ? ` (message id: ${result.messageId})` : '';
    console.log(`[SMS] Sent to ${to} via Termii ${result.route}${idSuffix}`);
    return result;
  } catch (error) {
    const errorMessage = getTermiiErrorMessage(error);
    console.error(`[SMS] Termii send failed for ${to}: ${errorMessage}`);

    return {
      success: false,
      provider: 'termii',
      channel: 'sms',
      error: errorMessage,
    };
  }
};

exports.sendVerificationCode = async (phoneNumber) => {
  const code = Math.floor(100000 + Math.random() * 900000);
  const message = `Your Rental Hub NG verification code is: ${code}. Valid for 10 minutes. Do not share this code.`;

  const result = await exports.sendSMS(phoneNumber, message);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    code,
    channel: result.channel,
    provider: result.provider,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
};
