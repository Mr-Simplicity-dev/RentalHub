const rateLimit = require('express-rate-limit');

const buildLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });

const authSensitiveLimiter = buildLimiter({
  windowMs: Number(process.env.AUTH_SENSITIVE_WINDOW_MS) || 10 * 60 * 1000,
  max: Number(process.env.AUTH_SENSITIVE_MAX) || 25,
  message: 'Too many authentication/security requests. Try again shortly.',
});

const paymentOpsLimiter = buildLimiter({
  windowMs: Number(process.env.PAYMENT_OPS_WINDOW_MS) || 10 * 60 * 1000,
  max: Number(process.env.PAYMENT_OPS_MAX) || 60,
  message: 'Too many payment-related requests. Please slow down.',
});

const verificationOpsLimiter = buildLimiter({
  windowMs: Number(process.env.VERIFICATION_OPS_WINDOW_MS) || 10 * 60 * 1000,
  max: Number(process.env.VERIFICATION_OPS_MAX) || 40,
  message: 'Too many verification requests. Please wait and retry.',
});

const financeOpsLimiter = buildLimiter({
  windowMs: Number(process.env.FINANCE_OPS_WINDOW_MS) || 10 * 60 * 1000,
  max: Number(process.env.FINANCE_OPS_MAX) || 80,
  message: 'Too many financial operations. Please wait and retry.',
});

const sensitiveActionLimiter = buildLimiter({
  windowMs: Number(process.env.SENSITIVE_ACTION_WINDOW_MS) || 10 * 60 * 1000,
  max: Number(process.env.SENSITIVE_ACTION_MAX) || 12,
  message: 'Too many sensitive requests. Please wait and retry.',
});

const criticalFinanceOpsLimiter = buildLimiter({
  windowMs: Number(process.env.CRITICAL_FINANCE_OPS_WINDOW_MS) || 10 * 60 * 1000,
  max: Number(process.env.CRITICAL_FINANCE_OPS_MAX) || 10,
  message: 'Too many high-risk financial requests. Please wait and retry.',
});

const recruitmentApplyLimiter = buildLimiter({
  windowMs: Number(process.env.RECRUITMENT_APPLY_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RECRUITMENT_APPLY_MAX) || 20,
  message: 'Too many recruitment application requests. Please wait and retry.',
});

const recruitmentPaymentLimiter = buildLimiter({
  windowMs: Number(process.env.RECRUITMENT_PAYMENT_WINDOW_MS) || 10 * 60 * 1000,
  max: Number(process.env.RECRUITMENT_PAYMENT_MAX) || 20,
  message: 'Too many recruitment payment requests. Please wait and retry.',
});

const recruitmentInterviewLimiter = buildLimiter({
  windowMs: Number(process.env.RECRUITMENT_INTERVIEW_WINDOW_MS) || 60 * 1000,
  max: Number(process.env.RECRUITMENT_INTERVIEW_MAX) || 120,
  message: 'Too many recruitment interview requests. Please slow down.',
});

const contactFormLimiter = buildLimiter({
  windowMs: Number(process.env.CONTACT_FORM_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.CONTACT_FORM_MAX) || 5,
  message: 'Too many contact form submissions. Please wait 15 minutes and try again.',
});

const typingLimiter = buildLimiter({
  windowMs: Number(process.env.TYPING_WINDOW_MS) || 1000,
  max: Number(process.env.TYPING_MAX) || 5,
  message: 'Too many typing indicator requests. Please slow down.',
});

module.exports = {
  authSensitiveLimiter,
  paymentOpsLimiter,
  verificationOpsLimiter,
  financeOpsLimiter,
  sensitiveActionLimiter,
  criticalFinanceOpsLimiter,
  recruitmentApplyLimiter,
  recruitmentPaymentLimiter,
  recruitmentInterviewLimiter,
  contactFormLimiter,
  typingLimiter,
};
