const express = require('express');
const crypto = require('crypto');

const createWebhookRouter = ({processEvents=body=>require('../services/propertyAlertDeliveryService').handleWebhook(body)}={}) => {
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
// Missing configuration or invalid signatures never mutate delivery or consent records.
const hasValidSignature = (req) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;

  const header = String(req.headers['x-hub-signature-256'] || '');
  if(!/^sha256=[a-f0-9]{64}$/i.test(header))return false;
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

router.post('/', async (req,res) => {
  if(!process.env.WHATSAPP_APP_SECRET)return res.status(503).json({success:false,message:'Webhook verification is not configured'});
  if(!hasValidSignature(req))return res.status(401).json({success:false,message:'Invalid webhook signature'});
  try {
    const body=req.body || {};
    if(Array.isArray(body.entry) && body.entry.length)await processEvents(body);
    return res.status(200).json({success:true});
  } catch(error) {
    req.logger?.error('WhatsApp event persistence failed',{code:error.code || 'webhook_storage_failed'});
    return res.status(503).json({success:false,message:'Event processing unavailable; retry later'});
  }
});
return router;
};
const router=createWebhookRouter();
router.createWebhookRouter=createWebhookRouter;
module.exports=router;
