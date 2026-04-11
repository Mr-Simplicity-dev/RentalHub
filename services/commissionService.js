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
        admin_funds_frozen
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
    if (admin.admin_funds_frozen) {
      console.log(`Admin ${admin.id} funds are frozen, skipping commission`);
      return null;
    }
    
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
    const adminCommission = platformFee * commissionConfig.admin_share;
    const superAdminCommission = platformFee * commissionConfig.super_admin_share;
    
    // Use admin's custom rate if set, otherwise use default
    const finalCommissionRate = admin.admin_commission_rate || commissionConfig.admin_share;
    const finalCommission = platformFee * finalCommissionRate;
    
    // Create commission record
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
        `Commission earned from ${paymentType}: ₦${finalCommission.toLocaleString()}`
      ]
    );
    
    console.log(`Commission calculated: ₦${finalCommission.toLocaleString()} for admin ${admin.id}`);
    
    return {
      commission_id: commissionResult.rows[0].id,
      admin_id: admin.id,
      amount: finalCommission,
      rate: finalCommissionRate,
      platform_fee: platformFee,
      super_admin_commission: superAdminCommission
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
    // Check admin wallet balance
    const adminResult = await db.query(
      `SELECT 
        admin_wallet_balance,
        admin_funds_frozen,
        full_name,
        email
       FROM users 
       WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin')`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      throw new Error('State admin not found');
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