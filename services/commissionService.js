// ====================== IMPORTS ======================
const db = require('../config/middleware/database');

// ====================== COMMISSION CONFIGURATION ======================
const COMMISSION_RATES = {
  // Platform fee split: Platform 85%, Admin 9%, Super Admin 6%
  rent_payment: {
    platform_fee_rate: 0.05, // 5% platform fee from rent
    admin_share: 0.09, // 9% of platform fee goes to admin
    super_admin_share: 0.06 // 6% of platform fee goes to super admin
  },
  tenant_subscription: {
    platform_fee_rate: 0.10, // 10% platform fee from subscription
    admin_share: 0.15, // 15% of platform fee goes to admin
    super_admin_share: 0.10 // 10% of platform fee goes to super admin
  },
  landlord_subscription: {
    platform_fee_rate: 0.10,
    admin_share: 0.15,
    super_admin_share: 0.10
  },
  landlord_listing: {
    platform_fee_rate: 0.10, // 10% platform fee from listing
    admin_share: 0.15, // 15% of platform fee goes to admin
    super_admin_share: 0.10 // 10% of platform fee goes to super admin
  },
  wallet_funding: {
    platform_fee_rate: 0.015, // 1.5% platform fee from wallet funding
    admin_share: 0.20, // 20% of platform fee goes to admin
    super_admin_share: 0.10 // 10% of platform fee goes to super admin
  },
  property_unlock: {
    platform_fee_rate: 0.10, // 10% platform fee from property unlock
    admin_share: 0.15, // 15% of platform fee goes to admin
    super_admin_share: 0.10 // 10% of platform fee goes to super admin
  }
};

// Performance bonus thresholds (in Naira)
const PERFORMANCE_BONUS_THRESHOLDS = {
  monthly_volume: {
    1000000: 50000, // ₦1M volume = ₦50K bonus
    5000000: 250000, // ₦5M volume = ₦250K bonus
    10000000: 600000 // ₦10M volume = ₦600K bonus
  },
  user_growth: {
    50: 10000, // 50 new users = ₦10K bonus
    100: 25000, // 100 new users = ₦25K bonus
    200: 60000 // 200 new users = ₦60K bonus
  }
};

// ====================== COMMISSION CALCULATION FUNCTIONS ======================

/**
 * Calculate commission for a transaction
 */
