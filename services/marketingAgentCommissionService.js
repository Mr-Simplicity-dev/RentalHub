const db = require('../config/middleware/database');
const logger = require('../config/utils/logger');
const { creditWallet, debitWallet, getWalletBalance } = require('./walletLedgerService');

const CONFIG_KEYS = {
  enabled: 'marketing_agent_commission_enabled',
  clawbackDays: 'marketing_agent_clawback_days',
  tenantVerify: 'marketing_agent_tenant_verify_amount',
  tenantRegistrationPaid: 'marketing_agent_tenant_registration_paid_amount',
  landlordVerify: 'marketing_agent_landlord_verify_amount',
  landlordRegistrationPaid: 'marketing_agent_landlord_registration_paid_amount',
};

const FALLBACK = {
  enabled: true,
  clawbackDays: 30,
  tenantVerify: 120,
  tenantRegistrationPaid: 80,
  landlordVerify: 240,
  landlordRegistrationPaid: 160,
};

const getConfig = async () => {
  try {
    const result = await db.query(
      `SELECT key, value FROM commission_config WHERE key = ANY($1::text[])`,
      [Object.values(CONFIG_KEYS)]
    );
    const map = new Map(result.rows.map((row) => [row.key, Number(row.value)]));

    return {
      enabled: map.has(CONFIG_KEYS.enabled)
        ? map.get(CONFIG_KEYS.enabled) !== 0
        : FALLBACK.enabled,
      clawbackDays: map.get(CONFIG_KEYS.clawbackDays) ?? FALLBACK.clawbackDays,
      tenantVerify: map.get(CONFIG_KEYS.tenantVerify) ?? FALLBACK.tenantVerify,
      tenantRegistrationPaid:
        map.get(CONFIG_KEYS.tenantRegistrationPaid) ?? FALLBACK.tenantRegistrationPaid,
      landlordVerify: map.get(CONFIG_KEYS.landlordVerify) ?? FALLBACK.landlordVerify,
      landlordRegistrationPaid:
        map.get(CONFIG_KEYS.landlordRegistrationPaid) ?? FALLBACK.landlordRegistrationPaid,
    };
  } catch (error) {
    logger.error('Marketing agent commission config failed:', error.message);
    return { ...FALLBACK };
  }
};

const amountFor = (config, accountType, stage) => {
  const isLandlord = accountType === 'landlord';
  if (stage === 'verified') {
    return isLandlord ? config.landlordVerify : config.tenantVerify;
  }
  return isLandlord ? config.landlordRegistrationPaid : config.tenantRegistrationPaid;
};

/**
 * Credit an agent for one stage of one account they opened.
 *
 * Safe to call more than once: the unique (new_user_id, stage) constraint plus the
 * wallet ledger's reference idempotency mean a repeated call is a no-op, never a
 * double payment.
 */
const qualifyCommission = async ({ newUserId, stage, paymentId = null, source = null }) => {
  if (!newUserId || !['verified', 'registration_paid'].includes(stage)) return null;

  try {
    const config = await getConfig();
    if (!config.enabled) return null;

    const userResult = await db.query(
      `SELECT id, user_type, full_name, created_by_agent_id
         FROM users
        WHERE id = $1 AND deleted_at IS NULL`,
      [newUserId]
    );
    if (!userResult.rows.length) return null;

    const user = userResult.rows[0];
    const agentUserId = user.created_by_agent_id;
    if (!agentUserId) return null;

    const accountType = String(user.user_type || '').toLowerCase();
    if (!['tenant', 'landlord'].includes(accountType)) return null;

    // Never pay an agent for opening an account for themselves.
    if (Number(agentUserId) === Number(newUserId)) return null;

    const amount = amountFor(config, accountType, stage);
    if (!amount || amount <= 0) return null;

    const inserted = await db.query(
      `INSERT INTO marketing_agent_commissions
         (agent_user_id, new_user_id, account_type, stage, amount, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'qualified', $6::jsonb)
       ON CONFLICT (new_user_id, stage) DO NOTHING
       RETURNING *`,
      [
        agentUserId,
        newUserId,
        accountType,
        stage,
        amount,
        JSON.stringify({ source, payment_id: paymentId, new_user_name: user.full_name || null }),
      ]
    );

    if (!inserted.rows.length) return null;

    const commission = inserted.rows[0];

    await creditWallet({
      userId: agentUserId,
      amount,
      source: 'marketing_agent_commission',
      description:
        stage === 'verified'
          ? `Marketing commission — ${accountType} signup verified`
          : `Marketing commission — ${accountType} registration paid`,
      reference: `mac-${commission.id}`,
      metadata: {
        commission_id: commission.id,
        new_user_id: newUserId,
        stage,
        account_type: accountType,
      },
    });

    return commission;
  } catch (error) {
    logger.error('Marketing agent commission qualify failed:', error.message);
    return null;
  }
};

/** Reverse every commission for an account that was deleted or refunded. */
const reverseCommissionsForUser = async ({ newUserId, reason = 'account reversed' }) => {
  if (!newUserId) return 0;

  try {
    const config = await getConfig();
    const cutoffDays = Number(config.clawbackDays) || 30;

    const rows = await db.query(
      `UPDATE marketing_agent_commissions
          SET status = 'reversed',
              reversed_at = CURRENT_TIMESTAMP,
              reversed_reason = $2
        WHERE new_user_id = $1
          AND status = 'qualified'
          AND qualified_at > CURRENT_TIMESTAMP - ($3::int || ' days')::interval
        RETURNING *`,
      [newUserId, reason, cutoffDays]
    );

    for (const commission of rows.rows) {
      await debitWallet({
        userId: commission.agent_user_id,
        amount: Number(commission.amount),
        source: 'marketing_agent_commission_reversal',
        description: `Marketing commission reversed — ${reason}`,
        reference: `macr-${commission.id}`,
        metadata: { commission_id: commission.id, new_user_id: newUserId },
      });
    }

    return rows.rows.length;
  } catch (error) {
    logger.error('Marketing agent commission reversal failed:', error.message);
    return 0;
  }
};

