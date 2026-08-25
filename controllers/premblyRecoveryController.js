const crypto = require('crypto');
const db = require('../config/middleware/database');
const {
  normalizePremblyResponse,
  verifyPremblyWebhookSignature,
} = require('../config/utils/premblyResponse');
const {
  getRegistrationAttemptStatus,
  processPremblyWebhook,
} = require('../services/premblyRecoveryService');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.receiveWebhook = async (req, res) => {
  const callbackToken = String(req.params.callbackToken || '').trim();
  const signature = req.headers['x-prembly-signature'];
  const webhookToken = String(req.headers.token || '').trim();
  const publicKey = process.env.PREMBLY_PUBLIC_KEY || process.env.PREMBLY_APP_ID;
  const rawBody = req.rawBody;

  if (!UUID_PATTERN.test(callbackToken)) {
    return res.status(400).json({ success: false, message: 'Invalid callback token' });
  }
  if (!signature || !webhookToken || !Buffer.isBuffer(rawBody)) {
    return res.status(401).json({ success: false, message: 'Missing Prembly security headers' });
  }
  if (!publicKey) {
    req.logger.error('Prembly webhook rejected because PREMBLY_PUBLIC_KEY is not configured');
    return res.status(503).json({ success: false, message: 'Webhook verification is unavailable' });
  }
  if (!verifyPremblyWebhookSignature({ rawBody, signature, publicKey })) {
    return res.status(401).json({ success: false, message: 'Invalid Prembly signature' });
  }

  try {
    const result = normalizePremblyResponse(req.body || {});
    const processed = await processPremblyWebhook({
      callbackToken,
      webhookToken,
      payloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
      result,
    });

    if (!processed.found) {
      return res.status(404).json({ success: false, message: 'Verification attempt not found' });
    }
    if (processed.referenceMismatch) {
      return res.status(409).json({ success: false, message: 'Verification reference mismatch' });
    }

    return res.status(200).json({
      success: true,
      duplicate: processed.duplicate,
      status: processed.attempt?.status || result.status,
    });
  } catch (error) {
    req.logger.error('Prembly webhook processing error:', error);
    return res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

exports.getRegistrationAttempt = async (req, res) => {
  const attemptId = String(req.params.attemptId || '').trim();
  if (!UUID_PATTERN.test(attemptId)) {
    return res.status(400).json({ success: false, message: 'Invalid verification attempt' });
  }

  try {
    // Only return the attempt if it belongs to the requesting user's own
    // identity (matched via the stored subject hash of NIN/passport).
    const crypto = require('crypto');
    const { decryptNIN } = require('../config/utils/ninEncryption');
    const userResult = await db.query(
      `SELECT nin, international_passport_number
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.user.id]
    );
    const user = userResult.rows[0];

    const identityValues = [];
    if (user?.nin) {
      try {
        const decrypted = decryptNIN(user.nin);
        if (decrypted) identityValues.push(decrypted);
      } catch { /* ignore malformed stored NIN */ }
    }
    if (user?.international_passport_number) {
      identityValues.push(user.international_passport_number);
    }

    const subjectHashes = identityValues.map((value) =>
      crypto.createHash('sha256').update(String(value).trim().toUpperCase()).digest('hex')
    );

    const attempt = await getRegistrationAttemptStatus(attemptId, subjectHashes);
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Verification attempt not found' });
    }
    return res.json({ success: true, data: attempt });
  } catch (error) {
    req.logger.error('Get Prembly registration attempt error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load verification status' });
  }
};
