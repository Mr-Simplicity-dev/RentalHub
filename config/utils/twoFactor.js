/**
 * Two-factor authentication for withdrawals and financial approvals.
 *
 * Design (Option 1 — agreed):
 *  - TOTP (Google Authenticator / any TOTP app) is the PRIMARY method once
 *    the user enrolls.
 *  - SMS OTP (Termii/Twilio, existing infra) is the fallback for users who
 *    have not enrolled TOTP.
 *  - Recovery codes (10, single-use, hashed at rest) so a lost phone never
 *    locks anyone out.
 *  - Brute-force lockout: 5 failed TOTP attempts -> 15 minute lock.
 */

const { authenticator } = require('otplib');
const crypto = require('crypto');
const redis = require('./redis');
const db = require('../middleware/database');
const { encryptNIN, decryptNIN } = require('./ninEncryption');
const { sendVerificationCode } = require('./smsService');

const SERVICE_NAME = 'RentalHub NG';
const MAX_TOTP_ATTEMPTS = 5;
const TOTP_LOCK_MS = 15 * 60 * 1000;
const SMS_OTP_TTL_SECONDS = 300;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

authenticator.options = { window: 1 };

let redisClient = redis; // ioredis wrapper (null when unavailable) — falls back to in-memory
const memoryOtpStore = new Map();

const otpStoreGet = async (key) => {
  try {
    if (redisClient) {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    }
  } catch (error) {
    // fall through to memory
  }
  return memoryOtpStore.get(key) || null;
};

const otpStoreSet = async (key, value, ttlSeconds) => {
  try {
    if (redisClient) {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    }
  } catch (error) {
    // fall through to memory
  }
  memoryOtpStore.set(key, { ...value, expiresAt: Date.now() + ttlSeconds * 1000 });
};

const otpStoreDelete = async (key) => {
  try {
    if (redisClient) {
      await redisClient.del(key);
      return;
    }
  } catch (error) {
    // fall through to memory
  }
  memoryOtpStore.delete(key);
};

