const logger = require('../config/utils/logger');
const axios = require('axios');
const db = require('../config/middleware/database');
const cfg = require('../config/utils/commissionConfig');
const {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCodeFromName,
} = require('./paystackTransfer.service');

// Namespace helpers for DB-backed config keys
const pfx = (payType, key) => `${payType}_${key}`;

const loadCommissionRates = async () => {
  const PAY_TYPES = [
    'rent_payment', 'tenant_subscription', 'tenant_multiple_property_subscription',
    'landlord_subscription', 'landlord_listing', 'wallet_funding', 'property_unlock',
  ];
  const config = await cfg.getAll();
  const rates = {};
  for (const t of PAY_TYPES) {
    rates[t] = {
      platform_fee_rate: config[pfx(t, 'platform_fee_rate')] || 0.05,
      admin_share: config[pfx(t, 'admin_share')] || 0.09,
      super_admin_share: config[pfx(t, 'super_admin_share')] || 0.06,
    };
  }
  return rates;
};

const loadBonusConfig = async () => {
  const config = await cfg.getAll();
  return {
    monthly_volume: {
      [config.perf_bonus_volume_1m_volume || 1000000]: config.perf_bonus_volume_1m || 50000,
      [config.perf_bonus_volume_5m_volume || 5000000]: config.perf_bonus_volume_5m || 250000,
      [config.perf_bonus_volume_10m_volume || 10000000]: config.perf_bonus_volume_10m || 600000,
    },
    user_growth: {
      50: config.perf_bonus_growth_50 || 10000,
      100: config.perf_bonus_growth_100 || 25000,
      200: config.perf_bonus_growth_200 || 60000,
    },
  };
};

const loadLawyerFeeConfig = async () => {
  const config = await cfg.getAll();
  return {
    total: config.lawyer_access_fee_total || 2000,
    distribution: {
      assigned_lawyer: config.lawyer_access_fee_assigned_lawyer || 100,
      assigned_agent: config.lawyer_access_fee_assigned_agent || 80,
      super_admin_base: config.lawyer_access_fee_super_admin_base || 120,
      state_admin: config.lawyer_access_fee_state_admin || 140,
      state_financial_admin: config.lawyer_access_fee_state_financial_admin || 140,
      state_support_admin: config.lawyer_access_fee_state_support_admin || 140,
      state_lawyer_admin: config.lawyer_access_fee_state_lawyer_admin || 140,
      super_financial_admin: config.lawyer_access_fee_super_financial_admin || 200,
      super_support_admin: config.lawyer_access_fee_super_support_admin || 200,
      super_lawyer_admin: config.lawyer_access_fee_super_lawyer_admin || 200,
      fumigation_admin: config.lawyer_access_fee_fumigation_admin || 120,
      transportation_admin: config.lawyer_access_fee_transportation_admin || 120,
    },
  };
};

const loadAgentFeeConfig = async () => {
  const config = await cfg.getAll();
  return {
    total: config.agent_access_fee_total || 5000,
    distribution: {
      assigned_agent: config.agent_access_fee_assigned_agent || 2800,
      assigned_lawyer: config.agent_access_fee_assigned_lawyer || 500,
      super_admin: config.agent_access_fee_super_admin || 800,
      state_admin: config.agent_access_fee_state_admin || 100,
    },
  };
};

