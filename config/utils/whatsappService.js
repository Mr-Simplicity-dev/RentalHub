const axios = require('axios');

const normalizePhone = (phone) => String(phone || '').replace(/[^\d]/g, '');

exports.sendWhatsAppText = async ({ to, message }) => {
  const provider = (process.env.WHATSAPP_PROVIDER || 'meta').toLowerCase();

  if (provider !== 'meta') {
    return { success: false, message: 'Unsupported WhatsApp provider' };
  }

  const token = process.env.WHATSAPP_META_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { success: false, message: 'WhatsApp provider not configured' };
  }

  const recipient = normalizePhone(to);
  if (!recipient) {
    return { success: false, message: 'Invalid recipient phone number' };
  }

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: message },
      },
      {
        timeout: Number(process.env.WHATSAPP_TIMEOUT_MS || 10000),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return { success: true, messageId: data?.messages?.[0]?.id || null };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.error?.message || error.message,
    };
  }
};

// Campaigns and cold messages can ONLY go out as Meta-approved templates;
// free-form text is rejected outside the 24-hour customer window.
exports.sendWhatsAppTemplate = async ({ to, templateName, language = 'en', params = [] }) => {
  const provider = (process.env.WHATSAPP_PROVIDER || 'meta').toLowerCase();

  if (provider !== 'meta') {
    return { success: false, message: 'Unsupported WhatsApp provider' };
  }

  const token = process.env.WHATSAPP_META_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { success: false, message: 'WhatsApp provider not configured' };
  }

  const recipient = normalizePhone(to);
  if (!recipient) {
    return { success: false, message: 'Invalid recipient phone number' };
  }

  const parameters = (Array.isArray(params) ? params : [])
    .slice(0, 10)
    .map((p) => ({ type: 'text', text: String(p).slice(0, 200) }));

  const components = parameters.length > 0 ? [{ type: 'body', parameters }] : [];

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          ...(components.length > 0 ? { components } : {}),
        },
      },
      {
        timeout: Number(process.env.WHATSAPP_TIMEOUT_MS || 10000),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return { success: true, messageId: data?.messages?.[0]?.id || null };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.error?.message || error.message,
    };
  }
};