exports.calculateCommission = async (paymentId, userId, amount, paymentType, propertyId = null) => {
  try {
    // Get property location if propertyId is provided
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
    
    // Get user's referred_by (admin who referred them)
    const userResult = await db.query(
      'SELECT referred_by FROM users WHERE id = $1',
      [userId]
    );
    
    const referredBy = userResult.rows[0]?.referred_by;
    
    if (!referredBy) {
      console.log(`No admin referral found for user ${userId}`);
      return null;
    }
    
    // Check if referred user is a state admin
    const adminCheck = await db.query(
      `SELECT 
        id, 
        assigned_state, 
        assigned_city,
        admin_commission_rate,
        admin_funds_frozen,
        is_active,
        account_suspended_at
       FROM users 
       WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin')`,
      [referredBy]
    );
    
    if (adminCheck.rows.length === 0) {
      console.log(`Referred user ${referredBy} is not a state admin`);
      return null;
    }
    
    const admin = adminCheck.rows[0];
    
        // Check if admin funds are frozen
    // When funds are frozen: commission is still created and wallet credited,
    // but withdrawal is blocked by processAdminWithdrawal which checks admin_funds_frozen.
    // The commission record note indicates it was earned while funds were frozen.
    const isFundsFrozen = admin.admin_funds_frozen;
    
    // Check if transaction is in admin's assigned area
    if (propertyState && admin.assigned_state && 
        propertyState.toLowerCase() !== admin.assigned_state.toLowerCase()) {
      console.log(`Transaction not in admin's assigned state: ${propertyState} vs ${admin.assigned_state}`);
      return null;
    }
    
    if (propertyCity && admin.assigned_city && 
        propertyCity.toLowerCase() !== admin.assigned_city.toLowerCase()) {
      console.log(`Transaction not in admin's assigned city: ${propertyCity} vs ${admin.assigned_city}`);
      return null;
    }
    
    // Get commission rate configuration
    const commissionConfig = COMMISSION_RATES[paymentType];
    if (!commissionConfig) {
      console.log(`No commission config for payment type: ${paymentType}`);
      return null;
    }
    
    // Calculate commission
    const platformFee = amount * commissionConfig.platform_fee_rate;
    
    // Use admin's custom rate if set, otherwise use default
    const finalCommissionRate = admin.admin_commission_rate || commissionConfig.admin_share;
    const finalCommission = platformFee * finalCommissionRate;
    
    // ========== HANDLE SUSPENDED OR MISSING STATE ADMIN ==========
    const referralAdminId = admin.id;
    const isAdminSuspended = admin.is_active === false || admin.account_suspended_at !== null;
    
    // Find the super admin (needed for redistributions)
    const superAdminResult = await db.query(
      `SELECT id FROM users 
       WHERE user_type = 'super_admin' 
       AND deleted_at IS NULL 
       AND account_suspended_at IS NULL 
       AND admin_funds_frozen = false
       LIMIT 1`
    );
    const defaultSuperAdminId = superAdminResult.rows[0]?.id || null;
    
    if (isAdminSuspended) {
      // Admin is suspended: 60% to remaining active state admins, 40% to super admin
      console.log(`Admin ${referralAdminId} is suspended, redistributing commission`);
      
      const sixtyPercent = Math.round(finalCommission * 0.6 * 100) / 100;
      const fortyPercent = finalCommission - sixtyPercent;
      
      // Get all active (non-suspended) state admins in the same state
      const activeStateAdminsResult = await db.query(
        `SELECT id FROM users
         WHERE user_type IN ('state_admin', 'state_financial_admin')
           AND LOWER(assigned_state) = LOWER($1)
           AND id != $2
           AND deleted_at IS NULL
           AND account_suspended_at IS NULL
           AND admin_funds_frozen = false
           AND is_active = true`,
        [admin.assigned_state, referralAdminId]
      );
      
      const activeStateAdmins = activeStateAdminsResult.rows;
      
      // Build distribution map
      const distribution = {};
      
      if (activeStateAdmins.length > 0) {
        // Split 60% equally among remaining active state admins
        const equalShare = Math.round((sixtyPercent / activeStateAdmins.length) * 100) / 100;
        let distributedSoFar = 0;
        
        for (let i = 0; i < activeStateAdmins.length; i++) {
          const share = (i === activeStateAdmins.length - 1)
            ? sixtyPercent - distributedSoFar  // last admin gets remainder to avoid rounding issues
            : equalShare;
          distribution[activeStateAdmins[i].id] = (distribution[activeStateAdmins[i].id] || 0) + share;
          distributedSoFar += share;
        }
      } else {
        // No active state admins in that state, the 60% goes to super admin too
        if (defaultSuperAdminId) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + sixtyPercent;
        }
      }
      
      // 40% to super admin
      if (defaultSuperAdminId && fortyPercent > 0) {
        distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + fortyPercent;
      }
      
      // Persist all commissions in the distribution
      const commissionIds = [];
      for (const [distAdminId, distAmount] of Object.entries(distribution)) {
        if (distAmount <= 0) continue;
        
        const distResult = await db.query(
          `INSERT INTO admin_commissions (
            admin_id, user_id, payment_id, amount, source, commission_rate, state, city, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
          RETURNING id`,
          [distAdminId, userId, paymentId, distAmount, paymentType, finalCommissionRate, propertyState, propertyCity]
        );
        commissionIds.push(distResult.rows[0].id);
        
        await db.query(
          `UPDATE users 
           SET admin_wallet_balance = admin_wallet_balance + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [distAmount, distAdminId]
        );
        
        await db.query(
          `INSERT INTO transaction_audits 
           (payment_id, user_id, admin_id, action_type, amount, description)
           VALUES ($1, $2, $3, 'commission_earned', $4, $5)`,
          [
            paymentId, userId, distAdminId, distAmount,
            `Redistributed commission (admin suspended) from ${paymentType}: ₦${distAmount.toLocaleString()}`
          ]
        );
      }
      
      console.log(`Commission redistributed: ₦${finalCommission.toLocaleString()} (60% to state admins, 40% to super admin) for suspended admin ${referralAdminId}`);
      
      return {
        commission_id: commissionIds[0] || null,
        admin_id: null,
        amount: finalCommission,
        rate: finalCommissionRate,
        platform_fee: platformFee,
        super_admin_commission: 0,
        redistributed: true,
        distribution
      };
    }
    
        // ========== ADMIN IS ACTIVE - NORMAL COMMISSION FLOW ==========
    
    // Determine commission status
    // If funds are frozen, we still create the record (status 'pending') and credit the wallet.
    // The withdrawal logic (processAdminWithdrawal) already blocks frozen admins from withdrawing.
    const commissionDescription = isFundsFrozen
      ? `Commission earned from ${paymentType} (while funds frozen): ₦${finalCommission.toLocaleString()}`
      : `Commission earned from ${paymentType}: ₦${finalCommission.toLocaleString()}`;
    
    // Create commission record for the referral admin
    const commissionResult = await db.query(
      `INSERT INTO admin_commissions (
        admin_id,
        user_id,
        payment_id,
        amount,
        source,
        commission_rate,
        state,
        city,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING id`,
      [
        admin.id,
        userId,
        paymentId,
        finalCommission,
        paymentType,
        finalCommissionRate,
        propertyState,
        propertyCity
      ]
    );
    
    // Update admin's wallet balance
    await db.query(
      `UPDATE users 
       SET admin_wallet_balance = admin_wallet_balance + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [finalCommission, admin.id]
    );
    
    // Log audit trail
    await db.query(
      `INSERT INTO transaction_audits 
       (payment_id, user_id, admin_id, action_type, amount, description)
       VALUES ($1, $2, $3, 'commission_earned', $4, $5)`,
      [
        paymentId,
        userId,
        admin.id,
        finalCommission,
        commissionDescription
      ]
    );
    
    const statusNote = isFundsFrozen ? ' (funds frozen - withdrawal blocked)' : '';
    console.log(`Commission calculated: ₦${finalCommission.toLocaleString()} for admin ${admin.id}${statusNote}`);
    
    return {
      commission_id: commissionResult.rows[0].id,
      admin_id: admin.id,
      amount: finalCommission,
      rate: finalCommissionRate,
      platform_fee: platformFee,
      super_admin_commission: 0,
      ...(isFundsFrozen && { funds_frozen: true })
    };
    
  } catch (error) {
    console.error('Calculate commission error:', error);
    return null;
  }
};

/**
 * Process commission for all eligible payments
 * This should be called after a payment is completed
 */
exports.processPaymentCommission = async (paymentId) => {
  try {
    // Get payment details
    const paymentResult = await db.query(
      `SELECT 
        p.*,
        prop.state as property_state,
        prop.city as property_city
       FROM payments p
       LEFT JOIN properties prop ON p.property_id = prop.id
       WHERE p.id = $1 AND p.payment_status = 'completed'`,
      [paymentId]
    );
    
    if (paymentResult.rows.length === 0) {
      console.log(`Payment ${paymentId} not found or not completed`);
      return false;
    }
    
    const payment = paymentResult.rows[0];
    
    // Calculate commission
    const commission = await exports.calculateCommission(
      paymentId,
      payment.user_id,
      parseFloat(payment.amount),
      payment.payment_type,
      payment.property_id
    );
    
    if (!commission) {
      console.log(`No commission calculated for payment ${paymentId}`);
      return false;
    }
    
    return commission;
    
  } catch (error) {
    console.error('Process payment commission error:', error);
    return false;
  }
};

/**
 * Calculate performance bonus for admin
 */
exports.calculatePerformanceBonus = async (adminId, month, year) => {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Get monthly transaction volume
    const volumeResult = await db.query(
      `SELECT 
        SUM(p.amount) as monthly_volume,
        COUNT(DISTINCT p.user_id) as unique_users,
        COUNT(DISTINCT u.id) as new_users
       FROM payments p
       LEFT JOIN users u ON p.user_id = u.id AND u.referred_by = $1
       WHERE p.payment_status = 'completed'
         AND p.created_at >= $2
         AND p.created_at <= $3
         AND EXISTS (
           SELECT 1 FROM properties prop 
           WHERE prop.id = p.property_id 
           AND prop.state = (SELECT assigned_state FROM users WHERE id = $1)
         )`,
      [adminId, startDate, endDate]
    );
    
    const volumeData = volumeResult.rows[0];
    const monthlyVolume = parseFloat(volumeData.monthly_volume) || 0;
    const newUsers = parseInt(volumeData.new_users) || 0;
    
    // Calculate volume bonus
    let volumeBonus = 0;
    for (const [threshold, bonus] of Object.entries(PERFORMANCE_BONUS_THRESHOLDS.monthly_volume)) {
      if (monthlyVolume >= parseInt(threshold)) {
        volumeBonus = bonus;
      }
    }
    
    // Calculate growth bonus
    let growthBonus = 0;
    for (const [threshold, bonus] of Object.entries(PERFORMANCE_BONUS_THRESHOLDS.user_growth)) {
      if (newUsers >= parseInt(threshold)) {
        growthBonus = bonus;
      }
    }
    
    const totalBonus = volumeBonus + growthBonus;
    
    if (totalBonus > 0) {
      // Create performance bonus commission
      const bonusResult = await db.query(
        `INSERT INTO admin_commissions (
          admin_id,
          amount,
          source,
          commission_rate,
          status,
          description
        ) VALUES ($1, $2, 'performance_bonus', 1.0, 'pending', $3)
        RETURNING id`,
        [
          adminId,
          totalBonus,
          `Performance bonus: ₦${volumeBonus.toLocaleString()} (volume) + ₦${growthBonus.toLocaleString()} (growth)`
        ]
      );
      
      // Update admin wallet
      await db.query(
        `UPDATE users 
         SET admin_wallet_balance = admin_wallet_balance + $1
         WHERE id = $2`,
        [totalBonus, adminId]
      );
      
      // Log audit
      await db.query(
        `INSERT INTO transaction_audits 
         (admin_id, action_type, amount, description)
         VALUES ($1, 'commission_earned', $2, $3)`,
        [
          adminId,
          totalBonus,
          `Performance bonus earned: ₦${totalBonus.toLocaleString()}`
        ]
      );
      
      return {
        bonus_id: bonusResult.rows[0].id,
        admin_id: adminId,
        amount: totalBonus,
        volume_bonus: volumeBonus,
        growth_bonus: growthBonus,
        monthly_volume: monthlyVolume,
        new_users: newUsers
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('Calculate performance bonus error:', error);
    return null;
  }
};

/**
 * Process admin withdrawal
 */
exports.processAdminWithdrawal = async (adminId, amount, bankDetails) => {
  try {
    const axios = require('axios');
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    const PAYSTACK_BASE_URL = 'https://api.paystack.co';

    // ── Server-side account name verification via Paystack ──────────────
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
            `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${bankDetails.account_number}&bank_code=${bank.code}`,
            {
              headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
              },
            }
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
        console.error('Account verification error in withdrawal:', verifyErr?.response?.data || verifyErr.message);
        throw new Error('Could not verify account details. Please try again.');
      }
    }

    // Check admin wallet balance
    const adminResult = await db.query(
      `SELECT 
        admin_wallet_balance,
        admin_funds_frozen,
        full_name,
        email,
        user_type
       FROM users 
       WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin', 'financial_admin', 'super_financial_admin', 'super_admin')`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      throw new Error('Eligible admin not found');
    }
    
    const admin = adminResult.rows[0];
    
    if (admin.admin_funds_frozen) {
      throw new Error('Admin funds are frozen');
    }
    
    if (parseFloat(admin.admin_wallet_balance) < amount) {
      throw new Error('Insufficient wallet balance');
    }
    
    // Check weekly withdrawal limit (can only withdraw commissions from last 7 days)
    const weeklyEarningsResult = await db.query(
      `SELECT SUM(amount) as weekly_earnings
       FROM admin_commissions
       WHERE admin_id = $1
         AND status = 'pending'
         AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
      [adminId]
    );
    
    const weeklyEarnings = parseFloat(weeklyEarningsResult.rows[0].weekly_earnings) || 0;
    
    if (amount > weeklyEarnings) {
      throw new Error(`Weekly withdrawal limit exceeded. Maximum: ₦${weeklyEarnings.toLocaleString()}`);
    }
    
    // Create withdrawal request
    const withdrawalResult = await db.query(
      `INSERT INTO admin_withdrawals (
        admin_id,
        amount,
        bank_name,
        account_number,
        account_name,
        status
      ) VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, requested_at`,
      [
        adminId,
        amount,
        bankDetails.bank_name,
        bankDetails.account_number,
        bankDetails.account_name
      ]
    );
    
    // Update pending commissions to paid
    await db.query(
      `UPDATE admin_commissions 
       SET status = 'paid',
           paid_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE admin_id = $1
         AND status = 'pending'
         AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
      [adminId]
    );
    
    // Update admin wallet balance
    await db.query(
      `UPDATE users 
       SET admin_wallet_balance = admin_wallet_balance - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [amount, adminId]
    );
    
    // Log audit
    await db.query(
      `INSERT INTO transaction_audits 
       (admin_id, action_type, amount, description)
       VALUES ($1, 'withdrawal_requested', $2, $3)`,
      [
        adminId,
        amount,
        `Withdrawal requested: ₦${amount.toLocaleString()} to ${bankDetails.bank_name}`
      ]
    );
    
    return {
      withdrawal_id: withdrawalResult.rows[0].id,
      requested_at: withdrawalResult.rows[0].requested_at,
      amount: amount,
      new_balance: parseFloat(admin.admin_wallet_balance) - amount
    };
    
  } catch (error) {
    console.error('Process admin withdrawal error:', error);
    throw error;
  }
};

/**
 * Get admin commission summary
 */
exports.getAdminCommissionSummary = async (adminId) => {
  try {
    const summaryResult = await db.query(
      `SELECT 
        source,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        AVG(commission_rate) as avg_rate,
        status
       FROM admin_commissions
       WHERE admin_id = $1
       GROUP BY source, status
       ORDER BY source, status`,
      [adminId]
    );
    
    const weeklyResult = await db.query(
      `SELECT 
        DATE(created_at) as date,
        SUM(amount) as daily_earnings,
        COUNT(*) as transaction_count
       FROM admin_commissions
       WHERE admin_id = $1
         AND created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [adminId]
    );
    
    const monthlyResult = await db.query(
      `SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        EXTRACT(YEAR FROM created_at) as year,
        SUM(amount) as monthly_earnings,
        COUNT(*) as transaction_count
       FROM admin_commissions
       WHERE admin_id = $1
         AND created_at >= CURRENT_DATE - INTERVAL '365 days'
       GROUP BY EXTRACT(MONTH FROM created_at), EXTRACT(YEAR FROM created_at)
       ORDER BY year, month`,
      [adminId]
    );
    
    return {
      summary: summaryResult.rows,
      weekly: weeklyResult.rows,
      monthly: monthlyResult.rows
    };
    
  } catch (error) {
    console.error('Get admin commission summary error:', error);
    throw error;
  }
};

