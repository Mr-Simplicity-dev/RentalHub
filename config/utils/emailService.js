const { sendEmail } = require('./mailer');
const { getFrontendUrl } = require('./frontendUrl');

const FRONTEND_URL = getFrontendUrl();

// Send verification email
exports.sendVerificationEmail = async (email, verificationToken) => {
  const verificationUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;

  try {
    await sendEmail({
      to: email,
      subject: 'Verify Your Email - Rental Hub',
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
    await sendEmail({
      to: email,
      subject: 'Welcome to Rental Hub NG',
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
    await sendEmail({
      to: email,
      subject: 'Lawyer Invitation - Rental Hub NG',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>You have been invited as a lawyer</h2>
          <p><strong>${clientName}</strong> (${clientRole}) invited you to represent them at Rental Hub NG, A Platform that connects landlords to tenants on property renting.</p>
          <p>
            <a href="${inviteUrl}" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
              Set Password & Activate Lawyer Access
            </a>
          </p>
          <p>This link expires in ${expiresInHours} hours.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Lawyer invite email error:', error);
    return { success: false, error: error.message };
  }
};

exports.sendPlatformLawyerInviteEmail = async ({
  email,
  inviteUrl,
  expiresInHours = 72,
  assignedByName = 'RentalHub NG',
}) => {
  try {
    await sendEmail({
      to: email,
      subject: 'RentalHub NG Lawyer Invitation',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>You have been selected to serve as a RentalHub NG lawyer</h2>
          <p><strong>${assignedByName}</strong> added you to the RentalHub NG lawyer program.</p>
          <p>Use the button below to create your password, activate your lawyer account, and complete your profile.</p>
          <p>
            <a href="${inviteUrl}" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
              Create Password & Activate Lawyer Account
            </a>
          </p>
          <p>This link expires in ${expiresInHours} hours.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Platform lawyer invite email error:', error);
    return { success: false, error: error.message };
  }
};

exports.sendAgentInviteEmail = async ({
  email,
  landlordName,
  agentName,
  inviteUrl,
  expiresInHours = 72,
}) => {
  try {
    await sendEmail({
      to: email,
      subject: 'RentalHub NG Agent Invitation',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>You have been invited to help manage a landlord account</h2>
          <p><strong>${landlordName}</strong> invited you to serve as their agent on RentalHub NG.</p>
          <p>${agentName ? `${agentName}, use the button below to create your password and activate your agent access.` : 'Use the button below to create your password and activate your agent access.'}</p>
          <p>
            <a href="${inviteUrl}" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
              Create Password & Activate Agent Access
            </a>
          </p>
          <p>This link expires in ${expiresInHours} hours.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Agent invite email error:', error);
    return { success: false, error: error.message };
  }
};

exports.sendAgentAssignmentNoticeEmail = async ({
  email,
  landlordName,
  inviterName,
  dashboardUrl,
}) => {
  try {
    await sendEmail({
      to: email,
      subject: 'RentalHub NG Agent Assignment Updated',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Your agent assignment is active</h2>
          <p><strong>${inviterName || landlordName}</strong> assigned you to support <strong>${landlordName}</strong> on RentalHub NG.</p>
          <p>You can now sign in and start helping with approved landlord operations.</p>
          <p>
            <a href="${dashboardUrl}" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
              Open Agent Dashboard
            </a>
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Agent assignment notice email error:', error);
    return { success: false, error: error.message };
  }
};

// Send password reset email
exports.sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    await sendEmail({
      to: email,
      subject: 'Reset Your Password - Rental Hub NG',
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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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

// Send fraud alert to super admin
exports.sendFraudAlertEmail = async ({
  adminEmail,
  adminName,
  lawyerName,
  lawyerEmail,
  matchedUserName,
  matchedUserType,
  matchedUserEmail,
  alertTime,
}) => {
  try {
    await sendEmail({
      to: adminEmail,
      subject: 'URGENT: Fraud Alert - Duplicate Passport Detected',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
          <div style="background: #fee; border: 2px solid #c33; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <h2 style="color: #c33; margin-top: 0;">🚨 FRAUD ALERT 🚨</h2>
            <p style="margin: 0;"><strong>Duplicate passport detected during lawyer verification</strong></p>
          </div>

          <h3>Alert Details:</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr style="background: #f9f9f9;">
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Time:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${alertTime}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Alert Type:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">Duplicate Identity - Passport Match</td>
            </tr>
          </table>

          <h3>Lawyer Account (Attempting to Register):</h3>
          <ul style="background: #f0f8ff; padding: 15px; border-left: 4px solid #0284c7; border-radius: 4px;">
            <li><strong>Name:</strong> ${lawyerName}</li>
            <li><strong>Email:</strong> ${lawyerEmail}</li>
            <li><strong>Status:</strong> Flagged for fraud verification</li>
          </ul>

          <h3>Matched Account (Existing User):</h3>
          <ul style="background: #f0f0f0; padding: 15px; border-left: 4px solid #999; border-radius: 4px;">
            <li><strong>Name:</strong> ${matchedUserName}</li>
            <li><strong>Email:</strong> ${matchedUserEmail}</li>
            <li><strong>User Type:</strong> ${matchedUserType}</li>
            <li><strong>Issue:</strong> Same passport photo used in multiple accounts</li>
          </ul>

          <h3>Recommended Actions:</h3>
          <ol>
            <li>Investigate the lawyer account: ${lawyerEmail}</li>
            <li>Compare both passport photos in admin panel</li>
            <li>Contact lawyer for explanation</li>
            <li>Contact original ${matchedUserType}: ${matchedUserEmail}</li>
            <li>Suspend lawyer account if fraud confirmed</li>
            <li>Mark alert as resolved/false-positive when investigation complete</li>
          </ol>

          <p style="margin-top: 30px; font-size: 12px; color: #999;">
            This is an automated fraud detection alert. Please investigate immediately.
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Fraud alert email error:', error);
    return { success: false, error: error.message };
  }
};
