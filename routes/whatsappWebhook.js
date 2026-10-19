const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const timingSafeEqualStrings = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

// Meta's webhook setup performs a GET handshake first: the subscription is
// only confirmed when hub.verify_token matches WHATSAPP_VERIFY_TOKEN and the
// hub.challenge value is echoed back untouched with a 200.
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    mode !== 'subscribe' ||
    !expected ||
    !challenge ||
    !timingSafeEqualStrings(token, expected)
  ) {
    return res.status(403).json({ success: false, message: 'Webhook verification failed' });
  }

  return res.status(200).send(String(challenge));
});

// X-Hub-Signature-256 is HMAC-SHA256 over the raw body keyed with the
// Facebook app secret. Enforced whenever WHATSAPP_APP_SECRET is configured;
// without it the delivery is still acknowledged so Meta never disables the
// subscription over timeouts.
const hasValidSignature = (req) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;

  const header = String(req.headers['x-hub-signature-256'] || '');
  const separator = header.indexOf('=');
  if (separator < 1 || !Buffer.isBuffer(req.rawBody)) return false;

  const digest = header.slice(separator + 1);
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody)
    .digest('hex');

  const bufDigest = Buffer.from(String(digest), 'hex');
  const bufExpected = Buffer.from(expected, 'hex');
  if (bufDigest.length === 0 || bufDigest.length !== bufExpected.length) return false;
  return crypto.timingSafeEqual(bufDigest, bufExpected);
};

router.post('/', (req, res) => {
  if (!hasValidSignature(req)) {
    return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
  }

  const body = req.body || {};
  const entry = Array.isArray(body.entry) ? body.entry[0] || {} : {};
  const change = Array.isArray(entry.changes) ? entry.changes[0] || {} : {};
  const value = change.value || {};
  const statuses = Array.isArray(value.statuses) ? value.statuses : [];
  const messages = Array.isArray(value.messages) ? value.messages : [];

  if (req.logger) {
    req.logger.info(
      `WhatsApp webhook delivered: ${statuses.length} status(es), ${messages.length} message(s)`
    );
  }

  return res.status(200).json({ success: true });
});

module.exports = router;
