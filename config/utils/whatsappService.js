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
exports.sendWhatsAppTemplate = async ({ to, templateName, language = 'en', params = [], headerMedia = null }) => {
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

  const components = [];

  // Media headers must be supplied for templates approved with an IMAGE/VIDEO/DOCUMENT header.
  const mediaType = String(headerMedia?.type || '').toLowerCase();
  if (mediaType && headerMedia?.link) {
    if (!['image', 'video', 'document'].includes(mediaType)) {
      return { success: false, message: 'Template header media must be an image, video or document' };
    }
    components.push({
      type: 'header',
      parameters: [{ type: mediaType, [mediaType]: { link: String(headerMedia.link) } }],
    });
  }

  if (parameters.length > 0) components.push({ type: 'body', parameters });

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

// Free-form media (image/video/document with optional caption) is only allowed
// inside the 24-hour customer service window, same as free-form text.
exports.sendWhatsAppMedia = async ({ to, mediaType, link, caption = '' }) => {
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

  const type = String(mediaType || '').toLowerCase();
  if (!['image', 'video', 'document'].includes(type)) {
    return { success: false, message: 'Media type must be an image, video or document' };
  }
  if (!link) {
    return { success: false, message: 'A public media link is required' };
  }

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type,
        [type]: {
          link: String(link),
          ...(caption ? { caption: String(caption).slice(0, 1024) } : {}),
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
