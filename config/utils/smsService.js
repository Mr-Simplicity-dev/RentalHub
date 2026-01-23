const axios = require("axios");

/**
 * Normalize Nigerian numbers to international format (+234…)
 */
function normalizePhone(phone) {
  if (!phone) return null;

  let p = phone.toString().trim();

  // Remove spaces and dashes
  p = p.replace(/[\s-]/g, "");

  // Convert 070… → +23470…
  if (p.startsWith("0")) {
    p = "+234" + p.slice(1);
  }

  // Ensure it starts with +
  if (!p.startsWith("+")) {
    p = "+" + p;
  }

  return p;
}

/**
 * Send SMS using Termii
 */
exports.sendSMS = async (phoneNumber, message) => {
  try {
    if (!process.env.TERMII_API_KEY) {
      throw new Error("TERMII_API_KEY is not set in environment variables");
    }

    if (!process.env.TERMII_SENDER_ID) {
      throw new Error("TERMII_SENDER_ID is not set in environment variables");
    }

    const to = normalizePhone(phoneNumber);

    if (!to) {
      throw new Error("Invalid phone number");
    }

    const response = await axios.post(
      "https://api.ng.termii.com/api/sms/send",
      {
        to,
        from: process.env.TERMII_SENDER_ID,
        sms: message,
        type: "plain",
        channel: "generic",
        api_key: process.env.TERMII_API_KEY,
      },
      {
        timeout: 15000, // 15s timeout for production
      }
    );

    return {
      success: true,
      provider: "termii",
      to,
      data: response.data,
    };
  } catch (error) {
    const providerMessage =
      error?.response?.data?.message ||
      error?.response?.data ||
      error.message;

    console.error("SMS send error:", providerMessage);

    return {
      success: false,
      error: providerMessage,
    };
  }
};

/**
 * Generate and send verification code
 */
exports.sendVerificationCode = async (phoneNumber) => {
  const code = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
  const message = `Your verification code is: ${code}. Valid for 10 minutes.`;

  const result = await exports.sendSMS(phoneNumber, message);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };
};
