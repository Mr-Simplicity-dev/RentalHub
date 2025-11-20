const axios = require('axios');

// Send SMS using Termii (Popular in Nigeria)
exports.sendSMS = async (phoneNumber, message) => {
  try {
    const response = await axios.post('https://api.ng.termii.com/api/sms/send', {
      to: phoneNumber,
      from: process.env.TERMII_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: 'generic',
      api_key: process.env.TERMII_API_KEY
    });

    return { success: true, data: response.data };
  } catch (error) {
    console.error('SMS send error:', error);
    return { success: false, error: error.message };
  }
};

// Send verification code
exports.sendVerificationCode = async (phoneNumber) => {
  const code = Math.floor(100000 + Math.random() * 900000); // 6-digit code
  const message = `Your verification code is: ${code}. Valid for 10 minutes.`;
  
  const result = await exports.sendSMS(phoneNumber, message);
  
  if (result.success) {
    return { success: true, code };
  }
  return { success: false };
};