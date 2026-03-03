const db = require('../config/middleware/database');
 const crypto = require('crypto');
 
const auditMiddleware = async (req, res, next) => {
  const start = Date.now();

  res.on('finish', async () => {
    try {
      const actorId = req.user ? req.user.id : null;

// Get previous hash
const lastLog = await db.query(
  `SELECT current_hash FROM audit_logs
   ORDER BY id DESC
   LIMIT 1`
);

const previousHash =
  lastLog.rows.length > 0
    ? lastLog.rows[0].current_hash
    : 'GENESIS';

const timestamp = new Date().toISOString();

const targetId =
  req.params.disputeId ||
  req.params.propertyId ||
  req.params.id ||
  null;

const actionText =
  action || `${req.method} ${req.originalUrl}`;

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

// Insert ledger entry
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
    req.originalUrl,
    res.statusCode,
    req.headers['user-agent'] || null,
    JSON.stringify({
      responseTimeMs: Date.now() - start,
      query: req.query || {},
      body: req.method !== 'GET' ? req.body : undefined
    }),
    previousHash,
    currentHash
  ]
);
    } catch (err) {
      console.error('Audit middleware error:', err.message);
    }
  });

  next();
};

module.exports = auditMiddleware;