const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { uploadPassport } = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');

// Register new user (Landlord or Tenant)
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('phone').isMobilePhone('en-NG'),
    body('password').isLength({ min: 8 }),
    body('full_name').trim().notEmpty(),
    body('nin').isLength({ min: 11, max: 11 }),
    body('user_type').isIn(['landlord', 'tenant'])
  ],
  authController.register
);

// Login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  authController.login
);

// Verify Email
router.get('/verify-email/:token', authController.verifyEmail);

// Resend Email Verification
router.post('/resend-verification', authController.resendVerification);

// Verify Phone (Send OTP)
router.post('/send-phone-otp', authenticate, authController.sendPhoneOTP);

// Verify Phone (Confirm OTP)
router.post('/verify-phone', authenticate, authController.verifyPhone);

// Upload Passport Photo
router.post('/upload-passport', authenticate, uploadPassport, authController.uploadPassport);

// Get Current User Profile
router.get('/me', authenticate, authController.getCurrentUser);

// Refresh Token
router.post('/refresh-token', authController.refreshToken);

// Logout
router.post('/logout', authenticate, authController.logout);

// Request Password Reset
router.post('/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  authController.forgotPassword
);

// Reset Password
router.post('/reset-password/:token',
  [body('password').isLength({ min: 8 })],
  authController.resetPassword
);

module.exports = router;