const loadUserTotp = async (userId) => {
  const result = await db.query(
    `SELECT totp_secret, totp_enabled, totp_failed_attempts,
            totp_locked_until, totp_recovery_codes
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
};

const saveTotpFailure = async (userId, attempts, lockedUntil) => {
  await db.query(
    `UPDATE users
     SET totp_failed_attempts = $1,
         totp_locked_until = $2
     WHERE id = $3`,
    [attempts, lockedUntil, userId]
  );
};

const resetTotpFailures = async (userId) => {
  await db.query(
    `UPDATE users SET totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = $1`,
    [userId]
  );
};

const hashRecoveryCode = (code) =>
  crypto.createHash('sha256').update(code).digest('hex');

const generateRecoveryCode = () => {
  const bytes = crypto.randomBytes(RECOVERY_CODE_COUNT);
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  return code;
};

class TwoFactorError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
    this.statusCode = extra.statusCode || 400;
  }
}

/**
 * Create a TOTP secret for a user and return the enrollment material.
 * The secret is encrypted at rest (same AES-256-GCM key as identity data).
 */
exports.createTotpEnrollment = async ({ userId, email }) => {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, SERVICE_NAME, secret);

  // Encrypted at rest when the encryption key is configured; plaintext
  // fallback otherwise (same convention as identity data).
  const storedSecret = encryptNIN(secret) || secret;

  await db.query(
    `UPDATE users
     SET totp_secret = $1,
         totp_enabled = FALSE,
         totp_failed_attempts = 0,
         totp_locked_until = NULL
     WHERE id = $2`,
    [storedSecret, userId]
  );

  return { secret, otpauthUrl };
};

/**
 * Confirm enrollment: verify one TOTP code, enable TOTP and issue recovery codes.
 */
exports.confirmTotpEnrollment = async ({ userId, code }) => {
  const user = await loadUserTotp(userId);
  if (!user || !user.totp_secret) {
    throw new TwoFactorError('TOTP_NOT_SETUP', 'Two-factor setup was not started.');
  }
  if (user.totp_enabled) {
    throw new TwoFactorError('TOTP_ALREADY_ENABLED', 'Two-factor authentication is already enabled.');
  }

  const secret = decryptNIN(user.totp_secret);
  const valid = authenticator.verify({ token: String(code || '').replace(/\s/g, ''), secret });
  if (!valid) {
    throw new TwoFactorError('TOTP_INVALID', 'The code you entered is not valid.');
  }

  const recoveryCodes = [];
  const hashes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const codeValue = generateRecoveryCode();
    recoveryCodes.push(codeValue);
    hashes.push(hashRecoveryCode(codeValue));
  }

  await db.query(
    `UPDATE users
     SET totp_enabled = TRUE,
         totp_enrolled_at = CURRENT_TIMESTAMP,
         totp_failed_attempts = 0,
         totp_locked_until = NULL,
         totp_recovery_codes = $1
     WHERE id = $2`,
    [JSON.stringify(hashes), userId]
  );

  return { recoveryCodes };
};

/**
 * Verify a TOTP code with brute-force lockout. Throws TwoFactorError.
 */
exports.verifyTotpCode = async ({ userId, code }) => {
  const user = await loadUserTotp(userId);
  if (!user || !user.totp_secret || !user.totp_enabled) {
    throw new TwoFactorError('TOTP_NOT_ENABLED', 'Two-factor authentication is not enabled.');
  }

  const now = Date.now();
  const lockedUntil = user.totp_locked_until ? new Date(user.totp_locked_until).getTime() : 0;
  if (lockedUntil > now) {
    throw new TwoFactorError(
      'TOTP_LOCKED',
      'Too many failed attempts. Try again in a few minutes.',
      { statusCode: 429, retryAfter: Math.ceil((lockedUntil - now) / 1000) }
    );
  }

  const secret = decryptNIN(user.totp_secret);
  const valid = authenticator.verify({ token: String(code || '').replace(/\s/g, ''), secret });

  if (valid) {
    await resetTotpFailures(userId);
    return true;
  }

  const attempts = (Number(user.totp_failed_attempts) || 0) + 1;
  if (attempts >= MAX_TOTP_ATTEMPTS) {
    await saveTotpFailure(userId, 0, new Date(now + TOTP_LOCK_MS));
    throw new TwoFactorError(
      'TOTP_LOCKED',
      'Too many failed attempts. Two-factor authentication is locked for 15 minutes.',
      { statusCode: 429, retryAfter: Math.ceil(TOTP_LOCK_MS / 1000) }
    );
  }

  await saveTotpFailure(userId, attempts, null);
  throw new TwoFactorError(
    'TOTP_INVALID',
    `Invalid code. ${MAX_TOTP_ATTEMPTS - attempts} attempt(s) remaining.`
  );
};

/**
 * Verify a single-use recovery code and consume it on success.
 */
exports.verifyRecoveryCode = async ({ userId, code }) => {
  const user = await loadUserTotp(userId);
  if (!user || !user.totp_enabled) {
    throw new TwoFactorError('TOTP_NOT_ENABLED', 'Two-factor authentication is not enabled.');
  }

  const stored = Array.isArray(user.totp_recovery_codes) ? user.totp_recovery_codes : [];
  const normalized = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
  const target = hashRecoveryCode(normalized);

  const index = stored.indexOf(target);
  if (index === -1) {
    throw new TwoFactorError('RECOVERY_CODE_INVALID', 'That recovery code is not valid or has already been used.');
  }

  stored.splice(index, 1);
  await db.query(
    `UPDATE users SET totp_recovery_codes = $1 WHERE id = $2`,
    [JSON.stringify(stored), userId]
  );
  return true;
};

/**
 * Send an SMS OTP for withdrawal confirmation to the user's phone.
 */
exports.sendSmsWithdrawalOtp = async ({ userId, phone }) => {
  const cleanPhone = String(phone || '').replace(/\s+/g, '');
  if (!cleanPhone) {
    throw new TwoFactorError('NO_PHONE', 'No phone number is attached to your account. Please contact support.');
  }

  const result = await sendVerificationCode(cleanPhone);
  if (!result.success) {
    throw new TwoFactorError(
      'OTP_SEND_FAILED',
      result.message || 'Could not send the verification code. Please try again shortly.',
      { statusCode: 429 }
    );
  }

  await otpStoreSet(`otp:w2fa:${userId}`, { code: result.code }, SMS_OTP_TTL_SECONDS);
  return true;
};

/**
 * Verify the SMS OTP previously sent for withdrawal confirmation.
 */
exports.verifySmsWithdrawalOtp = async ({ userId, code }) => {
  const key = `otp:w2fa:${userId}`;
  const stored = await otpStoreGet(key);

  if (!stored) {
    throw new TwoFactorError('OTP_EXPIRED', 'The verification code has expired. Request a new one.');
  }

  const provided = String(code || '').trim();
  const storedString = String(stored.code);
  if (
    storedString.length !== provided.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(storedString))
  ) {
    throw new TwoFactorError('OTP_INVALID', 'The verification code you entered is not correct.');
  }

  await otpStoreDelete(key);
  return true;
};

/**
 * The withdrawal gate. Returns { method } when verification passes.
 * Throws TwoFactorError with code OTP_REQUIRED when a code is missing so the
 * client knows which method to present.
 */
exports.verifyWithdrawalFactor = async ({ user, body }) => {
  const totpCode = String(body.totp_code || '').trim();
  const smsCode = String(body.otp || '').trim();
  const recoveryCode = String(body.recovery_code || '').trim();

  const userRow = await loadUserTotp(user.id);
  const totpEnabled = userRow?.totp_enabled === true;

  if (totpEnabled) {
    if (recoveryCode) {
      await exports.verifyRecoveryCode({ userId: user.id, code: recoveryCode });
      return { method: 'recovery' };
    }
    if (!totpCode) {
      throw new TwoFactorError('OTP_REQUIRED', 'Enter the code from your authenticator app to continue.', {
        statusCode: 428,
        method: 'totp',
      });
    }
    await exports.verifyTotpCode({ userId: user.id, code: totpCode });
    return { method: 'totp' };
  }

  if (recoveryCode || totpCode) {
    throw new TwoFactorError('OTP_METHOD_MISMATCH', 'SMS verification is required for this account.');
  }

  if (!smsCode) {
    throw new TwoFactorError('OTP_REQUIRED', 'Enter the code sent to your phone to continue.', {
      statusCode: 428,
      method: 'sms',
    });
  }

  await exports.verifySmsWithdrawalOtp({ userId: user.id, code: smsCode });
  return { method: 'sms' };
};

/**
 * TOTP enrollment status.
 */
exports.getTotpStatus = async (userId) => {
  const user = await loadUserTotp(userId);
  return { totp_enabled: user?.totp_enabled === true };
};

/**
 * Express middleware: verify the withdrawal 2FA factor from req.body and
 * respond with 428/400 on failure. Passes through on success.
 */
exports.requireWithdrawalFactor = async (req, res, next) => {
  const ok = await exports.runWithdrawalFactorCheck(req, res);
  if (ok) next();
};

/**
 * Check the withdrawal factor for a request and respond on failure.
 * Returns true when the check passed, false when a response was already sent.
 */
exports.runWithdrawalFactorCheck = async (req, res) => {
  try {
    await exports.verifyWithdrawalFactor({ user: req.user, body: req.body || {} });
    return true;
  } catch (error) {
    if (error instanceof TwoFactorError) {
      res.status(error.statusCode || 400).json({
        success: false,
        code: error.code,
        message: error.message,
        method: error.extra?.method || undefined,
        retry_after: error.extra?.retryAfter || undefined,
      });
    } else {
      res.status(500).json({ success: false, message: 'Two-factor check failed' });
    }
    return false;
  }
};

exports.TwoFactorError = TwoFactorError;
