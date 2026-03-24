const twilio = require('twilio');

// ─── Twilio client (lazy-initialised so missing keys fail at call time, not boot) ──
let _client = null;

const getClient = () => {
  if (_client) return _client;

  if (!process.env.TWILIO_ACCOUNT_SID) {
    throw new Error('TWILIO_ACCOUNT_SID is not set in environment variables');
  }
  if (!process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('TWILIO_AUTH_TOKEN is not set in environment variables');
  }

  _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
};

// ─── Phone normalisation ──────────────────────────────────────────────────────
/**
 * Normalize Nigerian numbers to E.164 format (+2348012345678)
 * Twilio requires the + prefix.
 */
function normalizePhone(phone) {
  if (!phone) return null;

  let p = phone.toString().trim().replace(/[\s-]/g, '');

  // 070... → +23470...
  if (p.startsWith('0')) p = '+234' + p.slice(1);

  // Ensure + prefix
  if (!p.startsWith('+')) p = '+' + p;

  return p;
}

// ─── SMS (primary) ────────────────────────────────────────────────────────────
/**
 * Send a plain SMS via Twilio.
 */
const sendViaSMS = async (to, message) => {
  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error('TWILIO_PHONE_NUMBER is not set in environment variables');
  }

  const client = getClient();

  const result = await client.messages.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER,
    body: message,
  });

  return {
    success: true,
    channel: 'sms',
    to,
    sid: result.sid,
    status: result.status,
  };
};

// ─── WhatsApp (fallback) ──────────────────────────────────────────────────────
/**
 * Send an OTP via Twilio WhatsApp.
 *
 * Requirements:
 *  - TWILIO_WHATSAPP_NUMBER → your Twilio WhatsApp-enabled number
 *    Format: whatsapp:+14155238886  (Twilio sandbox)
 *    or your approved WhatsApp Business number: whatsapp:+234XXXXXXXXXX
 *
 * The message is sent as plain text (no template required for Twilio sandbox).
 * For production WhatsApp Business, pre-approved templates may be required.
 */
const sendViaWhatsApp = async (to, message) => {
  if (!process.env.TWILIO_WHATSAPP_NUMBER) {
    throw new Error('TWILIO_WHATSAPP_NUMBER is not set in environment variables');
  }

  const client = getClient();

  const result = await client.messages.create({
    to:   `whatsapp:${to}`,
    from: process.env.TWILIO_WHATSAPP_NUMBER,  // e.g. whatsapp:+14155238886
    body: message,
  });

  return {
    success: true,
    channel: 'whatsapp',
    to,
    sid: result.sid,
    status: result.status,
  };
};

// ─── Public: sendSMS (SMS → WhatsApp fallback) ────────────────────────────────
/**
 * Send a message via SMS first.
 * If SMS fails, automatically retry via WhatsApp.
 */
exports.sendSMS = async (phoneNumber, message) => {
  const to = normalizePhone(phoneNumber);

  if (!to) {
    return { success: false, error: 'Invalid phone number' };
  }

  // ── Attempt 1: SMS ──────────────────────────────────────────────────────────
  try {
    const result = await sendViaSMS(to, message);
    console.log(`[SMS] Sent to ${to} via SMS (sid: ${result.sid})`);
    return result;
  } catch (smsError) {
    const smsErrMsg =
      smsError?.message ||
      smsError?.code ||
      'SMS send failed';

    console.warn(`[SMS] SMS failed for ${to}: ${smsErrMsg}. Trying WhatsApp...`);

    // ── Attempt 2: WhatsApp fallback ────────────────────────────────────────
    try {
      const result = await sendViaWhatsApp(to, message);
      console.log(`[SMS] Sent to ${to} via WhatsApp fallback (sid: ${result.sid})`);
      return result;
    } catch (waError) {
      const waErrMsg =
        waError?.message ||
        waError?.code ||
        'WhatsApp send failed';

      console.error(`[SMS] WhatsApp fallback also failed for ${to}: ${waErrMsg}`);

      return {
        success: false,
        channel: 'both_failed',
        smsError: smsErrMsg,
        whatsappError: waErrMsg,
        error: `SMS failed: ${smsErrMsg} | WhatsApp failed: ${waErrMsg}`,
      };
    }
  }
};

// ─── Public: sendVerificationCode ────────────────────────────────────────────
/**
 * Generate a 6-digit OTP and send it via SMS (with WhatsApp fallback).
 */
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
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };
};