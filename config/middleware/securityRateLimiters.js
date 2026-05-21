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

module.exports = {
  authSensitiveLimiter,
  paymentOpsLimiter,
  verificationOpsLimiter,
  financeOpsLimiter,
  sensitiveActionLimiter,
  criticalFinanceOpsLimiter,
};