exports.calculateCommission = async (paymentId, userId, amount, paymentType, propertyId = null) => {
  try {
    const COMMISSION_RATES = await loadCommissionRates();
    const suspendedAdminPct = await cfg.get('suspended_admin_redistribution_pct', 0.60);

    let propertyState = null;
    let propertyCity = null;

    if (propertyId) {
      const propertyResult = await db.query(
        'SELECT state, city FROM properties WHERE id = $1',
        [propertyId]
      );
      if (propertyResult.rows.length > 0) {
        propertyState = propertyResult.rows[0].state;
        propertyCity = propertyResult.rows[0].city;
      }
    }

    const userResult = await db.query(
      'SELECT referred_by FROM users WHERE id = $1',
      [userId]
    );
    const referredBy = userResult.rows[0]?.referred_by;
    if (!referredBy) {
      logger.info(`No admin referral found for user ${userId}`);
      return null;
    }

    const adminCheck = await db.query(
      `SELECT id, assigned_state, assigned_city, admin_commission_rate,
              admin_funds_frozen, is_active, account_suspended_at
       FROM users WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin')`,
      [referredBy]
    );

    if (adminCheck.rows.length === 0) {
      logger.info(`Referred user ${referredBy} is not a state admin`);
      return null;
    }

    const admin = adminCheck.rows[0];
    const isFundsFrozen = admin.admin_funds_frozen;

    if (propertyState && admin.assigned_state &&
        propertyState.toLowerCase() !== admin.assigned_state.toLowerCase()) {
      logger.info(`Transaction not in admin's assigned state: ${propertyState} vs ${admin.assigned_state}`);
      return null;
    }

    if (propertyCity && admin.assigned_city &&
        propertyCity.toLowerCase() !== admin.assigned_city.toLowerCase()) {
      logger.info(`Transaction not in admin's assigned city: ${propertyCity} vs ${admin.assigned_city}`);
      return null;
    }

    const commissionConfig = COMMISSION_RATES[paymentType];
    if (!commissionConfig) {
      logger.info(`No commission config for payment type: ${paymentType}`);
      return null;
    }

    const platformFee = amount * commissionConfig.platform_fee_rate;
    const finalCommissionRate = admin.admin_commission_rate || commissionConfig.admin_share;
    const finalCommission = platformFee * finalCommissionRate;

    const referralAdminId = admin.id;
    const isAdminSuspended = admin.is_active === false || admin.account_suspended_at !== null;

    const superAdminResult = await db.query(
      `SELECT id FROM users
       WHERE user_type = 'super_admin'
         AND deleted_at IS NULL AND account_suspended_at IS NULL AND admin_funds_frozen = false
       LIMIT 1`
    );
    const defaultSuperAdminId = superAdminResult.rows[0]?.id || null;

    if (isAdminSuspended) {
      logger.info(`Admin ${referralAdminId} is suspended, redistributing commission`);

      const redistPct = suspendedAdminPct;
      const suspendedShare = Math.round(finalCommission * redistPct * 100) / 100;
      const superShare = finalCommission - suspendedShare;

      const activeStateAdminsResult = await db.query(
        `SELECT id FROM users
         WHERE user_type IN ('state_admin', 'state_financial_admin')
           AND LOWER(assigned_state) = LOWER($1) AND id != $2
           AND deleted_at IS NULL AND account_suspended_at IS NULL
           AND admin_funds_frozen = false AND is_active = true`,
        [admin.assigned_state, referralAdminId]
      );

      const activeStateAdmins = activeStateAdminsResult.rows;
      const distribution = {};

      if (activeStateAdmins.length > 0) {
        const equalShare = Math.round((suspendedShare / activeStateAdmins.length) * 100) / 100;
        let distributedSoFar = 0;
        for (let i = 0; i < activeStateAdmins.length; i++) {
          const share = (i === activeStateAdmins.length - 1) ? suspendedShare - distributedSoFar : equalShare;
          distribution[activeStateAdmins[i].id] = (distribution[activeStateAdmins[i].id] || 0) + share;
          distributedSoFar += share;
        }
      } else {
        if (defaultSuperAdminId) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + suspendedShare;
        }
      }

      if (defaultSuperAdminId && superShare > 0) {
        distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + superShare;
      }

      const commissionIds = [];
      for (const [distAdminId, distAmount] of Object.entries(distribution)) {
        if (distAmount <= 0) continue;

        const distResult = await db.query(
          `INSERT INTO admin_commissions (admin_id, user_id, payment_id, amount, source, commission_rate, state, city, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING id`,
          [distAdminId, userId, paymentId, distAmount, paymentType, finalCommissionRate, propertyState, propertyCity]
        );
        commissionIds.push(distResult.rows[0].id);

        await db.query(
          `UPDATE users SET admin_wallet_balance = admin_wallet_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [distAmount, distAdminId]
        );

        await db.query(
          `INSERT INTO transaction_audits (payment_id, user_id, admin_id, action_type, amount, description)
           VALUES ($1, $2, $3, 'commission_earned', $4, $5)`,
          [paymentId, userId, distAdminId, distAmount,
           `Redistributed commission (admin suspended) from ${paymentType}: ₦${distAmount.toLocaleString()}`]
        );
      }

      logger.info(`Commission redistributed: ₦${finalCommission.toLocaleString()} (${Math.round(redistPct*100)}% to state admins, ${Math.round((1-redistPct)*100)}% to super admin) for suspended admin ${referralAdminId}`);

      return {
        commission_id: commissionIds[0] || null, admin_id: null, amount: finalCommission,
        rate: finalCommissionRate, platform_fee: platformFee, super_admin_commission: 0,
        redistributed: true, distribution,
      };
    }

    const commissionDescription = isFundsFrozen
      ? `Commission earned from ${paymentType} (while funds frozen): ₦${finalCommission.toLocaleString()}`
      : `Commission earned from ${paymentType}: ₦${finalCommission.toLocaleString()}`;

    const commissionResult = await db.query(
      `INSERT INTO admin_commissions (admin_id, user_id, payment_id, amount, source, commission_rate, state, city, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING id`,
      [admin.id, userId, paymentId, finalCommission, paymentType, finalCommissionRate, propertyState, propertyCity]
    );

    await db.query(
      `UPDATE users SET admin_wallet_balance = admin_wallet_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [finalCommission, admin.id]
    );

    await db.query(
      `INSERT INTO transaction_audits (payment_id, user_id, admin_id, action_type, amount, description)
       VALUES ($1, $2, $3, 'commission_earned', $4, $5)`,
      [paymentId, userId, admin.id, finalCommission, commissionDescription]
    );

    const statusNote = isFundsFrozen ? ' (funds frozen - withdrawal blocked)' : '';
    logger.info(`Commission calculated: ₦${finalCommission.toLocaleString()} for admin ${admin.id}${statusNote}`);

    return {
      commission_id: commissionResult.rows[0].id, admin_id: admin.id, amount: finalCommission,
      rate: finalCommissionRate, platform_fee: platformFee, super_admin_commission: 0,
      ...(isFundsFrozen && { funds_frozen: true }),
    };
  } catch (error) {
    logger.error('Calculate commission error:', error);
    return null;
  }
};

exports.processPaymentCommission = async (paymentId) => {
  try {
    const paymentResult = await db.query(
      `SELECT p.*, prop_state.state_name as property_state, prop.city as property_city
       FROM payments p
       LEFT JOIN properties prop ON p.property_id = prop.id
       LEFT JOIN states prop_state ON prop_state.id = prop.state_id
       WHERE p.id = $1 AND p.payment_status = 'completed'`,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      logger.info(`Payment ${paymentId} not found or not completed`);
      return false;
    }

    const payment = paymentResult.rows[0];
    const commission = await exports.calculateCommission(
      paymentId, payment.user_id, parseFloat(payment.amount), payment.payment_type, payment.property_id
    );

    if (!commission) {
      logger.info(`No commission calculated for payment ${paymentId}`);
      return false;
    }

    return commission;
  } catch (error) {
    logger.error('Process payment commission error:', error);
    return false;
  }
};

exports.calculatePerformanceBonus = async (adminId, month, year) => {
  try {
    const PERFORMANCE_BONUS_THRESHOLDS = await loadBonusConfig();
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const volumeResult = await db.query(
      `SELECT SUM(p.amount) as monthly_volume, COUNT(DISTINCT p.user_id) as unique_users, COUNT(DISTINCT u.id) as new_users
       FROM payments p
       LEFT JOIN users u ON p.user_id = u.id AND u.referred_by = $1
       WHERE p.payment_status = 'completed' AND p.created_at >= $2 AND p.created_at <= $3
         AND EXISTS (
           SELECT 1 FROM properties prop
           LEFT JOIN states prop_state ON prop_state.id = prop.state_id
           WHERE prop.id = p.property_id AND LOWER(prop_state.state_name) = LOWER((SELECT assigned_state FROM users WHERE id = $1))
         )`,
      [adminId, startDate, endDate]
    );

    const volumeData = volumeResult.rows[0];
    const monthlyVolume = parseFloat(volumeData.monthly_volume) || 0;
    const newUsers = parseInt(volumeData.new_users) || 0;

    let volumeBonus = 0;
    for (const [threshold, bonus] of Object.entries(PERFORMANCE_BONUS_THRESHOLDS.monthly_volume)) {
      if (monthlyVolume >= parseInt(threshold)) volumeBonus = bonus;
    }

    let growthBonus = 0;
    for (const [threshold, bonus] of Object.entries(PERFORMANCE_BONUS_THRESHOLDS.user_growth)) {
      if (newUsers >= parseInt(threshold)) growthBonus = bonus;
    }

    const totalBonus = volumeBonus + growthBonus;
    if (totalBonus <= 0) return null;

    const bonusResult = await db.query(
      `INSERT INTO admin_commissions (admin_id, amount, source, commission_rate, status, description)
       VALUES ($1, $2, 'performance_bonus', 1.0, 'pending', $3) RETURNING id`,
      [adminId, totalBonus, `Performance bonus: ₦${volumeBonus.toLocaleString()} (volume) + ₦${growthBonus.toLocaleString()} (growth)`]
    );

    await db.query(
      `UPDATE users SET admin_wallet_balance = admin_wallet_balance + $1 WHERE id = $2`,
      [totalBonus, adminId]
    );

    await db.query(
      `INSERT INTO transaction_audits (admin_id, action_type, amount, description)
       VALUES ($1, 'commission_earned', $2, $3)`,
      [adminId, totalBonus, `Performance bonus earned: ₦${totalBonus.toLocaleString()}`]
    );

    return {
      bonus_id: bonusResult.rows[0].id, admin_id: adminId, amount: totalBonus,
      volume_bonus: volumeBonus, growth_bonus: growthBonus,
      monthly_volume: monthlyVolume, new_users: newUsers,
    };
  } catch (error) {
    logger.error('Calculate performance bonus error:', error);
    return null;
  }
};

exports.processAdminWithdrawal = async (adminId, amount, bankDetails, options = {}) => {
  const { directPayout = false, processedBy = null, adminNote = null } = options;

  try {
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    const PAYSTACK_BASE_URL = 'https://api.paystack.co';
    const minWithdrawal = await cfg.get('min_admin_withdrawal', 1000);

    if (!bankDetails.bank_code && bankDetails.bank_name) {
      bankDetails.bank_code = await resolveBankCodeFromName(bankDetails.bank_name);
    }

    if (PAYSTACK_SECRET_KEY && bankDetails.bank_name && bankDetails.account_number) {
      try {
        const banksRes = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        });
        const banks = banksRes.data?.data || [];
        const bank = banks.find(b =>
          b.name.toLowerCase().includes(bankDetails.bank_name.toLowerCase()) ||
          bankDetails.bank_name.toLowerCase().includes(b.name.toLowerCase())
        );
        if (bank) {
          const verifyRes = await axios.get(
            `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${bankDetails.account_number}&bank_code=${bankDetails.bank_code || bank.code}`,
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' } }
          );
          if (verifyRes.data?.status === true && verifyRes.data?.data?.account_name) {
            const verifiedName = verifyRes.data.data.account_name.trim().toLowerCase().replace(/\s+/g, ' ');
            const providedName = (bankDetails.account_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
            if (verifiedName !== providedName) {
              throw new Error(`Account name mismatch. The bank record shows "${verifyRes.data.data.account_name}". Please use the exact name as registered with your bank.`);
            }
          } else {
            throw new Error('Unable to verify account. Please check the account number and try again.');
          }
        } else {
          throw new Error('Bank not found. Please select a valid bank.');
        }
      } catch (verifyErr) {
        if (verifyErr.message && (verifyErr.message.includes('mismatch') || verifyErr.message.includes('bank') || verifyErr.message.includes('account'))) {
          throw verifyErr;
        }
        logger.error('Account verification error in withdrawal:', verifyErr?.response?.data || verifyErr.message);
        throw new Error('Could not verify account details. Please try again.');
      }
    }

    const adminResult = await db.query(
      `SELECT admin_wallet_balance, admin_funds_frozen, full_name, email, user_type
       FROM users WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin', 'financial_admin', 'super_financial_admin', 'super_admin')`,
      [adminId]
    );

    if (adminResult.rows.length === 0) throw new Error('Eligible admin not found');
    const admin = adminResult.rows[0];

    if (admin.admin_funds_frozen) throw new Error('Admin funds are frozen');
    if (parseFloat(admin.admin_wallet_balance) < amount) throw new Error('Insufficient wallet balance');

    const weeklyEarningsResult = await db.query(
      `SELECT SUM(amount) as weekly_earnings FROM admin_commissions
       WHERE admin_id = $1 AND status = 'pending' AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
      [adminId]
    );

    const weeklyEarnings = parseFloat(weeklyEarningsResult.rows[0].weekly_earnings) || 0;
    if (amount > weeklyEarnings) {
      throw new Error(`Weekly withdrawal limit exceeded. Maximum: ₦${weeklyEarnings.toLocaleString()}`);
    }

    const shouldUseTransaction = directPayout;
    if (shouldUseTransaction) await db.query('BEGIN');

    const withdrawalResult = await db.query(
      `INSERT INTO admin_withdrawals (admin_id, amount, bank_name, bank_code, account_number, account_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id, requested_at`,
      [adminId, amount, bankDetails.bank_name, bankDetails.bank_code || null, bankDetails.account_number, bankDetails.account_name]
    );

    const withdrawalId = withdrawalResult.rows[0].id;

    if (!directPayout) {
      await db.query(
        `UPDATE admin_commissions SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE admin_id = $1 AND status = 'pending' AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
        [adminId]
      );

      await db.query(
        `UPDATE users SET admin_wallet_balance = admin_wallet_balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [amount, adminId]
      );

      await db.query(
        `INSERT INTO transaction_audits (admin_id, action_type, amount, description)
         VALUES ($1, 'withdrawal_requested', $2, $3)`,
        [adminId, amount, `Withdrawal requested: ₦${amount.toLocaleString()} to ${bankDetails.bank_name}`]
      );

      return {
        withdrawal_id: withdrawalId, requested_at: withdrawalResult.rows[0].requested_at,
        amount: amount, new_balance: parseFloat(admin.admin_wallet_balance) - amount,
      };
    }

    try {
      if (!bankDetails.bank_code && bankDetails.bank_name) {
        bankDetails.bank_code = await resolveBankCodeFromName(bankDetails.bank_name);
      }

      let recipientCode = bankDetails.paystack_recipient_code;
      if (!recipientCode) {
        const recipient = await createTransferRecipient({
          name: bankDetails.account_name, accountNumber: bankDetails.account_number, bankCode: bankDetails.bank_code,
        });
        recipientCode = recipient.recipient_code;
      }

      const reference = `SAW_${withdrawalId}_${Date.now()}`;
      const transfer = await initiateTransfer({
        amount, recipientCode, reason: `Admin direct withdrawal #${withdrawalId}`, reference,
      });

      await db.query(
        `UPDATE admin_commissions SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE admin_id = $1 AND status = 'pending' AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
        [adminId]
      );

      await db.query(
        `UPDATE users SET admin_wallet_balance = admin_wallet_balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [amount, adminId]
      );

      await db.query(
        `UPDATE admin_withdrawals SET status = 'approved', bank_code = $1, paystack_recipient_code = $2,
         paystack_transfer_code = $3, paystack_transfer_reference = $4, paystack_transfer_status = $5,
         paystack_last_response = $6, payout_attempted_at = CURRENT_TIMESTAMP, processed_by = $7,
         processed_at = CURRENT_TIMESTAMP, admin_note = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9`,
        [bankDetails.bank_code || null, recipientCode, transfer?.transfer_code || null,
         transfer?.reference || reference, transfer?.status || 'pending', JSON.stringify(transfer || {}),
         processedBy, adminNote || 'Direct payout initiated', withdrawalId]
      );

      await db.query(
        `INSERT INTO transaction_audits (admin_id, action_type, amount, description, performed_by)
         VALUES ($1, 'withdrawal_approved', $2, $3, $4)`,
        [adminId, amount, `Direct withdrawal approved: ₦${amount.toLocaleString()}`, processedBy || adminId]
      );

      await db.query('COMMIT');

      return {
        withdrawal_id: withdrawalId, requested_at: withdrawalResult.rows[0].requested_at,
        amount: amount, status: 'approved', paystack_reference: reference,
        paystack_status: transfer?.status || 'pending', new_balance: parseFloat(admin.admin_wallet_balance) - amount,
      };
    } catch (directError) {
      await db.query('ROLLBACK');
      throw directError;
    }
  } catch (error) {
    logger.error('Process admin withdrawal error:', error);
    throw error;
  }
};

