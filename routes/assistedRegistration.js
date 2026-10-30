const express = require('express');
const {
  body
} = require('express-validator');
const validate = require('../config/middleware/validateRequest');
const {
  authenticate
} = require('../config/middleware/auth');
const {
  requireTurnstile
} = require('../config/middleware/turnstileVerify');
const {
  otpSendLimiter,
  otpLimiter,
  sensitiveActionLimiter,
  assistedRegistrationQuoteLimiter,
  assistedRegistrationCreateLimiter
} = require('../config/middleware/securityRateLimiters');
const {
  requirePrivilegedMfa
} = require('../config/utils/twoFactor');
const service = require('../services/assistedRegistrationService');
const policy = require('../services/assistedRegistrationPolicy');
const fingerprints = require('../services/officeFingerprintService');
const router = express.Router();
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
const run = fn => async (req, res) => {
  try {
    res.json({
      success: true,
      data: await fn(req, res)
    });
  } catch (error) {
    if (error.statusCode >= 500 || !error.statusCode) req.logger?.error('Assisted registration failed', {
      error: error.message
    });
    res.status(error.statusCode === 202 ? 409 : error.statusCode || 500).json({
      success: false,
      ...(error.code === 'REGISTRATION_QUOTE_CHANGED' ? { code: error.code } : {}),
      message: error.statusCode && error.statusCode < 500 ? error.message : 'The request could not be completed. Please try again.'
    });
  }
};
const staff = (req, res, next) => policy.roles.has(req.user?.user_type) ? next() : res.status(403).json({
  success: false,
  message: 'Support registration access required'
});
router.post('/phone/request', requireTurnstile('rentalhub_login'), otpSendLimiter, run(req => service.requestPhoneCode(req.body)));
router.post('/phone/verify', otpLimiter, async (req, res) => {
  try {
    const user = await service.verifyPhoneCode(req.body);
    await service.decorateUser(user);
    const internal = require('../services/authService').assistedRegistrationInternals;
    const token = internal.generateToken(user.id, user.user_type, {
      tokenVersion: user.token_version || 1
    });
    res.json({
      success: true,
      data: internal.attachAuthSession(res, {
        user: policy.safeUser(user),
        token
      }, {
        exposeSessionToken: String(req.headers['x-rentalhub-client'] || '').toLowerCase() === 'native'
      })
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode && error.statusCode < 500 ? error.message : 'Unable to verify this account'
    });
  }
});
router.get('/me', authenticate, run(async req => {
  const row = await service.recordForUser(req.user.id);
  return {
    reference: row.reference,
    amount: row.amount_due,
    status: row.status,
    payment_id: row.payment_id,
    email: row.email,
    phone: row.phone,
    user_type: row.user_type,
    full_name: row.full_name,
    quote: row.quote
  };
}));
router.post('/payment', authenticate, sensitiveActionLimiter, run(req => service.initializePayment(req.user, req.body.method)));
router.post('/payment/verify', authenticate, sensitiveActionLimiter, run(req => service.verifyPayment(req.user)));
router.post('/password', authenticate, sensitiveActionLimiter, [body('password').isString().isLength({
  min: 10,
  max: 128
}).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/)], validate, run(async req => {
  await service.recordForUser(req.user.id);
  const verified = await service.verifyPhoneCode(req.body, 'recovery');
  if (String(verified.id) !== String(req.user.id)) throw policy.fail(403, 'Verify the phone belonging to this account');
  const hash = await require('bcryptjs').hash(req.body.password, 10);
  await require('../config/middleware/database').query('UPDATE users SET password_hash=$2,token_version=COALESCE(token_version,1)+1 WHERE id=$1', [req.user.id, hash]);
  return {
    message: 'Password saved. Please sign in again.'
  };
}));
router.use('/staff', authenticate, staff, requirePrivilegedMfa);
router.get('/staff/config', run(async () => ({
  nin_enabled: (await require('../config/middleware/featureFlags').getFeatureFlagsMap()).nin_number !== false
})));
router.get('/staff/request-id', run(() => ({
  request_id: require('crypto').randomUUID()
})));
const photos = require('../services/assistedPhotoService');
const passportUploads = require('../config/middleware/upload');
router.post('/staff/:reference/photo/session', sensitiveActionLimiter, run(req => photos.start(req.user, req.params.reference, req.body)));
const authorizePhoto = async (req, res, next) => {
  try {
    req.assistedPassportSubject = await photos.consume(req.user, req.params.reference, req.headers['x-capture-token']);
    next();
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Unable to start customer photo upload.' });
  }
};
router.post('/staff/:reference/photo', sensitiveActionLimiter, authorizePhoto,
  passportUploads.uploadPassportLocal, passportUploads.validateFileMagicBytesMiddleware,
  passportUploads.reprocessPassportImage, passportUploads.scanUploadForMalware,
  (req, res) => require('./users').handlePassportUpload(req, res));
