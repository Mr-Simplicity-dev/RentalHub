const axios = require("axios");

// ─── Shared Sendchamp axios instance ────────────────────────────────────────
const sendchamp = axios.create({
  baseURL: "https://api.sendchamp.com/api/v1",
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// Attach Bearer token before every request
sendchamp.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${process.env.SENDCHAMP_API_KEY}`;
  return config;
});

// ─── Phone normalisation ─────────────────────────────────────────────────────
/**
 * Normalize Nigerian numbers to Sendchamp format: 2348012345678 (no + prefix)
 */
function normalizePhone(phone) {
  if (!phone) return null;

  let p = phone.toString().trim().replace(/[\s-]/g, "");

  if (p.startsWith("0")) p = "234" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);

  return p;
}

// ─── SMS (primary) ───────────────────────────────────────────────────────────
/**
 * Send a plain SMS via Sendchamp.
 */
const sendViaSMS = async (to, message) => {
  if (!process.env.SENDCHAMP_API_KEY)
    throw new Error("SENDCHAMP_API_KEY is not set in environment variables");
  if (!process.env.SENDCHAMP_SENDER_ID)
    throw new Error("SENDCHAMP_SENDER_ID is not set in environment variables");

  const response = await sendchamp.post("/sms/send", {
    to: [to],                              // Sendchamp expects an array
    message,
    sender_name: process.env.SENDCHAMP_SENDER_ID,
    route: "non_dnd",                      // options: dnd | non_dnd | international
  });

  return {
    success: true,
    channel: "sms",
    to,
    data: response.data,
  };
};

// ─── WhatsApp (fallback) ─────────────────────────────────────────────────────
/**
 * Send an OTP via Sendchamp WhatsApp template.
 *
 * Requirements:
 *  - SENDCHAMP_WHATSAPP_SENDER  → your activated WhatsApp number e.g. 2347067959173
 *  - SENDCHAMP_WHATSAPP_OTP_TEMPLATE_CODE → template code from Sendchamp dashboard
 *
 * Your WhatsApp OTP template should contain one body variable: {{1}} for the code.
 * Example template text: "Your verification code is {{1}}. Valid for 10 minutes."
 */
const sendViaWhatsApp = async (to, code) => {
  if (!process.env.SENDCHAMP_API_KEY)
    throw new Error("SENDCHAMP_API_KEY is not set in environment variables");
  if (!process.env.SENDCHAMP_WHATSAPP_SENDER)
    throw new Error(
      "SENDCHAMP_WHATSAPP_SENDER is not set in environment variables"
    );
  if (!process.env.SENDCHAMP_WHATSAPP_OTP_TEMPLATE_CODE)
    throw new Error(
      "SENDCHAMP_WHATSAPP_OTP_TEMPLATE_CODE is not set in environment variables"
    );

  const response = await sendchamp.post("/whatsapp/template/send", {
    recipient: to,
    sender: process.env.SENDCHAMP_WHATSAPP_SENDER,
    type: "template",
    template_code: process.env.SENDCHAMP_WHATSAPP_OTP_TEMPLATE_CODE,
    custom_data: {
      body: {
        "1": String(code),               // maps to {{1}} in your template
      },
    },
  });

  return {
    success: true,
    channel: "whatsapp",
    to,
    data: response.data,
  };
};

// ─── Public: sendSMS (SMS → WhatsApp fallback) ───────────────────────────────
/**
 * Send an SMS. If SMS delivery fails, automatically retries via WhatsApp.
 * The `code` param is only used for the WhatsApp template fallback.
 */
exports.sendSMS = async (phoneNumber, message, code = null) => {
  const to = normalizePhone(phoneNumber);

  if (!to) {
    return { success: false, error: "Invalid phone number" };
  }

  // ── Attempt 1: SMS ──────────────────────────────────────────────────────
  try {
    const result = await sendViaSMS(to, message);
    console.log(`[SMS] Sent to ${to} via SMS`);
    return result;
  } catch (smsError) {
    const smsErrMsg =
      smsError?.response?.data?.message ||
      smsError?.response?.data ||
      smsError.message;

    console.warn(`[SMS] SMS failed for ${to}: ${smsErrMsg}. Trying WhatsApp...`);

    // ── Attempt 2: WhatsApp fallback ──────────────────────────────────────
    try {
      // WhatsApp template needs the raw code, not the full message string.
      // If no code was provided we cannot use the template — surface the SMS error.
      if (!code) {
        throw new Error("No OTP code available for WhatsApp fallback");
      }

      const result = await sendViaWhatsApp(to, code);
      console.log(`[SMS] Sent to ${to} via WhatsApp (fallback)`);
      return result;
    } catch (waError) {
      const waErrMsg =
        waError?.response?.data?.message ||
        waError?.response?.data ||
        waError.message;

      console.error(`[SMS] WhatsApp fallback also failed for ${to}: ${waErrMsg}`);

      return {
        success: false,
        channel: "both_failed",
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
  const message = `Your verification code is: ${code}. Valid for 10 minutes.`;

  // Pass the raw code so the WhatsApp fallback can insert it into the template
  const result = await exports.sendSMS(phoneNumber, message, code);

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