/** The agent's shareable signup link — the person registers themselves with it. */
const getAgentInvite = async ({ agentUserId, origin = null }) => {
  const { getOrCreateReferralCode, buildInviteUrl } = require('./referralService');
  const referralCode = await getOrCreateReferralCode(agentUserId);
  if (!referralCode) return { referral_code: null, invite_url: null };
  return {
    referral_code: referralCode,
    invite_url: buildInviteUrl(referralCode, origin),
  };
};

/**
 * Map a signup referral code back to the marketing agent who owns it.
 * Returns null for ordinary tenant/landlord referral codes.
 */
const resolveMarketingAgentByCode = async (rawCode) => {
  const code = String(rawCode || '').trim();
  if (!code) return null;

  try {
    const result = await db.query(
      `SELECT id, user_type
         FROM users
        WHERE referral_code = $1
          AND deleted_at IS NULL
        LIMIT 1`,
      [code]
    );
    if (!result.rows.length) return null;

    const owner = result.rows[0];
    if (String(owner.user_type || '').toLowerCase() !== 'marketing_agent') return null;
    return owner.id;
  } catch (error) {
    logger.error('Marketing agent referral lookup failed:', error.message);
    return null;
  }
};

/** Everything the agent sees about their own commissions. */
const getAgentCommissionSummary = async (agentUserId) => {
  const [totals, recent, wallet] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'qualified'), 0)::numeric AS total_earned,
         COUNT(*) FILTER (WHERE status = 'qualified') AS qualified_count,
         COUNT(*) FILTER (WHERE status = 'reversed') AS reversed_count
       FROM marketing_agent_commissions
       WHERE agent_user_id = $1`,
      [agentUserId]
    ),
    db.query(
      `SELECT c.id, c.stage, c.account_type, c.amount, c.status, c.qualified_at,
              u.full_name AS new_user_name, u.email AS new_user_email
         FROM marketing_agent_commissions c
         JOIN users u ON u.id = c.new_user_id
        WHERE c.agent_user_id = $1
        ORDER BY c.qualified_at DESC
        LIMIT 50`,
      [agentUserId]
    ),
    getWalletBalance(agentUserId),
  ]);

  const row = totals.rows[0] || {};
  return {
    total_earned: Number(row.total_earned || 0),
    qualified_count: Number(row.qualified_count || 0),
    reversed_count: Number(row.reversed_count || 0),
    wallet_balance: Number(wallet || 0),
    commissions: recent.rows,
  };
};

/**
 * Pay the verification stage for every agent-opened account that has now verified
 * both email and phone.
 *
 * A sweep rather than a hook on each of the many verification handlers: there is one
 * place to get right, it self-heals if a call is missed, and the unique constraint
 * makes it safe to run as often as you like.
 */
const sweepVerifiedCommissions = async () => {
  try {
    const config = await getConfig();
    if (!config.enabled) return 0;

    const result = await db.query(
      `SELECT u.id
         FROM users u
        WHERE u.created_by_agent_id IS NOT NULL
          AND u.deleted_at IS NULL
          AND u.email_verified = TRUE
          AND u.phone_verified = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM marketing_agent_commissions c
             WHERE c.new_user_id = u.id AND c.stage = 'verified'
          )
        LIMIT 200`
    );

    let paid = 0;
    for (const row of result.rows) {
      const commission = await qualifyCommission({
        newUserId: row.id,
        stage: 'verified',
        source: 'verification_sweep',
      });
      if (commission) paid += 1;
    }
    return paid;
  } catch (error) {
    logger.error('Marketing agent verification sweep failed:', error.message);
    return 0;
  }
};

/** Admin view: how each marketing agent is performing. */
const getAgentCommissionLeaderboard = async () => {
  const result = await db.query(
    `SELECT
       c.agent_user_id,
       u.full_name AS agent_name,
       u.email AS agent_email,
       COUNT(*) FILTER (WHERE c.status = 'qualified') AS qualified_count,
       COUNT(*) FILTER (WHERE c.status = 'reversed') AS reversed_count,
       COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'qualified'), 0)::numeric AS total_earned,
       COUNT(DISTINCT c.new_user_id) AS accounts_opened,
       MAX(c.qualified_at) AS last_activity
     FROM marketing_agent_commissions c
     JOIN users u ON u.id = c.agent_user_id
     GROUP BY c.agent_user_id, u.full_name, u.email
     ORDER BY total_earned DESC`
  );

  return result.rows.map((row) => ({
    ...row,
    qualified_count: Number(row.qualified_count || 0),
    reversed_count: Number(row.reversed_count || 0),
    total_earned: Number(row.total_earned || 0),
    accounts_opened: Number(row.accounts_opened || 0),
  }));
};

module.exports = {
  getConfig,
  qualifyCommission,
  reverseCommissionsForUser,
  sweepVerifiedCommissions,
  getAgentInvite,
  resolveMarketingAgentByCode,
  getAgentCommissionSummary,
  getAgentCommissionLeaderboard,
};
