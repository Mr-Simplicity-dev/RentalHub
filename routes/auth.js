const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { uploadPassport } = require('../config/middleware/upload');
const { authenticate, requireAdminOrSuperAdmin } = require('../config/middleware/auth');

const router = express.Router();

const registerValidators = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('phone')
    .trim()
    .customSanitizer((value) => String(value || '').replace(/\s+/g, ''))
    .matches(/^\+?\d{10,15}$/)
    .withMessage('Please enter a valid phone number (10-15 digits, optional +)'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('full_name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required'),
  body('lawyer_email')
    .isEmail()
    .withMessage('One lawyer email is required at registration')
    .normalizeEmail(),
  body('is_foreigner')
    .optional()
    .isBoolean()
    .withMessage('is_foreigner must be true or false'),
  body('identity_document_type')
    .optional()
    .isIn(['nin', 'passport'])
    .withMessage('identity_document_type must be nin or passport'),
  body('nin')
    .optional({ checkFalsy: true })
    .matches(/^\d{11}$/)
    .withMessage('NIN must be exactly 11 digits'),
  body('international_passport_number')
    .optional({ checkFalsy: true })
    .isLength({ min: 6, max: 20 })
    .withMessage('International passport number must be 6-20 characters'),
  body('nationality')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('Nationality must be between 2 and 80 characters'),
  body('state_id')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('State must be valid'),
  body('lga_name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Local government area must be between 2 and 120 characters'),
  body('user_type')
    .isIn(['landlord', 'tenant'])
    .withMessage('User type must be tenant or landlord'),
];

// ================= ROUTES =================

router.get('/registration-flags', authController.getRegistrationFlags);

router.post(
  '/register/payment',
  registerValidators,
  authController.initializeRegistrationPayment
);

router.post(
  '/register/payment/complete/:reference',
  authController.completeRegistrationAfterPayment
);

router.post(
  '/register/tenant-payment',
  registerValidators,
  authController.initializeRegistrationPayment
);

router.post(
  '/register/tenant-payment/complete/:reference',
  authController.completeRegistrationAfterPayment
);

// Register new user (Landlord or Tenant)
router.post(
  '/register',
  registerValidators,
  authController.register
);


router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  authController.login
);

router.post(
  '/lawyer/accept-invite',
  [
    body('token').trim().notEmpty(),
    body('full_name').trim().notEmpty(),
    body('chamber_name').trim().notEmpty(),
    body('chamber_phone')
      .trim()
      .customSanitizer(v => String(v || '').replace(/\s+/g, ''))
      .matches(/^\+?\d{10,15}$/),
    body('phone')
      .trim()
      .customSanitizer(v => String(v || '').replace(/\s+/g, ''))
      .matches(/^\+?\d{10,15}$/),
    body('password').isLength({ min: 8 }),
  ],
  authController.acceptLawyerInvite
);

router.get(
  '/lawyer-invites',
  authenticate,
  requireAdminOrSuperAdmin,
  authController.getLawyerInvites
);

router.patch(
  '/lawyer-invites/:inviteId/resend',
  authenticate,
  requireAdminOrSuperAdmin,
  authController.resendLawyerInvite
);

router.patch(
  '/lawyer-invites/:inviteId/email',
  [
    authenticate,
    requireAdminOrSuperAdmin,
    body('lawyer_email').isEmail().normalizeEmail(),
  ],
  authController.updateLawyerInviteEmail
);

router.post(
  '/verify-otp',
  [
    body('phone').trim().notEmpty(),
    body('otp').trim().notEmpty(),
  ],
  authController.verifyLawyerOtp
);

router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);

router.post('/send-phone-otp', authenticate, authController.sendPhoneOTP);
router.post('/verify-phone', authenticate, authController.verifyPhone);

router.post(
  '/upload-passport',
  authenticate,
  uploadPassport,
  authController.uploadPassport
);

router.post(
  '/check-lawyer-passport-fraud',
  authenticate,
  uploadPassport,
  authController.checkLawyerPassportForFraud
);

router.get('/me', authenticate, authController.getCurrentUser);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);

router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  authController.forgotPassword
);

router.post(
  '/reset-password/:token',
  [body('password').isLength({ min: 8 })],
  authController.resetPassword
);

module.exports = router;