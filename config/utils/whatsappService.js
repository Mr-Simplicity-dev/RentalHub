const axios = require('axios');

const graphVersion = () => /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_API_VERSION || '') ? process.env.WHATSAPP_GRAPH_API_VERSION : 'v20.0';

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
      `https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`,
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
exports.sendWhatsAppTemplate = async ({ to, templateName, language = 'en', params = [], headerMedia = null, callbackData = null }) => {
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
      `https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        ...(callbackData ? {biz_opaque_callback_data:String(callbackData).slice(0,512)} : {}),
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
      code: error.response?.data?.error?.code,
      httpStatus: error.response?.status,
      uncertain: !error.response,
      message: error.response?.data?.error?.message || error.message,
    };
  }
};

// Meta's contact check: tells us which numbers are reachable on WhatsApp.
// Docs: POST /{phone-number-id}/contacts with { contacts: [...], force_check }.
// Accepted in small batches only (Meta caps the array), so the caller chunks.
exports.checkWhatsAppContacts = async (phones = []) => {
  const provider = (process.env.WHATSAPP_PROVIDER || 'meta').toLowerCase();

  if (provider !== 'meta') {
    return { success: false, message: 'Unsupported WhatsApp provider', results: [] };
  }

  const token = process.env.WHATSAPP_META_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { success: false, message: 'WhatsApp provider not configured', results: [] };
  }

  const contacts = (Array.isArray(phones) ? phones : [])
    .map((p) => normalizePhone(p))
    .filter(Boolean)
    .slice(0, 100);

  if (contacts.length === 0) {
    return { success: false, message: 'No valid phone numbers to check', results: [] };
  }

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/contacts`,
      { blocking: 'wait', contacts, force_check: true },
      {
        timeout: Number(process.env.WHATSAPP_TIMEOUT_MS || 15000),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Meta returns { contacts: [{ input, wa_id, status }] } where status is
    // 'valid' (on WhatsApp) or 'invalid' (not reachable).
    const results = (data?.contacts || []).map((entry) => ({
      phone: normalizePhone(entry.input || entry.wa_id || ''),
      status: String(entry.status || 'invalid').toLowerCase() === 'valid' ? 'valid' : 'invalid',
    }));

    return { success: true, results };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.error?.message || error.message,
      results: [],
    };
  }
};
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
      `https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`,
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
