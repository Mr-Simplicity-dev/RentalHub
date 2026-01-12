const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../config/middleware/database');
const { validateNIN } = require('../config/utils/ninValidator');
const { sendVerificationEmail, sendWelcomeEmail } = require('../config/utils/emailService');
const { sendVerificationCode } = require('../config/utils/smsService');

// Store OTP codes temporarily (use Redis in production)
const otpStore = new Map();

// Generate JWT Token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// REGISTER NEW USER
exports.register = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, phone, password, full_name, nin, user_type } = req.body;

    // Validate NIN format
    const ninValidation = validateNIN(nin);
    if (!ninValidation.valid) {
      return res.status(400).json({
        success: false,
        message: ninValidation.message
      });
    }

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 OR nin = $3',
      [email, phone, nin]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email, phone, or NIN already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert user into database
    const result = await db.query(
      `INSERT INTO users (user_type, email, phone, password_hash, full_name, nin)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name, user_type, created_at`,
      [user_type, email, phone, password_hash, full_name, nin]
    );

    const newUser = result.rows[0];

    // Generate email verification token
    const verificationToken = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Send verification email
    await sendVerificationEmail(email, verificationToken);
    await sendWelcomeEmail(email, full_name, user_type);

    // Generate auth token
    const token = generateToken(newUser.id, user_type);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please verify your email and phone.',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          full_name: newUser.full_name,
          user_type: newUser.user_type,
          created_at: newUser.created_at
        },
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const result = await db.query(
      `SELECT id, email, password_hash, full_name, user_type, 
              email_verified, phone_verified, identity_verified,
              subscription_active, subscription_expires_at
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(user.id, user.user_type);

    // Remove password from response
    delete user.password_hash;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// VERIFY EMAIL
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Update user email verification status
    await db.query(
      'UPDATE users SET email_verified = TRUE WHERE id = $1',
      [decoded.userId]
    );

    res.json({
      success: true,
      message: 'Email verified successfully!'
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid or expired verification token'
    });
  }
};

// RESEND EMAIL VERIFICATION
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await db.query(
      'SELECT id, email, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Generate new token
    const verificationToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    await sendVerificationEmail(email, verificationToken);

    res.json({
      success: true,
      message: 'Verification email sent'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
};

// SEND PHONE OTP
exports.sendPhoneOTP = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user phone
    const result = await db.query(
      'SELECT phone, phone_verified FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];

    if (user.phone_verified) {
      return res.status(400).json({
        success: false,
        message: 'Phone already verified'
      });
    }

    // Send OTP
    const otpResult = await sendVerificationCode(user.phone);

    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP'
      });
    }

    // Store OTP with expiry (10 minutes)
    otpStore.set(userId, {
      code: otpResult.code,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'OTP sent to your phone'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
};

// VERIFY PHONE OTP
exports.verifyPhone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;

    // Get stored OTP
    const storedOTP = otpStore.get(userId);

    if (!storedOTP) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request a new one.'
      });
    }

    // Check expiry
    if (Date.now() > storedOTP.expiresAt) {
      otpStore.delete(userId);
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new one.'
      });
    }

    // Verify OTP
    if (parseInt(otp) !== storedOTP.code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Update phone verification status
    await db.query(
      'UPDATE users SET phone_verified = TRUE WHERE id = $1',
      [userId]
    );

    // Clear OTP
    otpStore.delete(userId);

    res.json({
      success: true,
      message: 'Phone verified successfully!'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Phone verification failed'
    });
  }
};

// UPLOAD PASSPORT PHOTO
exports.uploadPassport = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a passport photo'
      });
    }

    // Update user passport photo URL
    await db.query(
      'UPDATE users SET passport_photo_url = $1 WHERE id = $2',
      [req.file.path, userId]
    );

    // Check if user is now fully verified (email + phone + passport)
    const result = await db.query(
      `SELECT email_verified, phone_verified, passport_photo_url, nin
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];

    // If all verification steps completed, mark for admin review
    if (user.email_verified && user.phone_verified && user.passport_photo_url && user.nin) {
      // In production, trigger admin notification for manual verification
      res.json({
        success: true,
        message: 'Passport uploaded! Your identity is pending admin verification.',
        passport_url: req.file.path
      });
    } else {
      res.json({
        success: true,
        message: 'Passport uploaded successfully',
        passport_url: req.file.path
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload passport photo'
    });
  }
};

// GET CURRENT USER
exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT id, user_type, email, phone, full_name, nin,
              passport_photo_url, email_verified, phone_verified,
              nin_verified, identity_verified, subscription_active,
              subscription_expires_at, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
};

// REFRESH TOKEN
exports.refreshToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = generateToken(decoded.userId, decoded.userType);

    res.json({
      success: true,
      token: newToken
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// LOGOUT
exports.logout = async (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // For enhanced security, implement token blacklisting with Redis
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

// FORGOT PASSWORD
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await db.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If email exists, password reset link has been sent'
      });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Send email (implement email template)
    await sendVerificationEmail(email, resetToken); // Reuse or create specific function

    res.json({
      success: true,
      message: 'Password reset link sent to your email'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset'
    });
  }
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [password_hash, decoded.userId]
    );

    res.json({
      success: true,
      message: 'Password reset successful'
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }
};