exports.getAdminCommissionSummary = async (adminId) => {
  try {
    const summaryResult = await db.query(
      `SELECT source, COUNT(*) as transaction_count, SUM(amount) as total_amount, AVG(commission_rate) as avg_rate, status
       FROM admin_commissions WHERE admin_id = $1 GROUP BY source, status ORDER BY source, status`,
      [adminId]
    );

    const weeklyResult = await db.query(
      `SELECT DATE(created_at) as date, SUM(amount) as daily_earnings, COUNT(*) as transaction_count
       FROM admin_commissions WHERE admin_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(created_at) ORDER BY date`,
      [adminId]
    );

    const monthlyResult = await db.query(
      `SELECT EXTRACT(MONTH FROM created_at) as month, EXTRACT(YEAR FROM created_at) as year,
              SUM(amount) as monthly_earnings, COUNT(*) as transaction_count
       FROM admin_commissions WHERE admin_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '365 days'
       GROUP BY EXTRACT(MONTH FROM created_at), EXTRACT(YEAR FROM created_at) ORDER BY year, month`,
      [adminId]
    );

    return { summary: summaryResult.rows, weekly: weeklyResult.rows, monthly: monthlyResult.rows };
  } catch (error) {
    logger.error('Get admin commission summary error:', error);
    throw error;
  }
};

