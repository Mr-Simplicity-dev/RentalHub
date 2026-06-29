const express = require('express');
const { param } = require('express-validator');
const { processSmsDeliveryStatus } = require('../config/utils/smsService');
const validateRequest = require('../config/middleware/validateRequest');

const router = express.Router();

const clean = (value) => String(value || '').trim();

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
  ].some((value) => clean(value) === webhookSecret);
}

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
    console.error('SMS delivery status callback error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process SMS delivery status',
    });
  }
}

router.post('/status/:provider', [param('provider').isString().trim().isLength({ min: 1 })], validateRequest, handleStatusCallback);
router.get('/status/:provider', [param('provider').isString().trim().isLength({ min: 1 })], validateRequest, handleStatusCallback);

module.exports = router;
