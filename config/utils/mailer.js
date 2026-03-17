const { Resend } = require('resend');

const FROM = process.env.EMAIL_FROM || 'Rental Platform <onboarding@resend.dev>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || undefined;
const EMAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || 12000);
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const extractEmailAddress = (value) => {
  if (!value) return '';

  const input = String(value).trim();
  const match = input.match(/<([^>]+)>/);

  return (match ? match[1] : input).trim().toLowerCase();
};

const formatProviderError = (providerError) => {
  if (!providerError) {
    return 'Email delivery failed';
  }

  if (typeof providerError === 'string') {
    return providerError;
  }

  const message =
    providerError.message ||
    providerError.name ||
    'Email delivery failed';
  const code =
    providerError.statusCode ||
    providerError.status ||
    providerError.code;

  return code ? `${message} (code: ${code})` : message;
};

const getSenderHint = () => {
  if (extractEmailAddress(FROM) !== 'onboarding@resend.dev') {
    return '';
  }

  return 'The current sender uses Resend onboarding mode. Verify a domain in Resend and set EMAIL_FROM to an address on that domain before sending lawyer invites to external recipients.';
};

const sendWithTimeout = async (payload) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  return Promise.race([
    resend.emails.send(payload),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send timeout')), EMAIL_TIMEOUT_MS)
    ),
  ]);
};

exports.sendEmail = async ({ to, subject, html }) => {
  const result = await sendWithTimeout({
    from: FROM,
    to,
    subject,
    html,
    ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
  });

  if (!result) {
    throw new Error('Email provider returned an empty response');
  }

  if (result.error) {
    const errorMessage = [formatProviderError(result.error), getSenderHint()]
      .filter(Boolean)
      .join(' ');

    throw new Error(errorMessage);
  }

  return { success: true };
};
