const logger = require('./logger');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

/**
 * Get the NIN encryption key from environment.
 * Must be a 64-character hex string (32 bytes).
 */
const getEncryptionKey = () => {
  const key = process.env.NIN_ENCRYPTION_KEY;
  if (!key || key.length < 64) {
    return null;
  }
  return Buffer.from(key.slice(0, 64), 'hex');
};

/**
 * Encrypt a Nigerian National Identification Number (NIN).
 * Returns a colon-delimited string: iv:authTag:encryptedData
 */
const encryptNIN = (nin) => {
  if (!nin || typeof nin !== 'string') return null;

  const key = getEncryptionKey();
  if (!key) return null;

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(nin.trim(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypt an encrypted NIN string.
 * Expects format: iv:authTag:encryptedData
 */
const decryptNIN = (encrypted) => {
  if (!encrypted || typeof encrypted !== 'string') return null;

  const parts = encrypted.split(':');
  if (parts.length !== 3) return null;

  const [ivHex, authTagHex, encryptedText] = parts;

  try {
    const key = getEncryptionKey();
    if (!key) return encrypted;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error('NIN decryption failed:', error.message);
    return null;
  }
};

/**
 * Search for encrypted NIN by comparing against known plaintext.
 * This is used for admin searches and duplicate checking.
 * NOTE: This performs a linear scan — not efficient for large datasets.
 * For production, consider a deterministic encryption or hashed lookup.
 */
const findEncryptedNIN = async (db, plaintextNIN) => {
  if (!plaintextNIN) return null;

  const result = await db.query(
    `SELECT id, nin FROM users WHERE nin IS NOT NULL AND nin LIKE '%:%:%'`
  );

  for (const row of result.rows) {
    const decrypted = decryptNIN(row.nin);
    if (decrypted === plaintextNIN.trim()) {
      return row;
    }
  }

  return null;
};

module.exports = {
  encryptNIN,
  decryptNIN,
  findEncryptedNIN,
};
