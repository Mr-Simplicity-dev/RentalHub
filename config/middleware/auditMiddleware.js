const logger = require('../utils/logger');
const db = require('./database');
const crypto = require('crypto');

const SENSITIVE_FIELDS = new Set(['password', 'current_password', 'new_password', 'nin', 'token', 'reset_token', 'otp', 'secret', 'international_passport_number', 'passport_document_image', 'live_capture_token', 'payload_encrypted', 'email', 'phone', 'contact_email', 'contact_phone', 'search', 'template_encrypted', 'embedding', 'base64Image', 'reference_photo', 'image_one', 'image_two', 'selfie_image', 'doc_image', 'phone_verification_token', 'completion_token', 'card_number', 'cvv']);

const safeInt = (value) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const audit = (action, targetType) => {
  const sanitizeBody = (body) => {
    if (!body || typeof body !== 'object') return body;
    const sanitized = { ...body };
    for (const key of Object.keys(sanitized)) {
      if (SENSITIVE_FIELDS.has(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = sanitizeBody(sanitized[key]);
      }
    }
    return sanitized;
  };

  return (req, res, next) => {
    const start = Date.now();

    res.on('finish', async () => {
      try {
        const actorId = safeInt(req.user ? req.user.id : null);

        // Get previous hash
        const lastLog = await db.query(
          `SELECT current_hash FROM audit_logs
           ORDER BY id DESC
           LIMIT 1`
        );

        const previousHash =
          lastLog.rows && lastLog.rows.length > 0
            ? lastLog.rows[0].current_hash
            : 'GENESIS';

        const timestamp = new Date().toISOString();

        const params = req.params || {};

        const targetId = safeInt(
          params.withdrawalId ||
          params.agentId ||
          params.disputeId ||
          params.propertyId ||
          params.reportId ||
          params.userId ||
          params.id ||
          null
        );

        const safeRoute = String(req.originalUrl || '').replace(/(\/auth\/verify-email\/)[^/?]+/gi, '$1[REDACTED]').replace(/([?&](?:token|phone_verification_token|completion_token)=)[^&]*/gi, '$1[REDACTED]');
        const actionText = action || `${req.method} ${safeRoute}`;

        // Create deterministic data string
        const dataString =
          (actorId || '') +
          actionText +
          (targetType || '') +
          (targetId || '') +
          timestamp +
          previousHash;

        // Generate SHA256 hash
        const currentHash = crypto
          .createHash('sha256')
          .update(dataString)
          .digest('hex');

        // Insert audit ledger entry
        await db.query(
          `INSERT INTO audit_logs
           (actor_id, action, target_type, target_id,
            ip_address, method, route, status_code,
            user_agent, metadata,
            previous_hash, current_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            actorId,
            actionText,
            targetType || null,
            targetId,
            req.ip || null,
            req.method,
            safeRoute,
            res.statusCode,
            req.headers['user-agent'] || null,
            JSON.stringify({
              responseTimeMs: Date.now() - start,
              query: sanitizeBody(req.query || {}),
              body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined
            }),
            previousHash,
            currentHash
          ]
        );
      } catch (err) {
        logger.error('Audit middleware error:', err.message);
      }
    });

    next();
  };
};

module.exports = audit;

