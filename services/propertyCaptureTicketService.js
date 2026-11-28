const crypto = require('crypto');
const db = require('../config/middleware/database');

const CAPTURE_TICKET_TTL_MS =
  Number(process.env.PROPERTY_IMAGE_CAPTURE_TTL_MS) || 10 * 60 * 1000;

const hashCaptureToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const normalizeTokens = (tokens) =>
  (Array.isArray(tokens) ? tokens : [])
    .map((token) => String(token || '').trim())
    .filter(Boolean);

const issueCaptureTicket = async (userId, executor = db) => {
  const token = crypto.randomBytes(24).toString('hex');
  await executor.query(
    `INSERT INTO property_capture_tickets (token_hash, user_id, expires_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'))`,
    [hashCaptureToken(token), userId, CAPTURE_TICKET_TTL_MS]
  );
  return token;
};

const lockCaptureTickets = async (client, userId, tokens) => {
  const cleanTokens = normalizeTokens(tokens);
  const hashes = [...new Set(cleanTokens.map(hashCaptureToken))].sort();
  if (!hashes.length || hashes.length !== cleanTokens.length) {
    return { valid: false, reason: 'invalid' };
  }

  const result = await client.query(
    `SELECT token_hash, expires_at > CURRENT_TIMESTAMP AS is_unexpired, consumed_at
     FROM property_capture_tickets
     WHERE user_id = $1 AND token_hash = ANY($2::varchar[])
     ORDER BY token_hash
     FOR UPDATE`,
    [userId, hashes]
  );

  if (result.rows.length !== hashes.length) {
    return { valid: false, reason: 'invalid' };
  }
  if (result.rows.some((row) => row.consumed_at)) {
    return { valid: false, reason: 'used' };
  }
  if (result.rows.some((row) => !row.is_unexpired)) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, hashes };
};

const consumeCaptureTickets = async (client, userId, hashes, propertyId) => {
  const result = await client.query(
    `UPDATE property_capture_tickets
     SET consumed_at = CURRENT_TIMESTAMP,
         consumed_for_property_id = $3
     WHERE user_id = $1
       AND token_hash = ANY($2::varchar[])
       AND consumed_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     RETURNING token_hash`,
    [userId, hashes, propertyId]
  );

  if (result.rows.length !== hashes.length) {
    const error = new Error('Live capture verification changed before the listing was saved.');
    error.code = 'CAPTURE_TICKET_RACE';
    throw error;
  }
};

const getCommittedClipRetry = async (client, userId, hashes, propertyId) => {
  const result = await client.query(
    `SELECT c.*
     FROM property_capture_tickets t
     JOIN property_clips c ON c.capture_token_hash = t.token_hash
     WHERE t.user_id = $1
       AND t.token_hash = ANY($2::varchar[])
       AND t.consumed_for_property_id = $3
     ORDER BY t.token_hash`,
    [userId, hashes, propertyId]
  );
  return result.rows.length === hashes.length ? result.rows : null;
};

const getCommittedPhotoRetry = async (client, userId, hashes, propertyId) => {
  const result = await client.query(
    `SELECT p.*
     FROM property_capture_tickets t
     JOIN property_photos p ON p.capture_token_hash = t.token_hash
     WHERE t.user_id = $1
       AND t.token_hash = ANY($2::varchar[])
       AND t.consumed_for_property_id = $3
     ORDER BY t.token_hash`,
    [userId, hashes, propertyId]
  );
  return result.rows.length === hashes.length ? result.rows : null;
};

module.exports = {
  CAPTURE_TICKET_TTL_MS,
  consumeCaptureTickets,
  getCommittedClipRetry,
  getCommittedPhotoRetry,
  hashCaptureToken,
  issueCaptureTicket,
  lockCaptureTickets,
  normalizeTokens,
};