exports.distributeLawyerAccessFee = async ({ paymentId, userId, assignedLawyerId, assignedAgentId, stateId, lgaName }) => {
  const LAWYER_CONFIG = await loadLawyerFeeConfig();
  const LAWYER_ACCESS_FEE_DISTRIBUTION = LAWYER_CONFIG.distribution;
  const LAWYER_ACCESS_FEE_TOTAL = LAWYER_CONFIG.total;
  const DISTRIBUTED_SUM = Object.values(LAWYER_ACCESS_FEE_DISTRIBUTION).reduce((a, b) => a + b, 0);
  const LAWYER_ACCESS_FEE_REMAINDER = LAWYER_ACCESS_FEE_TOTAL - DISTRIBUTED_SUM;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const stateNameResult = await client.query('SELECT state_name FROM states WHERE id = $1 LIMIT 1', [stateId]);
    const stateName = stateNameResult.rows[0]?.state_name || null;
    if (!stateName) {
      logger.error(`State not found for state_id ${stateId}`);
      await client.query('ROLLBACK');
      return null;
    }

    const stateAdminsResult = await client.query(
      `SELECT id, user_type, is_active, account_suspended_at FROM users
       WHERE user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin', 'state_lawyer_admin')
         AND LOWER(assigned_state) = LOWER($1) AND deleted_at IS NULL`,
      [stateName]
    );

    const superAdminsResult = await client.query(
      `SELECT id, user_type FROM users
       WHERE user_type IN ('super_admin', 'super_financial_admin', 'super_support_admin', 'super_lawyer_admin')
         AND deleted_at IS NULL AND account_suspended_at IS NULL AND admin_funds_frozen = false`
    );

    const serviceAdminsResult = await client.query(
      `SELECT id, user_type FROM users
       WHERE user_type IN ('fumigation_admin', 'transportation_admin')
         AND deleted_at IS NULL AND account_suspended_at IS NULL AND admin_funds_frozen = false`
    );

    const stateAdminByRole = {};
    const activeStateAdminIds = [];
    for (const row of stateAdminsResult.rows) {
      stateAdminByRole[row.user_type] = row.id;
      const isSuspended = row.is_active === false || row.account_suspended_at !== null;
      if (!isSuspended) activeStateAdminIds.push(row.id);
    }

    const superAdminByRole = {};
    for (const row of superAdminsResult.rows) superAdminByRole[row.user_type] = row.id;
    const serviceAdminByRole = {};
    for (const row of serviceAdminsResult.rows) serviceAdminByRole[row.user_type] = row.id;
    const defaultSuperAdminId = superAdminByRole['super_admin'] || null;

    const distribution = {};

    const creditStateRole = (amount, roleType) => {
      const adminId = stateAdminByRole[roleType];
      const adminRow = stateAdminsResult.rows.find(r => r.user_type === roleType);
      const isActive = adminRow && adminRow.is_active !== false && adminRow.account_suspended_at === null;

      if (adminId && isActive) {
        distribution[adminId] = (distribution[adminId] || 0) + amount;
      } else if (activeStateAdminIds.length > 0) {
        const sixtyPercent = Math.round(amount * 0.6 * 100) / 100;
        const fortyPercent = amount - sixtyPercent;
        const equalShare = Math.round((sixtyPercent / activeStateAdminIds.length) * 100) / 100;
        let distributedSoFar = 0;
        for (let i = 0; i < activeStateAdminIds.length; i++) {
          const share = (i === activeStateAdminIds.length - 1) ? sixtyPercent - distributedSoFar : equalShare;
          if (share > 0) {
            distribution[activeStateAdminIds[i]] = (distribution[activeStateAdminIds[i]] || 0) + share;
            distributedSoFar += share;
          }
        }
        if (defaultSuperAdminId && fortyPercent > 0) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + fortyPercent;
        }
      } else {
        if (defaultSuperAdminId) distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + amount;
      }
    };

    const credit = (amount, adminId) => {
      if (!adminId) {
        if (defaultSuperAdminId) distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + amount;
        return;
      }
      distribution[adminId] = (distribution[adminId] || 0) + amount;
    };

    if (assignedLawyerId) {
      credit(LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_lawyer, assignedLawyerId);
    } else if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_lawyer;
    }

    if (assignedAgentId) {
      credit(LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_agent, assignedAgentId);
    } else if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_agent;
    }

    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.super_admin_base, superAdminByRole['super_admin']);
    creditStateRole(LAWYER_ACCESS_FEE_DISTRIBUTION.state_admin, 'state_admin');
    creditStateRole(LAWYER_ACCESS_FEE_DISTRIBUTION.state_financial_admin, 'state_financial_admin');
    creditStateRole(LAWYER_ACCESS_FEE_DISTRIBUTION.state_support_admin, 'state_support_admin');
    creditStateRole(LAWYER_ACCESS_FEE_DISTRIBUTION.state_lawyer_admin, 'state_lawyer_admin');
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.super_financial_admin, superAdminByRole['super_financial_admin']);
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.super_support_admin, superAdminByRole['super_support_admin']);
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.super_lawyer_admin, superAdminByRole['super_lawyer_admin']);
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.fumigation_admin, serviceAdminByRole['fumigation_admin']);
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.transportation_admin, serviceAdminByRole['transportation_admin']);

    if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + LAWYER_ACCESS_FEE_REMAINDER;
    }

    const commissionIds = [];
    for (const [adminId, amount] of Object.entries(distribution)) {
      if (amount <= 0) continue;
      const result = await client.query(
        `INSERT INTO admin_commissions (admin_id, user_id, payment_id, amount, source, commission_rate, state, city, status)
         VALUES ($1, $2, $3, $4, 'lawyer_access_fee', 1.0, $5, $6, 'pending') RETURNING id`,
        [adminId, userId, paymentId, amount, stateName, lgaName]
      );
      commissionIds.push(result.rows[0].id);
      await client.query(
        `UPDATE users SET admin_wallet_balance = admin_wallet_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [amount, adminId]
      );
      await client.query(
        `INSERT INTO transaction_audits (payment_id, user_id, admin_id, action_type, amount, description)
         VALUES ($1, $2, $3, 'commission_earned', $4, $5)`,
        [paymentId, userId, adminId, amount, `Lawyer access fee commission: ₦${amount.toLocaleString()}`]
      );
    }

    const distributionRecord = await client.query(
      `INSERT INTO lawyer_access_fee_distributions (payment_id, user_id, assigned_lawyer_id, assigned_agent_id, state_id, lga_name, total_amount, distribution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [paymentId, userId, assignedLawyerId, assignedAgentId, stateId, lgaName, LAWYER_ACCESS_FEE_TOTAL, JSON.stringify(distribution)]
    );

    await client.query('COMMIT');

    logger.info(`Lawyer access fee distributed: ₦${LAWYER_ACCESS_FEE_TOTAL.toLocaleString()} across ${Object.keys(distribution).length} recipients`);

    return {
      distribution_id: distributionRecord.rows[0].id, commission_ids: commissionIds,
      distribution, total_distributed: Object.values(distribution).reduce((a, b) => a + b, 0),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Distribute lawyer access fee error:', error);
    throw error;
  } finally {
    client.release();
  }
};

exports.distributeAgentAccessFee = async ({ paymentId, userId, assignedAgentId, assignedLawyerId, stateId, lgaName }) => {
  const AGENT_CONFIG = await loadAgentFeeConfig();
  const AGENT_ACCESS_FEE_DISTRIBUTION = AGENT_CONFIG.distribution;
  const AGENT_ACCESS_FEE_TOTAL = AGENT_CONFIG.total;
  const AGENT_ACCESS_FEE_REMAINING =
    AGENT_ACCESS_FEE_TOTAL - AGENT_ACCESS_FEE_DISTRIBUTION.assigned_agent -
    AGENT_ACCESS_FEE_DISTRIBUTION.assigned_lawyer - AGENT_ACCESS_FEE_DISTRIBUTION.super_admin -
    AGENT_ACCESS_FEE_DISTRIBUTION.state_admin;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const stateNameResult = await client.query('SELECT state_name FROM states WHERE id = $1 LIMIT 1', [stateId]);
    const stateName = stateNameResult.rows[0]?.state_name || null;
    if (!stateName) {
      logger.error(`State not found for state_id ${stateId}`);
      await client.query('ROLLBACK');
      return null;
    }

    const stateAdminsResult = await client.query(
      `SELECT id, user_type, is_active, account_suspended_at FROM users
       WHERE user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin', 'state_lawyer_admin')
         AND LOWER(assigned_state) = LOWER($1) AND deleted_at IS NULL`,
      [stateName]
    );

    const superAdminsResult = await client.query(
      `SELECT id, user_type FROM users
       WHERE user_type IN ('super_admin', 'super_financial_admin', 'super_support_admin', 'super_lawyer_admin')
         AND deleted_at IS NULL AND account_suspended_at IS NULL AND admin_funds_frozen = false`
    );

    const serviceAdminsResult = await client.query(
      `SELECT id, user_type FROM users
       WHERE user_type IN ('fumigation_admin', 'transportation_admin')
         AND deleted_at IS NULL AND account_suspended_at IS NULL AND admin_funds_frozen = false`
    );

    const stateAdminByRole = {};
    const activeStateAdminIds = [];
    for (const row of stateAdminsResult.rows) {
      stateAdminByRole[row.user_type] = row.id;
      const isSuspended = row.is_active === false || row.account_suspended_at !== null;
      if (!isSuspended) activeStateAdminIds.push(row.id);
    }

    const superAdminByRole = {};
    for (const row of superAdminsResult.rows) superAdminByRole[row.user_type] = row.id;
    const serviceAdminByRole = {};
    for (const row of serviceAdminsResult.rows) serviceAdminByRole[row.user_type] = row.id;
    const defaultSuperAdminId = superAdminByRole['super_admin'] || null;

    const distribution = {};

    const creditStateRole = (amount, roleType) => {
      const adminId = stateAdminByRole[roleType];
      const adminRow = stateAdminsResult.rows.find(r => r.user_type === roleType);
      const isActive = adminRow && adminRow.is_active !== false && adminRow.account_suspended_at === null;

      if (adminId && isActive) {
        distribution[adminId] = (distribution[adminId] || 0) + amount;
      } else if (activeStateAdminIds.length > 0) {
        const sixtyPercent = Math.round(amount * 0.6 * 100) / 100;
        const fortyPercent = amount - sixtyPercent;
        const equalShare = Math.round((sixtyPercent / activeStateAdminIds.length) * 100) / 100;
        let distributedSoFar = 0;
        for (let i = 0; i < activeStateAdminIds.length; i++) {
          const share = (i === activeStateAdminIds.length - 1) ? sixtyPercent - distributedSoFar : equalShare;
          if (share > 0) {
            distribution[activeStateAdminIds[i]] = (distribution[activeStateAdminIds[i]] || 0) + share;
            distributedSoFar += share;
          }
        }
        if (defaultSuperAdminId && fortyPercent > 0) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + fortyPercent;
        }
      } else {
        if (defaultSuperAdminId) distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + amount;
      }
    };

    const credit = (amount, adminId) => {
      if (!adminId) {
        if (defaultSuperAdminId) distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + amount;
        return;
      }
      distribution[adminId] = (distribution[adminId] || 0) + amount;
    };

    if (assignedAgentId) {
      distribution[assignedAgentId] = (distribution[assignedAgentId] || 0) + AGENT_ACCESS_FEE_DISTRIBUTION.assigned_agent;
    } else if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + AGENT_ACCESS_FEE_DISTRIBUTION.assigned_agent;
    }

    if (assignedLawyerId) {
      credit(AGENT_ACCESS_FEE_DISTRIBUTION.assigned_lawyer, assignedLawyerId);
    } else if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + AGENT_ACCESS_FEE_DISTRIBUTION.assigned_lawyer;
    }

    credit(AGENT_ACCESS_FEE_DISTRIBUTION.super_admin, superAdminByRole['super_admin']);
    creditStateRole(AGENT_ACCESS_FEE_DISTRIBUTION.state_admin, 'state_admin');

    if (defaultSuperAdminId && AGENT_ACCESS_FEE_REMAINING > 0) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + AGENT_ACCESS_FEE_REMAINING;
    }

    const commissionIds = [];
    for (const [adminId, amount] of Object.entries(distribution)) {
      if (amount <= 0) continue;
      const result = await client.query(
        `INSERT INTO admin_commissions (admin_id, user_id, payment_id, amount, source, commission_rate, state, city, status)
         VALUES ($1, $2, $3, $4, 'agent_access_fee', 1.0, $5, $6, 'pending') RETURNING id`,
        [adminId, userId, paymentId, amount, stateName, lgaName]
      );
      commissionIds.push(result.rows[0].id);
      await client.query(
        `UPDATE users SET admin_wallet_balance = admin_wallet_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [amount, adminId]
      );
      await client.query(
        `INSERT INTO transaction_audits (payment_id, user_id, admin_id, action_type, amount, description)
         VALUES ($1, $2, $3, 'commission_earned', $4, $5)`,
        [paymentId, userId, adminId, amount, `Agent access fee commission: ₦${amount.toLocaleString()}`]
      );
    }

    const distributionRecord = await client.query(
      `INSERT INTO agent_access_fee_distributions (payment_id, user_id, assigned_agent_id, assigned_lawyer_id, state_id, lga_name, total_amount, distribution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [paymentId, userId, assignedAgentId, assignedLawyerId, stateId, lgaName, AGENT_ACCESS_FEE_TOTAL, JSON.stringify(distribution)]
    );

    await client.query('COMMIT');

    logger.info(`Agent access fee distributed: ₦${AGENT_ACCESS_FEE_TOTAL.toLocaleString()} across ${Object.keys(distribution).length} recipients`);

    return {
      distribution_id: distributionRecord.rows[0].id, commission_ids: commissionIds,
      distribution, total_distributed: Object.values(distribution).reduce((a, b) => a + b, 0),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Distribute agent access fee error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ── Commission clawback: reverse commissions when a payment is refunded/reversed ──
exports.clawbackCommissionsForPayment = async (paymentId, reason = 'payment_refunded') => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const commissions = await client.query(
      `SELECT id, admin_id, amount FROM admin_commissions WHERE payment_id = $1 AND status IN ('pending', 'paid')`,
      [paymentId]
    );

    if (commissions.rows.length === 0) {
      await client.query('ROLLBACK');
      return { clawed_back: 0, reason };
    }

    let totalClawedBack = 0;
    for (const comm of commissions.rows) {
      await client.query(
        `UPDATE admin_commissions SET status = 'reversed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [comm.id]
      );
      await client.query(
        `UPDATE users SET admin_wallet_balance = GREATEST(admin_wallet_balance - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [comm.amount, comm.admin_id]
      );
      await client.query(
        `INSERT INTO transaction_audits (admin_id, action_type, amount, description)
         VALUES ($1, 'commission_reversed', $2, $3)`,
        [comm.admin_id, comm.amount, `Commission clawed back for payment #${paymentId}: ₦${comm.amount.toLocaleString()} (${reason})`]
      );
      totalClawedBack += parseFloat(comm.amount);
    }

    await client.query('COMMIT');
    logger.info(`Clawed back ₦${totalClawedBack.toLocaleString()} for payment #${paymentId} (${reason})`);
    return { clawed_back: totalClawedBack, reason, commission_count: commissions.rows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Clawback error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ── Process auto-payouts: batch-pay matured commissions ──
exports.processAutoPayouts = async () => {
  const payoutDay = await cfg.get('auto_payout_day_of_week', 1);
  const today = new Date();
  if (today.getDay() !== payoutDay) {
    logger.info(`Auto-payout skipped (today=${today.getDay()}, configured=${payoutDay})`);
    return { skipped: true };
  }

  const minAmount = await cfg.get('min_admin_withdrawal', 1000);

  const admins = await db.query(
    `SELECT id, admin_wallet_balance FROM users
     WHERE user_type IN ('state_admin', 'state_financial_admin', 'financial_admin', 'super_financial_admin', 'super_admin')
       AND admin_funds_frozen = false AND is_active = true AND account_suspended_at IS NULL
       AND admin_wallet_balance >= $1`,
    [minAmount]
  );

  const results = [];
  for (const admin of admins.rows) {
    try {
      const payout = await db.query(
        `SELECT SUM(amount) as total FROM admin_commissions
         WHERE admin_id = $1 AND status = 'pending' AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
        [admin.id]
      );
      const total = parseFloat(payout.rows[0].total) || 0;
      if (total < minAmount) continue;

      await db.query(
        `UPDATE admin_commissions SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE admin_id = $1 AND status = 'pending' AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
        [admin.id]
      );
      await db.query(
        `UPDATE users SET admin_wallet_balance = admin_wallet_balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [total, admin.id]
      );
      await db.query(
        `INSERT INTO transaction_audits (admin_id, action_type, amount, description)
         VALUES ($1, 'auto_payout', $2, $3)`,
        [admin.id, total, `Auto-payout of ₦${total.toLocaleString()}`]
      );

      results.push({ admin_id: admin.id, amount: total });
      logger.info(`Auto-payout ₦${total.toLocaleString()} for admin ${admin.id}`);
    } catch (err) {
      logger.error(`Auto-payout error for admin ${admin.id}:`, err.message);
    }
  }

  return { processed: results.length, total_amount: results.reduce((s, r) => s + r.amount, 0) };
};
