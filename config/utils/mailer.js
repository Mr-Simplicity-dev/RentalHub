const { Resend } = require('resend');

const FROM = process.env.EMAIL_FROM || 'Rental Platform <onboarding@resend.dev>';
const EMAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || 12000);

const sendWithTimeout = async (payload) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  return Promise.race([
    resend.emails.send(payload),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send timeout')), EMAIL_TIMEOUT_MS)
    ),
  ]);
};

exports.sendEmail = async ({ to, subject, html }) => {
  await sendWithTimeout({
    from: FROM,
    to,
    subject,
    html,
  });

  return { success: true };
};
