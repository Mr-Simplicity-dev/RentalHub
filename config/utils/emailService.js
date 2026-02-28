const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'Rental Platform <onboarding@resend.dev>';
const EMAIL_TIMEOUT_MS = Number(process.env.EMAIL_TIMEOUT_MS || 12000);

const sendWithTimeout = async (payload) => {
  return Promise.race([
    resend.emails.send(payload),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send timeout')), EMAIL_TIMEOUT_MS)
    ),
  ]);
};

// Send verification email
exports.sendVerificationEmail = async (email, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  try {
    await sendWithTimeout({
      from: FROM,
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

    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

// Send welcome email
exports.sendWelcomeEmail = async (email, fullName, userType) => {
  try {
    await sendWithTimeout({
      from: FROM,
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

// Send password reset email
exports.sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    await sendWithTimeout({
      from: FROM,
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

    return { success: true };
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
    await sendWithTimeout({
      from: FROM,
      to: landlordEmail,
      subject: 'New Property Application Received',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>New Application Received</h2>
          <p>Hello ${landlordName},</p>
          <p><strong>${tenantName}</strong> has submitted an application for your property:</p>
          <p><strong>${propertyTitle}</strong></p>
          <p>Please log in to your dashboard to review the application.</p>
          <a href="${process.env.FRONTEND_URL}/landlord/applications/${applicationId}">
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
    await sendWithTimeout({
      from: FROM,
      to: tenantEmail,
      subject: `Application ${status.charAt(0).toUpperCase() + status.slice(1)} - ${propertyTitle}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Application Status Update</h2>
          <p>Hello ${tenantName},</p>
          <p>${statusMessage}</p>
          <p><strong>Property:</strong> ${propertyTitle}</p>
          <p>Log in to view more details.</p>
          <a href="${process.env.FRONTEND_URL}/tenant/applications">View My Applications</a>
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
    await sendWithTimeout({
      from: FROM,
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
          <a href="${process.env.FRONTEND_URL}/messages">View Messages</a>
        </div>
      `,
    });
  } catch (error) {
    console.error('Message notification email error:', error);
  }
};