// ====================== LAWYER ACCESS FEE DISTRIBUTION ======================

const LAWYER_ACCESS_FEE_TOTAL = 2000;

const LAWYER_ACCESS_FEE_DISTRIBUTION = {
  assigned_lawyer: 100,
  assigned_agent: 80,
  super_admin_base: 120,
  state_admin: 140,
  state_financial_admin: 140,
  state_support_admin: 140,
  state_lawyer_admin: 140,
  super_financial_admin: 200,
  super_support_admin: 200,
  super_lawyer_admin: 200,
  fumigation_admin: 120,
  transportation_admin: 120,
};

const DISTRIBUTED_SUM =
  LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_lawyer +
  LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_agent +
  LAWYER_ACCESS_FEE_DISTRIBUTION.super_admin_base +
  LAWYER_ACCESS_FEE_DISTRIBUTION.state_admin +
  LAWYER_ACCESS_FEE_DISTRIBUTION.state_financial_admin +
  LAWYER_ACCESS_FEE_DISTRIBUTION.state_support_admin +
  LAWYER_ACCESS_FEE_DISTRIBUTION.state_lawyer_admin +
  LAWYER_ACCESS_FEE_DISTRIBUTION.super_financial_admin +
  LAWYER_ACCESS_FEE_DISTRIBUTION.super_support_admin +
  LAWYER_ACCESS_FEE_DISTRIBUTION.super_lawyer_admin +
  LAWYER_ACCESS_FEE_DISTRIBUTION.fumigation_admin +
  LAWYER_ACCESS_FEE_DISTRIBUTION.transportation_admin;

