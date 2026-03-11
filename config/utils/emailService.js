const { Resend } = require('resend');
const { sendEmail } = require('./mailer');

const FROM = process.env.EMAIL_FROM || 'Rental Platform <onboarding@resend.dev>';
const EMAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || 12000);
const FRONTEND_URL =
  process.env.FRONTEND_URL && process.env.FRONTEND_URL !== '...'
    ? process.env.FRONTEND_URL
    : 'http://localhost:3000';
const SMTP_USER = String(process.env.SMTP_USER || '').trim().toLowerCase();
const SMTP_PASSWORD = String(
  process.env.SMTP_PASS || process.env.SMTP_PASSWORD || ''
).trim();

const hasSmtpConfig = () =>
  Boolean(
    process.env.SMTP_HOST &&
    SMTP_USER &&
    SMTP_PASSWORD &&
    SMTP_USER !== 'your_email@gmail.com' &&
    SMTP_PASSWORD !== 'your_email_password'
  );

const hasResendConfig = () => Boolean(process.env.RESEND_API_KEY);

const sendWithResend = async (payload) => {
  const resend = new Resend(process.env.RESEND_API_KEY);

  return Promise.race([
    resend.emails.send(payload),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send timeout')), EMAIL_TIMEOUT_MS)
    ),
  ]);
};

const sendTransactionalEmail = async ({ to, subject, html }) => {
  const errors = [];

  if (hasSmtpConfig()) {
    try {
      await sendEmail({ to, subject, html });
      return { success: true, provider: 'smtp' };
    } catch (error) {
      console.error('SMTP email send error:', error);
      errors.push(`SMTP: ${error.message}`);
    }
  }

  if (hasResendConfig()) {
    try {
      await sendWithResend({
        from: FROM,
        to,
        subject,
        html,
      });
      return { success: true, provider: 'resend' };
    } catch (error) {
      console.error('Resend email send error:', error);
      errors.push(`Resend: ${error.message}`);
    }
  }

  return {
    success: false,
    error: errors.join(' | ') || 'No email provider configured',
  };
};

// Send verification email
exports.sendVerificationEmail = async (email, verificationToken) => {
  const verificationUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;

  try {
    return await sendTransactionalEmail({
      to: email,
      subject: 'Verify Your Email - Rental Platform',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Email Verification</h2>
          <p>Please click the button below to verify your email address:</p>
          <p>
            <a href="${verificationUrl}" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
              Verify Email
            </a>
          </p>
          <p>This link will expire in 24 hours.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

// Send welcome email
exports.sendWelcomeEmail = async (email, fullName, userType) => {
  try {
    await sendTransactionalEmail({
      to: email,
      subject: 'Welcome to Rental Platform',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Welcome ${fullName}!</h2>
          <p>Your ${userType} account has been successfully created.</p>
          <p>Please complete your identity verification by uploading your NIN and passport photo.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Welcome email error:', error);
  }
};

exports.sendLawyerInviteEmail = async ({
  email,
  clientName,
  clientRole,
  inviteUrl,
  expiresInHours = 72,
}) => {
  try {
    return await sendTransactionalEmail({
      to: email,
      subject: 'Lawyer Invitation - Rental Platform',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>You have been invited as a lawyer</h2>
          <p><strong>${clientName}</strong> (${clientRole}) invited you to represent them on Rental Platform.</p>
          <p>
            <a href="${inviteUrl}" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
              Set Password & Activate Lawyer Access
            </a>
          </p>
          <p>This link expires in ${expiresInHours} hours.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Lawyer invite email error:', error);
    return { success: false, error: error.message };
  }
};

// Send password reset email
exports.sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    return await sendTransactionalEmail({
      to: email,
      subject: 'Reset Your Password - Rental Platform',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Password Reset</h2>
          <p>We received a request to reset your password.</p>
          <p>
            <a href="${resetUrl}" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
              Reset Password
            </a>
          </p>
          <p>This link will expire in 1 hour.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Password reset email error:', error);
    return { success: false, error: error.message };
  }
};

// Send application notification to landlord
exports.sendApplicationNotification = async (
  landlordEmail,
  landlordName,
  tenantName,
  propertyTitle,
  applicationId
) => {
  try {
    await sendTransactionalEmail({
      to: landlordEmail,
      subject: 'New Property Application Received',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>New Application Received</h2>
          <p>Hello ${landlordName},</p>
          <p><strong>${tenantName}</strong> has submitted an application for your property:</p>
          <p><strong>${propertyTitle}</strong></p>
          <p>Please log in to your dashboard to review the application.</p>
          <a href="${FRONTEND_URL}/landlord/applications/${applicationId}">
            View Application
          </a>
        </div>
      `,
    });
  } catch (error) {
    console.error('Application notification email error:', error);
  }
};

// Send application status update to tenant
exports.sendApplicationStatusUpdate = async (
  tenantEmail,
  tenantName,
  propertyTitle,
  status,
  reason = ''
) => {
  const statusMessage =
    status === 'approved'
      ? 'Your application has been <strong>approved</strong>! The landlord will contact you soon.'
      : `Your application has been <strong>rejected</strong>. ${
          reason ? `Reason: ${reason}` : ''
        }`;

  try {
    await sendTransactionalEmail({
      to: tenantEmail,
      subject: `Application ${status.charAt(0).toUpperCase() + status.slice(1)} - ${propertyTitle}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Application Status Update</h2>
          <p>Hello ${tenantName},</p>
          <p>${statusMessage}</p>
          <p><strong>Property:</strong> ${propertyTitle}</p>
          <p>Log in to view more details.</p>
          <a href="${FRONTEND_URL}/tenant/applications">View My Applications</a>
        </div>
      `,
    });
  } catch (error) {
    console.error('Application status email error:', error);
  }
};

// Send message notification
exports.sendMessageNotification = async (
  receiverEmail,
  receiverName,
  senderName,
  messageText
) => {
  const truncatedMessage =
    messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;

  try {
    await sendTransactionalEmail({
      to: receiverEmail,
      subject: `New Message from ${senderName}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>New Message</h2>
          <p>Hello ${receiverName},</p>
          <p>You have received a new message from <strong>${senderName}</strong>:</p>
          <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #0284c7;">
            ${truncatedMessage}
          </blockquote>
          <p>Log in to read and reply to the message.</p>
          <a href="${FRONTEND_URL}/messages">View Messages</a>
        </div>
      `,
    });
  } catch (error) {
    console.error('Message notification email error:', error);
  }
};
