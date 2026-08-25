const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { param } = require('express-validator');
const { processSmsDeliveryStatus } = require('../config/utils/smsService');
const validateRequest = require('../config/middleware/validateRequest');

const router = express.Router();

const clean = (value) => String(value || '').trim();

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isWebhookAuthorized(req) {
  const webhookSecret = clean(process.env.SMS_WEBHOOK_SECRET);

  if (!webhookSecret) {
    return false;
  }

  return [
    req.headers['x-sms-webhook-secret'],
    req.query?.token,
    req.body?.token,
    req.body?.secret,
  ].some((value) => timingSafeEqualStrings(clean(value), webhookSecret));
}

// Dedicated limiter so the secret cannot be brute-forced and the SMS fallback
// cannot be spammed via this webhook (the global /api limiter is far too loose).
const smsWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many SMS webhook requests. Please slow down.' },
});

async function handleStatusCallback(req, res) {
  try {
    if (!isWebhookAuthorized(req)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid SMS webhook token',
      });
    }

    const payload = {
      ...(req.query || {}),
      ...(req.body || {}),
    };
    const result = await processSmsDeliveryStatus(req.params.provider, payload);

    return res.json(result);
  } catch (error) {
    req.logger.error('SMS delivery status callback error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process SMS delivery status',
    });
  }
}

router.post('/status/:provider', smsWebhookLimiter, [param('provider').isString().trim().isLength({ min: 1 })], validateRequest, handleStatusCallback);
router.get('/status/:provider', smsWebhookLimiter, [param('provider').isString().trim().isLength({ min: 1 })], validateRequest, handleStatusCallback);

module.exports = router;