// Remainder to super admin
const LAWYER_ACCESS_FEE_REMAINDER = LAWYER_ACCESS_FEE_TOTAL - DISTRIBUTED_SUM;

/**
 * Distribute the N2000 lawyer access fee to all eligible admin roles.
 * Called after a user pays for RentalHub NG lawyer access during registration.
 *
 * @param {Object} params
 * @param {number} params.paymentId - The payments.id
 * @param {number} params.userId - The client user id
 * @param {number|null} params.assignedLawyerId - The lawyer assigned via round-robin
 * @param {number|null} params.assignedAgentId - The agent assigned (if any)
 * @param {number} params.stateId - The state id for the client's chosen state
 * @param {string} params.lgaName - The LGA name
 */
exports.distributeLawyerAccessFee = async ({
  paymentId,
  userId,
  assignedLawyerId,
  assignedAgentId,
  stateId,
  lgaName,
}) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Resolve state name from stateId (state admins use assigned_state VARCHAR name)
    const stateNameResult = await client.query(
      'SELECT state_name FROM states WHERE id = $1 LIMIT 1',
      [stateId]
    );
    const stateName = stateNameResult.rows[0]?.state_name || null;

    if (!stateName) {
      console.error(`State not found for state_id ${stateId}`);
      await client.query('ROLLBACK');
      return null;
    }

        // Look up state-level admins by assigned_state (VARCHAR name) matching the client's state
    // NOTE: We now fetch ALL state admins including suspended ones so we can implement
    // the 60/40 redistribution rule when a state admin role is suspended/missing
    const stateAdminsResult = await client.query(
      `SELECT id, user_type, is_active, account_suspended_at FROM users
       WHERE user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin', 'state_lawyer_admin')
         AND LOWER(assigned_state) = LOWER($1)
         AND deleted_at IS NULL`,
      [stateName]
    );

    // Super-level admins (not tied to a specific state)
    const superAdminsResult = await client.query(
      `SELECT id, user_type FROM users
       WHERE user_type IN ('super_admin', 'super_financial_admin', 'super_support_admin', 'super_lawyer_admin')
         AND deleted_at IS NULL
         AND account_suspended_at IS NULL
         AND admin_funds_frozen = false`
    );

    // Service admins (fumigation, transportation)
    const serviceAdminsResult = await client.query(
      `SELECT id, user_type FROM users
       WHERE user_type IN ('fumigation_admin', 'transportation_admin')
         AND deleted_at IS NULL
         AND account_suspended_at IS NULL
         AND admin_funds_frozen = false`
    );

    // Index admins by user_type for quick lookups
    const stateAdminByRole = {};
    // Track which state-level roles have an active admin present (for 60/40 redistribution)
    const activeStateAdminIds = [];
    for (const row of stateAdminsResult.rows) {
      stateAdminByRole[row.user_type] = row.id;
      const isSuspended = row.is_active === false || row.account_suspended_at !== null;
      if (!isSuspended) {
        activeStateAdminIds.push(row.id);
      }
    }

    const superAdminByRole = {};
    for (const row of superAdminsResult.rows) {
      superAdminByRole[row.user_type] = row.id;
    }

    const serviceAdminByRole = {};
    for (const row of serviceAdminsResult.rows) {
      serviceAdminByRole[row.user_type] = row.id;
    }

    const defaultSuperAdminId = superAdminByRole['super_admin'] || null;

    // Build distribution map { adminId: totalAmount }
    const distribution = {};

    /**
     * Helper: credit a state-level role amount. If the role's admin is missing or suspended,
     * apply the 60/40 rule: 60% to remaining active state admins, 40% to super admin.
     */
    const creditStateRole = (amount, roleType) => {
      const adminId = stateAdminByRole[roleType];
      
      // Check if the admin for this role exists and is active
      const adminRow = stateAdminsResult.rows.find(r => r.user_type === roleType);
      const isActive = adminRow && adminRow.is_active !== false && adminRow.account_suspended_at === null;
      
      if (adminId && isActive) {
        // Admin exists and is active - give them their share
        distribution[adminId] = (distribution[adminId] || 0) + amount;
      } else if (activeStateAdminIds.length > 0) {
        // Role is missing/suspended: 60% to remaining active state admins, 40% to super admin
        const sixtyPercent = Math.round(amount * 0.6 * 100) / 100;
        const fortyPercent = amount - sixtyPercent;
        
        // Share 60% equally among active state admins
        const equalShare = Math.round((sixtyPercent / activeStateAdminIds.length) * 100) / 100;
        let distributedSoFar = 0;
        for (let i = 0; i < activeStateAdminIds.length; i++) {
          const share = (i === activeStateAdminIds.length - 1)
            ? sixtyPercent - distributedSoFar
            : equalShare;
          if (share > 0) {
            distribution[activeStateAdminIds[i]] = (distribution[activeStateAdminIds[i]] || 0) + share;
            distributedSoFar += share;
          }
        }
        
        // 40% to super admin
        if (defaultSuperAdminId && fortyPercent > 0) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + fortyPercent;
        }
      } else {
        // No active state admins at all - everything goes to super admin
        if (defaultSuperAdminId) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + amount;
        }
      }
    };

    /**
     * Helper: credit any admin by ID. If adminId is falsy, falls to defaultSuperAdminId.
     */
    const credit = (amount, adminId) => {
      if (!adminId) {
        if (defaultSuperAdminId) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + amount;
        }
        return;
      }
      distribution[adminId] = (distribution[adminId] || 0) + amount;
    };

    // 1. Assigned lawyer – N100 (if round-robin assigned a lawyer)
    if (assignedLawyerId) {
      credit(LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_lawyer, assignedLawyerId);
    } else if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_lawyer;
    }

    // 2. Assigned agent – N80 (if any)
    if (assignedAgentId) {
      credit(LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_agent, assignedAgentId);
    } else if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + LAWYER_ACCESS_FEE_DISTRIBUTION.assigned_agent;
    }

    // 3. Super admin base – N120
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.super_admin_base, superAdminByRole['super_admin']);
    // 4. State admin – N140 (with 60/40 redistribution if suspended/missing)
    creditStateRole(LAWYER_ACCESS_FEE_DISTRIBUTION.state_admin, 'state_admin');
    // 5. State financial admin – N140 (with 60/40 redistribution if suspended/missing)
    creditStateRole(LAWYER_ACCESS_FEE_DISTRIBUTION.state_financial_admin, 'state_financial_admin');
    // 6. State support admin – N140 (with 60/40 redistribution if suspended/missing)
    creditStateRole(LAWYER_ACCESS_FEE_DISTRIBUTION.state_support_admin, 'state_support_admin');
    // 7. State lawyer admin – N140 (with 60/40 redistribution if suspended/missing)
    creditStateRole(LAWYER_ACCESS_FEE_DISTRIBUTION.state_lawyer_admin, 'state_lawyer_admin');
    // 8. Super financial admin – N200
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.super_financial_admin, superAdminByRole['super_financial_admin']);
    // 9. Super support admin – N200
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.super_support_admin, superAdminByRole['super_support_admin']);
    // 10. Super lawyer admin – N200
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.super_lawyer_admin, superAdminByRole['super_lawyer_admin']);
    // 11. Fumigation admin – N120
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.fumigation_admin, serviceAdminByRole['fumigation_admin']);
    // 12. Transportation admin – N120
    credit(LAWYER_ACCESS_FEE_DISTRIBUTION.transportation_admin, serviceAdminByRole['transportation_admin']);

    // 13. Remainder to super admin
    if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + LAWYER_ACCESS_FEE_REMAINDER;
    }

    // Persist each commission record and credit admin wallets
    const commissionIds = [];
    for (const [adminId, amount] of Object.entries(distribution)) {
      if (amount <= 0) continue;

            const result = await client.query(
        `INSERT INTO admin_commissions (
          admin_id, user_id, payment_id, amount, source, commission_rate, state, city, status
        ) VALUES ($1, $2, $3, $4, 'lawyer_access_fee', 1.0, $5, $6, 'pending')
        RETURNING id`,
        [adminId, userId, paymentId, amount, stateName, lgaName]
      );

      commissionIds.push(result.rows[0].id);

      await client.query(
        `UPDATE users
         SET admin_wallet_balance = admin_wallet_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [amount, adminId]
      );

      await client.query(
        `INSERT INTO transaction_audits
         (payment_id, user_id, admin_id, action_type, amount, description)
         VALUES ($1, $2, $3, 'commission_earned', $4, $5)`,
        [
          paymentId,
          userId,
          adminId,
          amount,
          `Lawyer access fee commission: ₦${amount.toLocaleString()}`,
        ]
      );
    }

    // Record the full distribution in the dedicated tracking table
    const distributionRecord = await client.query(
      `INSERT INTO lawyer_access_fee_distributions (
        payment_id, user_id, assigned_lawyer_id, assigned_agent_id,
        state_id, lga_name, total_amount, distribution
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        paymentId,
        userId,
        assignedLawyerId,
        assignedAgentId,
        stateId,
        lgaName,
        LAWYER_ACCESS_FEE_TOTAL,
        JSON.stringify(distribution),
      ]
    );

    await client.query('COMMIT');

    console.log(`Lawyer access fee distributed: ₦${LAWYER_ACCESS_FEE_TOTAL.toLocaleString()} across ${Object.keys(distribution).length} recipients`);

    return {
      distribution_id: distributionRecord.rows[0].id,
      commission_ids: commissionIds,
      distribution,
      total_distributed: Object.values(distribution).reduce((a, b) => a + b, 0),
    };
    } catch (error) {
    await client.query('ROLLBACK');
    console.error('Distribute lawyer access fee error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ====================== AGENT ACCESS FEE DISTRIBUTION (N5000) ======================

const AGENT_ACCESS_FEE_TOTAL = 5000;

const AGENT_ACCESS_FEE_DISTRIBUTION = {
  assigned_agent: 2800,
  assigned_lawyer: 500,
  super_admin: 800,
  state_admin: 100,
};

const AGENT_ACCESS_FEE_REMAINING =
  AGENT_ACCESS_FEE_TOTAL -
  AGENT_ACCESS_FEE_DISTRIBUTION.assigned_agent -
  AGENT_ACCESS_FEE_DISTRIBUTION.assigned_lawyer -
  AGENT_ACCESS_FEE_DISTRIBUTION.super_admin -
  AGENT_ACCESS_FEE_DISTRIBUTION.state_admin;

/**
 * Distribute the N5000 agent access fee to eligible recipients.
 * Called after a landlord pays for RentalHub NG agent access during registration.
 *
 * Distribution:
 *   Assigned agent:         N2,800
 *   Assigned landlord's
 *   lawyer (if any):        N500
 *   Super admin:            N800
 *   State admin:            N100
 *   Remainder to super admin
 *
 * @param {Object} params
 * @param {number} params.paymentId - The payments.id
 * @param {number} params.userId - The landlord user id
 * @param {number|null} params.assignedAgentId - The agent assigned via round-robin
 * @param {number|null} params.assignedLawyerId - The lawyer assigned to the landlord (if any)
 * @param {number} params.stateId - The state id for the landlord's chosen state
 * @param {string} params.lgaName - The LGA name
 */
exports.distributeAgentAccessFee = async ({
  paymentId,
  userId,
  assignedAgentId,
  assignedLawyerId,
  stateId,
  lgaName,
}) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const stateNameResult = await client.query(
      'SELECT state_name FROM states WHERE id = $1 LIMIT 1',
      [stateId]
    );
    const stateName = stateNameResult.rows[0]?.state_name || null;

    if (!stateName) {
      console.error(`State not found for state_id ${stateId}`);
      await client.query('ROLLBACK');
      return null;
    }

    const stateAdminsResult = await client.query(
      `SELECT id, user_type, is_active, account_suspended_at FROM users
       WHERE user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin', 'state_lawyer_admin')
         AND LOWER(assigned_state) = LOWER($1)
         AND deleted_at IS NULL`,
      [stateName]
    );

    const superAdminsResult = await client.query(
      `SELECT id, user_type FROM users
       WHERE user_type IN ('super_admin', 'super_financial_admin', 'super_support_admin', 'super_lawyer_admin')
         AND deleted_at IS NULL
         AND account_suspended_at IS NULL
         AND admin_funds_frozen = false`
    );

    const serviceAdminsResult = await client.query(
      `SELECT id, user_type FROM users
       WHERE user_type IN ('fumigation_admin', 'transportation_admin')
         AND deleted_at IS NULL
         AND account_suspended_at IS NULL
         AND admin_funds_frozen = false`
    );

    const stateAdminByRole = {};
    const activeStateAdminIds = [];
    for (const row of stateAdminsResult.rows) {
      stateAdminByRole[row.user_type] = row.id;
      const isSuspended = row.is_active === false || row.account_suspended_at !== null;
      if (!isSuspended) {
        activeStateAdminIds.push(row.id);
      }
    }

    const superAdminByRole = {};
    for (const row of superAdminsResult.rows) {
      superAdminByRole[row.user_type] = row.id;
    }

    const serviceAdminByRole = {};
    for (const row of serviceAdminsResult.rows) {
      serviceAdminByRole[row.user_type] = row.id;
    }

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
          const share = (i === activeStateAdminIds.length - 1)
            ? sixtyPercent - distributedSoFar
            : equalShare;
          if (share > 0) {
            distribution[activeStateAdminIds[i]] = (distribution[activeStateAdminIds[i]] || 0) + share;
            distributedSoFar += share;
          }
        }
        if (defaultSuperAdminId && fortyPercent > 0) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + fortyPercent;
        }
      } else {
        if (defaultSuperAdminId) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + amount;
        }
      }
    };

    const credit = (amount, adminId) => {
      if (!adminId) {
        if (defaultSuperAdminId) {
          distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + amount;
        }
        return;
      }
      distribution[adminId] = (distribution[adminId] || 0) + amount;
    };

    // 1. Assigned agent – N2,800
    if (assignedAgentId) {
      distribution[assignedAgentId] = (distribution[assignedAgentId] || 0) + AGENT_ACCESS_FEE_DISTRIBUTION.assigned_agent;
    } else if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + AGENT_ACCESS_FEE_DISTRIBUTION.assigned_agent;
    }

    // 2. Assigned lawyer – N500 (if landlord also has a platform lawyer)
    if (assignedLawyerId) {
      credit(AGENT_ACCESS_FEE_DISTRIBUTION.assigned_lawyer, assignedLawyerId);
    } else if (defaultSuperAdminId) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + AGENT_ACCESS_FEE_DISTRIBUTION.assigned_lawyer;
    }

    // 3. Super admin – N800
    credit(AGENT_ACCESS_FEE_DISTRIBUTION.super_admin, superAdminByRole['super_admin']);

    // 4. State admin – N100 (with 60/40 redistribution)
    creditStateRole(AGENT_ACCESS_FEE_DISTRIBUTION.state_admin, 'state_admin');

    // 5. Remainder to super admin
    if (defaultSuperAdminId && AGENT_ACCESS_FEE_REMAINING > 0) {
      distribution[defaultSuperAdminId] = (distribution[defaultSuperAdminId] || 0) + AGENT_ACCESS_FEE_REMAINING;
    }

    // Persist each commission record and credit admin wallets
    const commissionIds = [];
    for (const [adminId, amount] of Object.entries(distribution)) {
      if (amount <= 0) continue;

      const result = await client.query(
        `INSERT INTO admin_commissions (
          admin_id, user_id, payment_id, amount, source, commission_rate, state, city, status
        ) VALUES ($1, $2, $3, $4, 'agent_access_fee', 1.0, $5, $6, 'pending')
        RETURNING id`,
        [adminId, userId, paymentId, amount, stateName, lgaName]
      );
      commissionIds.push(result.rows[0].id);

      await client.query(
        `UPDATE users
         SET admin_wallet_balance = admin_wallet_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [amount, adminId]
      );

      await client.query(
        `INSERT INTO transaction_audits
         (payment_id, user_id, admin_id, action_type, amount, description)
         VALUES ($1, $2, $3, 'commission_earned', $4, $5)`,
        [paymentId, userId, adminId, amount, `Agent access fee commission: ₦${amount.toLocaleString()}`]
      );
    }

    const distributionRecord = await client.query(
      `INSERT INTO agent_access_fee_distributions (
        payment_id, user_id, assigned_agent_id, assigned_lawyer_id,
        state_id, lga_name, total_amount, distribution
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        paymentId, userId, assignedAgentId, assignedLawyerId,
        stateId, lgaName, AGENT_ACCESS_FEE_TOTAL, JSON.stringify(distribution),
      ]
    );

    await client.query('COMMIT');

    console.log(`Agent access fee distributed: ₦${AGENT_ACCESS_FEE_TOTAL.toLocaleString()} across ${Object.keys(distribution).length} recipients`);

    return {
      distribution_id: distributionRecord.rows[0].id,
      commission_ids: commissionIds,
      distribution,
      total_distributed: Object.values(distribution).reduce((a, b) => a + b, 0),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Distribute agent access fee error:', error);
    throw error;
  } finally {
    client.release();
  }
};
