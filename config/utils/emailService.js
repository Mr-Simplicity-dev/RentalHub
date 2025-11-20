const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// Send verification email
exports.sendVerificationEmail = async (email, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Verify Your Email - Rental Platform',
    html: `
      <h2>Email Verification</h2>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>This link will expire in 24 hours.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

// Send welcome email
exports.sendWelcomeEmail = async (email, fullName, userType) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Welcome to Rental Platform',
    html: `
      <h2>Welcome ${fullName}!</h2>
      <p>Your ${userType} account has been successfully created.</p>
      <p>Please complete your identity verification by uploading your NIN and passport photo.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Welcome email error:', error);
  }
};

// Send application notification to landlord
exports.sendApplicationNotification = async (landlordEmail, landlordName, tenantName, propertyTitle, applicationId) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: landlordEmail,
    subject: 'New Property Application Received',
    html: `
      <h2>New Application Received</h2>
      <p>Hello ${landlordName},</p>
      <p><strong>${tenantName}</strong> has submitted an application for your property:</p>
      <p><strong>${propertyTitle}</strong></p>
      <p>Please log in to your dashboard to review the application.</p>
      <a href="${process.env.FRONTEND_URL}/landlord/applications/${applicationId}">View Application</a>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Application notification email error:', error);
  }
};

// Send application status update to tenant
exports.sendApplicationStatusUpdate = async (tenantEmail, tenantName, propertyTitle, status, reason = '') => {
  const statusMessage = status === 'approved' 
    ? 'Your application has been <strong>approved</strong>! The landlord will contact you soon.'
    : `Your application has been <strong>rejected</strong>. ${reason ? `Reason: ${reason}` : ''}`;

  const mailOptions = {
    from: process.env.SMTP_USER,
    to: tenantEmail,
    subject: `Application ${status.charAt(0).toUpperCase() + status.slice(1)} - ${propertyTitle}`,
    html: `
      <h2>Application Status Update</h2>
      <p>Hello ${tenantName},</p>
      <p>${statusMessage}</p>
      <p><strong>Property:</strong> ${propertyTitle}</p>
      <p>Log in to view more details.</p>
      <a href="${process.env.FRONTEND_URL}/tenant/applications">View My Applications</a>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Application status email error:', error);
  }
};

// Send message notification
exports.sendMessageNotification = async (receiverEmail, receiverName, senderName, messageText) => {
  const truncatedMessage = messageText.length > 100 
    ? messageText.substring(0, 100) + '...' 
    : messageText;

  const mailOptions = {
    from: process.env.SMTP_USER,
    to: receiverEmail,
    subject: `New Message from ${senderName}`,
    html: `
      <h2>New Message</h2>
      <p>Hello ${receiverName},</p>
      <p>You have received a new message from <strong>${senderName}</strong>:</p>
      <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #007bff;">
        ${truncatedMessage}
      </blockquote>
      <p>Log in to read and reply to the message.</p>
      <a href="${process.env.FRONTEND_URL}/messages">View Messages</a>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Message notification email error:', error);
  }
};