router.get('/staff/biometric-status', sensitiveActionLimiter, run(() => fingerprints.status()));
router.get('/staff/:reference/fingerprint', run(req => fingerprints.enrollmentStatus(req.user, req.params.reference)));
router.post('/staff/:reference/fingerprint/consent', sensitiveActionLimiter, run(req => fingerprints.requestConsent(req.user, req.params.reference, req.body)));
router.post('/staff/:reference/fingerprint/enroll', sensitiveActionLimiter, run(req => fingerprints.enroll(req.user, req.params.reference, req.body)));
router.post('/staff/:reference/fingerprint/verify', sensitiveActionLimiter, run(req => fingerprints.verify(req.user, req.params.reference, req.body)));
router.delete('/staff/:reference/fingerprint', sensitiveActionLimiter, run(req => fingerprints.revoke(req.user, req.params.reference)));
router.get('/staff', run(req => service.list(req.user, req.query.search)));
router.post('/staff/quote', assistedRegistrationQuoteLimiter, run(req => service.quote(req.user, req.body)));
router.post('/staff', assistedRegistrationCreateLimiter, run(req => service.create(req.user, req.body)));
router.get('/staff/:reference', run(req => service.recordForStaff(req.user, req.params.reference)));
router.post('/staff/:reference/cash', sensitiveActionLimiter, run(req => service.collectCash(req.user, req.params.reference, req.body)));
router.post('/staff/:reference/remittance', sensitiveActionLimiter, run(req => service.remit(req.user, req.params.reference)));
router.get('/staff/:reference/receipt', async (req, res) => {
  try {
    const record = await service.recordForStaff(req.user, req.params.reference);
    const waived = record.status === 'paid' && record.collection_method === 'waived' && Number(record.amount_due) === 0;
    if (record.status !== 'paid' || (!record.payment_id && !waived)) return res.status(409).json({
      success: false,
      message: 'A confirmed payment is required before generating a receipt'
    });
    const receipt = require('../config/utils/paymentReceipt');
    const PDFDocument = require('pdfkit');
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 48
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="registration-receipt.pdf"');
    pdf.pipe(res);
    pdf.fontSize(20).text('Amana RentalHub NG');
    pdf.moveDown();
    pdf.fontSize(15).text(waived ? 'REGISTRATION ACKNOWLEDGEMENT' : 'REGISTRATION PAYMENT RECEIPT');
    pdf.moveDown();
    const lines = [['Customer', record.full_name], ['Account type', record.user_type], ['Reference', record.reference], ['Receipt', waived ? 'Fee waived - no payment collected' : require('../config/utils/referenceGenerator').paymentReceiptNumber(record.payment_id)], ['Amount', receipt.formatNgn(record.amount_due)], ['Payment method', record.collection_method], ['Paid', new Date(record.paid_at).toISOString()], ['Collected by staff ID', record.collected_by || 'Automatic confirmation']];
    const moneyFont = require('../config/utils/pdfMoneyFont').registerMoneyFont(pdf);
    pdf.font(moneyFont).fontSize(11);
    for (const [label, value] of lines) pdf.text(label + ': ' + String(value));
    pdf.moveDown();
    pdf.text(waived ? 'Your registration fee was waived. This acknowledgement does not represent a payment.' : 'Keep this receipt as confirmation of the registration payment.');
    pdf.end();
  } catch (error) {
    if (!res.headersSent) res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Receipt unavailable'
    });
  }
});
module.exports = router;
