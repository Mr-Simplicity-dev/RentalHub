const crypto = require('crypto');
const db = require('../config/middleware/database');
const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
const { getFrontendUrl } = require('../config/utils/frontendUrl');
const {
  ensureSubscriptionCreditSchema,
  getSubscriptionCreditBalance,
  creditSubscriptionBalance,
} = require('./subscriptionCreditService');

const REFERRAL_FEATURE_FLAG = 'tenant_landlord_referrals';
const REFERRAL_REWARD_AMOUNT_NGN = 1000;
const REFERRAL_CODE_MAX_LENGTH = 64;
const REFERRAL_ELIGIBLE_USER_TYPES = ['tenant', 'landlord'];

let referralSchemaReady = false;

const normalizeReferralCode = (value) => {
  const cleanValue = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

  if (!cleanValue || cleanValue.length > REFERRAL_CODE_MAX_LENGTH) {
    return '';
  }

  return /^[A-Z0-9_-]+$/.test(cleanValue) ? cleanValue : '';
};

const ensureReferralSchema = async () => {
  if (referralSchemaReady) return;

  await ensureSubscriptionCreditSchema();

  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referral_code VARCHAR(64);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique
      ON users(referral_code)
      WHERE referral_code IS NOT NULL AND referral_code <> '';

    CREATE TABLE IF NOT EXISTS user_referrals (
      id               SERIAL PRIMARY KEY,
      referrer_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      referral_code    VARCHAR(64) NOT NULL,
      reward_amount    NUMERIC(12,2) NOT NULL DEFAULT 1000,
      reward_status    VARCHAR(20) NOT NULL DEFAULT 'credited',
      credited_at      TIMESTAMP,
      created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_user_referrals_reward_status
        CHECK (reward_status IN ('credited','reversed'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer
      ON user_referrals(referrer_id);

    CREATE INDEX IF NOT EXISTS idx_user_referrals_code
      ON user_referrals(referral_code);

    CREATE TABLE IF NOT EXISTS feature_flags (
      key VARCHAR(100) PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO feature_flags (key, enabled, description)
    VALUES (
      '${REFERRAL_FEATURE_FLAG}',
      TRUE,
      'Allow tenants and landlords to earn N1,000 subscription credit for successful referral registrations.'
    )
    ON CONFLICT (key)
    DO UPDATE SET description = EXCLUDED.description;
  `);

  referralSchemaReady = true;
};

const buildReferralCode = (userId) => {
  const idPart = Number(userId).toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `RH${idPart}${randomPart}`;
};

const getOrCreateReferralCode = async (userId) => {
  await ensureReferralSchema();

  const existing = await db.query(
    `SELECT referral_code
     FROM users
     WHERE id = $1
       AND referral_code IS NOT NULL
       AND referral_code <> ''
     LIMIT 1`,
    [userId]
  );

  if (existing.rows[0]?.referral_code) {
    return existing.rows[0].referral_code;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nextCode = buildReferralCode(userId);

    try {
      const updated = await db.query(
        `UPDATE users
         SET referral_code = $1
         WHERE id = $2
           AND (referral_code IS NULL OR referral_code = '')
         RETURNING referral_code`,
        [nextCode, userId]
      );

      if (updated.rows[0]?.referral_code) {
        return updated.rows[0].referral_code;
      }

      const refreshed = await db.query(
        `SELECT referral_code FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );

      if (refreshed.rows[0]?.referral_code) {
        return refreshed.rows[0].referral_code;
      }
    } catch (error) {
      if (error.code !== '23505') {
        throw error;
      }
    }
  }

  const error = new Error('Unable to generate referral code');
  error.statusCode = 500;
  throw error;
};

const buildInviteUrl = (referralCode, origin) => {
  const frontendUrl = getFrontendUrl(origin);
  return `${frontendUrl}/register?ref=${encodeURIComponent(referralCode)}`;
};

const getReferralProgramForUser = async ({ user, origin }) => {
  await ensureReferralSchema();

  if (!REFERRAL_ELIGIBLE_USER_TYPES.includes(user?.user_type)) {
    const error = new Error('Referral invites are only available to tenants and landlords');
    error.statusCode = 403;
    throw error;
  }

  const flags = await getFeatureFlagsMap();
  const enabled = flags[REFERRAL_FEATURE_FLAG] !== false;
  const referralCode = enabled ? await getOrCreateReferralCode(user.id) : null;

  const summaryResult = await db.query(
    `SELECT
       COUNT(*)::int AS total_referrals,
       COALESCE(SUM(reward_amount) FILTER (WHERE reward_status = 'credited'), 0)::numeric AS total_earned
     FROM user_referrals
     WHERE referrer_id = $1`,
    [user.id]
  );
  const subscriptionCreditBalance = await getSubscriptionCreditBalance(user.id);

  const summary = summaryResult.rows[0] || {};

  return {
    enabled,
    reward_amount: REFERRAL_REWARD_AMOUNT_NGN,
    referral_code: referralCode,
    invite_url: referralCode ? buildInviteUrl(referralCode, origin) : null,
    total_referrals: Number(summary.total_referrals || 0),
    total_earned: Number(summary.total_earned || 0),
    subscription_credit_balance: subscriptionCreditBalance,
  };
};

const creditReferralRewardForRegistration = async ({
  referralCode,
  referredUserId,
}) => {
  const cleanReferralCode = normalizeReferralCode(referralCode);

  if (!cleanReferralCode || !referredUserId) {
    return null;
  }

  await ensureReferralSchema();

  const flags = await getFeatureFlagsMap();
  if (flags[REFERRAL_FEATURE_FLAG] === false) {
    return { credited: false, reason: 'disabled' };
  }

  const referrerResult = await db.query(
    `SELECT id, user_type
     FROM users
     WHERE referral_code = $1
       AND user_type = ANY($2)
       AND deleted_at IS NULL
       AND COALESCE(is_active, TRUE) = TRUE
     LIMIT 1`,
    [cleanReferralCode, REFERRAL_ELIGIBLE_USER_TYPES]
  );

  const referrer = referrerResult.rows[0];

  if (!referrer) {
    return { credited: false, reason: 'invalid_referral_code' };
  }

  if (Number(referrer.id) === Number(referredUserId)) {
    return { credited: false, reason: 'self_referral' };
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const referralResult = await client.query(
      `INSERT INTO user_referrals (
         referrer_id,
         referred_user_id,
         referral_code,
         reward_amount,
         reward_status,
         credited_at
       )
       VALUES ($1, $2, $3, $4, 'credited', CURRENT_TIMESTAMP)
       ON CONFLICT (referred_user_id) DO NOTHING
       RETURNING *`,
      [
        referrer.id,
        referredUserId,
        cleanReferralCode,
        REFERRAL_REWARD_AMOUNT_NGN,
      ]
    );

    if (!referralResult.rows.length) {
      await client.query('COMMIT');
      return { credited: false, reason: 'already_rewarded' };
    }

    await creditSubscriptionBalance({
      userId: referrer.id,
      amount: REFERRAL_REWARD_AMOUNT_NGN,
      source: 'referral_reward',
      reference: `REFERRAL_${referralResult.rows[0].id}`,
      metadata: {
        referred_user_id: referredUserId,
        referral_code: cleanReferralCode,
      },
      executor: client,
    });

    await client.query('COMMIT');

    return {
      credited: true,
      referrer_id: referrer.id,
      reward_amount: REFERRAL_REWARD_AMOUNT_NGN,
      referral_id: referralResult.rows[0].id,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  REFERRAL_FEATURE_FLAG,
  REFERRAL_REWARD_AMOUNT_NGN,
  normalizeReferralCode,
  ensureReferralSchema,
  getReferralProgramForUser,
  creditReferralRewardForRegistration,
};
