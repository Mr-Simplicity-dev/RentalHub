const { Resend } = require('resend');

const FROM = process.env.EMAIL_FROM || 'RentalHub NG <support@rentalhub.com.ng>';
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

const isSenderVerificationError = (providerError) => {
  const text = String(
    providerError?.message ||
    providerError?.name ||
    providerError?.code ||
    providerError ||
    ''
  ).toLowerCase();

  return (
    text.includes('domain is not verified') ||
    text.includes('verify your domain') ||
    text.includes('invalid from address') ||
    text.includes('from address')
  );
};

const getSenderHint = () => {
  if (extractEmailAddress(FROM) !== 'support@rentalhub.com.ng') {
    return '';
  }

  return 'The configured sender was rejected by the email provider. Confirm that EMAIL_FROM uses a verified sender on your Resend domain.';
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
  const primaryPayload = {
    from: FROM,
    to,
    subject,
    html,
    ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
  };

  let result = await sendWithTimeout(primaryPayload);

  if (result?.error && isSenderVerificationError(result.error)) {
    const fallbackFrom = extractEmailAddress(FROM);
    if (fallbackFrom && fallbackFrom !== primaryPayload.from) {
      result = await sendWithTimeout({
        ...primaryPayload,
        from: fallbackFrom,
      });
    }
  }

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
