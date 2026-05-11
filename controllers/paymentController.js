// ====================== IMPORTS ======================
const axios = require("axios");
const crypto = require("crypto");
const db = require('../config/middleware/database');
const { validationResult } = require("express-validator");
const { getFrontendUrl } = require('../config/utils/frontendUrl');
const { getLocationPricingQuote } = require('../config/utils/locationPricing');
const {
  LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
  ensureLawyerDirectoryUnlockSchema,
  getLawyerDirectoryUnlockStatus: readLawyerDirectoryUnlockStatus,
} = require('../config/utils/lawyerDirectoryAccess');
const {
  ensureSubscriptionCreditSchema,
  getSubscriptionCreditBalance,
  debitSubscriptionBalance,
} = require('../services/subscriptionCreditService');
const commissionService = require('../services/commissionService');
const AgentWithdrawalService = require('../services/agentWithdrawalService');

// ====================== PAYSTACK CONFIG ======================
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";
const PROPERTY_UNLOCK_PRICE_NGN = Number(process.env.PROPERTY_UNLOCK_PRICE_NGN || 1000);
const FRONTEND_URL = getFrontendUrl();
const MONTHLY_SUBSCRIPTION_DURATION_DAYS = 30;
const MONTHLY_SUBSCRIPTION_BASE_AMOUNT_NGN = 200;
const SUBSCRIPTION_PRICING_TARGETS = {
  tenant: 'tenant_monthly_subscription',
  landlord: 'landlord_monthly_subscription',
};
const SUBSCRIPTION_PAYMENT_TYPES = {
  tenant: 'tenant_subscription',
  landlord: 'landlord_subscription',
};

let propertyUnlockSchemaReady = false;
let walletLedgerSchemaReady = false;
let internalSubscriptionSchemaReady = false;
let bankCache = {
  data: null,
  fetchedAt: 0,
};
const BANK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const ensurePropertyUnlockSchema = async () => {
  if (propertyUnlockSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_property_unlocks (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      transaction_reference VARCHAR(120),
      unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, property_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_property_unlocks_tenant
    ON tenant_property_unlocks(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_tenant_property_unlocks_property
    ON tenant_property_unlocks(property_id);
  `);

  propertyUnlockSchemaReady = true;
};

const ensureWalletLedgerSchema = async () => {
  if (walletLedgerSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
  `);

  walletLedgerSchemaReady = true;
};

const ensureInternalSubscriptionSchema = async () => {
  if (internalSubscriptionSchemaReady) return;

  await ensureWalletLedgerSchema();
  await ensureSubscriptionCreditSchema();

  await db.query(`
    ALTER TABLE payments
      DROP CONSTRAINT IF EXISTS payments_payment_type_check;

    ALTER TABLE payments
      ADD CONSTRAINT payments_payment_type_check
      CHECK (
        payment_type IN (
          'tenant_subscription',
          'landlord_subscription',
          'landlord_listing',
          'rent_payment',
          'property_unlock',
          'general_platform_fee',
          'registration_fee',
          'wallet_funding',
          'tenant_property_alert',
          'evidence_verification',
          'lawyer_directory_unlock',
          'lawyer_access_fee',
          'agent_access_fee',
          'transportation_booking'
        )
      );

    CREATE TABLE IF NOT EXISTS landlord_rent_deductions (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL,
      deduction_type VARCHAR(40) NOT NULL DEFAULT 'subscription',
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_landlord_rent_deduction_type
        CHECK (deduction_type IN ('subscription'))
    );

    CREATE INDEX IF NOT EXISTS idx_landlord_rent_deductions_landlord
      ON landlord_rent_deductions(landlord_id, created_at DESC);
  `);

  internalSubscriptionSchemaReady = true;
};

const fetchBanksFromPaystack = async (forceRefresh = false) => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Payment service is not configured');
  }

  const now = Date.now();
  if (
    !forceRefresh &&
    Array.isArray(bankCache.data) &&
    now - bankCache.fetchedAt < BANK_CACHE_TTL_MS
  ) {
    return bankCache.data;
  }

  const response = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  bankCache = {
    data: response.data?.data || [],
    fetchedAt: now,
  };

  return bankCache.data;
};


// =====================================================
//               SUBSCRIPTION PLANS
// =====================================================

const LISTING_PLANS = [
  {
    id: "single_listing_30",
    name: "Single Listing - 30 Days",
    duration_days: 30,
    price: 2000,
    listings_count: 1,
    featured: false
  },
  {
    id: "single_listing_60",
    name: "Single Listing - 60 Days",
    duration_days: 60,
    price: 3500,
    listings_count: 1,
    featured: false
  },
  {
    id: "featured_listing_30",
    name: "Featured Listing - 30 Days",
    duration_days: 30,
    price: 5000,
    listings_count: 1,
    featured: true
  },
  {
    id: "multi_listing_monthly",
    name: "Multiple Listings - 30 Days",
    duration_days: 30,
    price: 10000,
    listings_count: 5,
    featured: false
  },
  {
    id: "unlimited_monthly",
    name: "Unlimited Listings - 30 Days",
    duration_days: 30,
    price: 20000,
    listings_count: -1,
    featured: false
  }
];

const getMonthlySubscriptionTarget = (userType) => {
  const target = SUBSCRIPTION_PRICING_TARGETS[userType];

  if (!target) {
    const error = new Error('Monthly subscriptions are only available to tenants and landlords');
    error.statusCode = 403;
    throw error;
  }

  return target;
};

const getMonthlySubscriptionPaymentType = (userType) => {
  const paymentType = SUBSCRIPTION_PAYMENT_TYPES[userType];

  if (!paymentType) {
    const error = new Error('Monthly subscriptions are only available to tenants and landlords');
    error.statusCode = 403;
    throw error;
  }

  return paymentType;
};

const resolveSubscriptionLocationForUser = async ({
  userId,
  userType,
  stateId,
  lgaName,
}) => {
  if (stateId) {
    return {
      stateId,
      lgaName: lgaName || null,
      source: 'selected',
    };
  }

  const userResult = await db.query(
    `SELECT preferred_state_id, preferred_lga_name
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );
  const user = userResult.rows[0] || {};

  if (user.preferred_state_id) {
    return {
      stateId: user.preferred_state_id,
      lgaName: user.preferred_lga_name || null,
      source: 'profile',
    };
  }

  if (userType === 'landlord') {
    const propertyLocationResult = await db.query(
      `SELECT state_id, lga_name
       FROM properties
       WHERE landlord_id = $1
         AND state_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    const propertyLocation = propertyLocationResult.rows[0];

    if (propertyLocation?.state_id) {
      return {
        stateId: propertyLocation.state_id,
        lgaName: propertyLocation.lga_name || null,
        source: 'latest_property',
      };
    }
  }

  return {
    stateId: null,
    lgaName: null,
    source: 'base',
  };
};

const buildMonthlySubscriptionQuote = async ({
  userId,
  userType,
  stateId = null,
  lgaName = null,
}) => {
  const target = getMonthlySubscriptionTarget(userType);
  const location = await resolveSubscriptionLocationForUser({
    userId,
    userType,
    stateId,
    lgaName,
  });

  const quote = await getLocationPricingQuote({
    appliesTo: target,
    stateId: location.stateId,
    lgaName: location.lgaName,
  });

  return {
    ...quote,
    amount: Math.max(
      MONTHLY_SUBSCRIPTION_BASE_AMOUNT_NGN,
      Number(quote.amount || MONTHLY_SUBSCRIPTION_BASE_AMOUNT_NGN)
    ),
    base_amount: MONTHLY_SUBSCRIPTION_BASE_AMOUNT_NGN,
    pricing_target: target,
    duration_days: MONTHLY_SUBSCRIPTION_DURATION_DAYS,
    location_source: location.source,
    state_id: location.stateId,
    lga_name: location.lgaName,
  };
};

const getTenantRentSavingsBalance = async (userId, executor = db) => {
  try {
    const result = await executor.query(
      `SELECT COALESCE(SUM(total_saved), 0) AS balance
       FROM rent_savings_plans
       WHERE tenant_id = $1
         AND status = 'active'
         AND is_active = TRUE`,
      [userId]
    );

    return Number(result.rows[0]?.balance || 0);
  } catch (error) {
    if (error.code === '42P01') {
      return 0;
    }

    throw error;
  }
};

const deductTenantRentSavings = async ({
  executor,
  userId,
  amount,
}) => {
  const amountToDeduct = Number(amount || 0);

  if (amountToDeduct <= 0) {
    return { deducted: 0, deductions: [] };
  }

  let plansResult;

  try {
    plansResult = await executor.query(
      `SELECT id, total_saved
       FROM rent_savings_plans
       WHERE tenant_id = $1
         AND status = 'active'
         AND is_active = TRUE
         AND total_saved > 0
       ORDER BY rent_due_date ASC, id ASC
       FOR UPDATE`,
      [userId]
    );
  } catch (error) {
    if (error.code === '42P01') {
      return { deducted: 0, insufficient: true, available: 0, deductions: [] };
    }

    throw error;
  }

  const totalAvailable = plansResult.rows.reduce(
    (sum, plan) => sum + Number(plan.total_saved || 0),
    0
  );

  if (totalAvailable < amountToDeduct) {
    return { deducted: 0, insufficient: true, available: totalAvailable, deductions: [] };
  }

  let remaining = amountToDeduct;
  const deductions = [];

  for (const plan of plansResult.rows) {
    if (remaining <= 0) break;

    const planBalance = Number(plan.total_saved || 0);
    const deduction = Math.min(planBalance, remaining);

    if (deduction <= 0) continue;

    await executor.query(
      `UPDATE rent_savings_plans
       SET total_saved = total_saved - $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [plan.id, deduction]
    );

    deductions.push({ plan_id: plan.id, amount: deduction });
    remaining = Math.round((remaining - deduction) * 100) / 100;
  }

  return {
    deducted: amountToDeduct,
    deductions,
  };
};

const getLandlordRentFundingBalance = async (landlordId, executor = db) => {
  const clearedResult = await executor.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS cleared_amount
     FROM payments p
     JOIN properties prop ON p.property_id = prop.id
     WHERE prop.landlord_id = $1
       AND p.payment_type = 'rent_payment'
       AND p.payment_status = 'completed'
       AND p.completed_at < NOW() - INTERVAL '20 days'
       AND NOT EXISTS (
         SELECT 1 FROM refund_requests rr
         WHERE rr.payment_id = p.id
           AND rr.status IN ('pending','approved')
       )`,
    [landlordId]
  );

  const withdrawnResult = await executor.query(
    `SELECT COALESCE(SUM(amount), 0) AS withdrawn_amount
     FROM withdrawal_requests
     WHERE user_id = $1
       AND status IN ('approved','processed')`,
    [landlordId]
  );

  const deductionResult = await executor.query(
    `SELECT COALESCE(SUM(amount), 0) AS deducted_amount
     FROM landlord_rent_deductions
     WHERE landlord_id = $1`,
    [landlordId]
  );

  return Math.max(
    0,
    Number(clearedResult.rows[0]?.cleared_amount || 0) -
      Number(withdrawnResult.rows[0]?.withdrawn_amount || 0) -
      Number(deductionResult.rows[0]?.deducted_amount || 0)
  );
};

const buildSubscriptionFundingSnapshot = async ({
  userId,
  userType,
  amount,
}) => {
  const subscriptionCreditBalance = await getSubscriptionCreditBalance(userId);
  const walletResult = await db.query(
    `SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const walletBalance = walletResult.rows.length
    ? Number(walletResult.rows[0].balance || 0)
    : 0;

  const rentSavingsBalance =
    userType === 'tenant' ? await getTenantRentSavingsBalance(userId) : 0;
  const landlordRentBalance =
    userType === 'landlord' ? await getLandlordRentFundingBalance(userId) : 0;

  return {
    amount_required: Number(amount || 0),
    subscription_credit_balance: subscriptionCreditBalance,
    wallet_balance: userType === 'tenant' ? walletBalance : 0,
    rent_savings_balance: rentSavingsBalance,
    landlord_rent_balance: landlordRentBalance,
    total_available:
      subscriptionCreditBalance +
      (userType === 'tenant' ? walletBalance + rentSavingsBalance : landlordRentBalance),
  };
};


// =====================================================
//              PUBLIC PLAN ENDPOINTS
// =====================================================

// Get subscription plans
exports.getSubscriptionPlans = (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 'monthly_subscription',
        name: 'Monthly Subscription',
        duration_days: MONTHLY_SUBSCRIPTION_DURATION_DAYS,
        price: MONTHLY_SUBSCRIPTION_BASE_AMOUNT_NGN,
        minimum_price: MONTHLY_SUBSCRIPTION_BASE_AMOUNT_NGN,
        features: [
          'Monthly platform access',
          'Location-based pricing from Super Admin',
          'Paid from subscription credit and internal balances',
        ],
      },
    ],
  });
};

// Get listing plans
exports.getListingPlans = (req, res) => {
  res.json({
    success: true,
    data: LISTING_PLANS
  });
};


// =====================================================
//          TENANT SUBSCRIPTION PAYMENT
// =====================================================

exports.getSubscriptionQuote = async (req, res) => {
  try {
    await ensureInternalSubscriptionSchema();

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!['tenant', 'landlord'].includes(userType)) {
      return res.status(403).json({
        success: false,
        message: 'Monthly subscriptions are only available to tenants and landlords',
      });
    }

    const quote = await buildMonthlySubscriptionQuote({
      userId,
      userType,
      stateId: req.query.state_id,
      lgaName: req.query.lga_name,
    });
    const funding = await buildSubscriptionFundingSnapshot({
      userId,
      userType,
      amount: quote.amount,
    });

    res.json({
      success: true,
      data: {
        plan: {
          id: 'monthly_subscription',
          name: `${userType === 'tenant' ? 'Tenant' : 'Landlord'} Monthly Subscription`,
          duration_days: MONTHLY_SUBSCRIPTION_DURATION_DAYS,
        },
        quote,
        funding,
      },
    });
  } catch (error) {
    console.error('Subscription quote error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to load subscription quote',
    });
  }
};

exports.initializeSubscription = async (req, res) => {
  const client = await db.connect();

  try {
    await ensureInternalSubscriptionSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!['tenant', 'landlord'].includes(userType)) {
      return res.status(403).json({
        success: false,
        message: 'Monthly subscriptions are only available to tenants and landlords',
      });
    }

    const quote = await buildMonthlySubscriptionQuote({
      userId,
      userType,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
    });
    const amount = Number(quote.amount || MONTHLY_SUBSCRIPTION_BASE_AMOUNT_NGN);
    const paymentType = getMonthlySubscriptionPaymentType(userType);
    const reference = `SUB_INTERNAL_${userId}_${Date.now()}`;

    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT id, email, full_name, subscription_expires_at
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let remaining = amount;
    const fundingBreakdown = {
      subscription_credit: 0,
      wallet: 0,
      rent_savings: 0,
      landlord_rent: 0,
      rent_savings_deductions: [],
    };

    const creditDebit = await debitSubscriptionBalance({
      userId,
      amount: remaining,
      source: 'monthly_subscription',
      reference,
      metadata: {
        payment_type: paymentType,
        pricing_target: quote.pricing_target,
      },
      executor: client,
    });

    fundingBreakdown.subscription_credit = creditDebit.debited;
    remaining = Math.round((remaining - creditDebit.debited) * 100) / 100;

    if (userType === 'tenant' && remaining > 0) {
      await client.query(
        `INSERT INTO wallets (user_id, balance)
         VALUES ($1, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      const walletResult = await client.query(
        `SELECT balance
         FROM wallets
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );
      const walletBalance = Number(walletResult.rows[0]?.balance || 0);
      const walletDebit = Math.min(walletBalance, remaining);

      if (walletDebit > 0) {
        await client.query(
          `UPDATE wallets
           SET balance = balance - $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1`,
          [userId, walletDebit]
        );

        fundingBreakdown.wallet = walletDebit;
        remaining = Math.round((remaining - walletDebit) * 100) / 100;
      }

      if (remaining > 0) {
        const rentSavingsDebit = await deductTenantRentSavings({
          executor: client,
          userId,
          amount: remaining,
        });

        if (rentSavingsDebit.insufficient) {
          await client.query('ROLLBACK');
          return res.status(402).json({
            success: false,
            message: 'Insufficient subscription funding. Add wallet funds or rent savings before subscribing.',
            data: {
              amount_required: amount,
              amount_remaining: remaining,
              rent_savings_available: rentSavingsDebit.available,
              funding: await buildSubscriptionFundingSnapshot({ userId, userType, amount }),
            },
          });
        }

        fundingBreakdown.rent_savings = rentSavingsDebit.deducted;
        fundingBreakdown.rent_savings_deductions = rentSavingsDebit.deductions;
        remaining = Math.round((remaining - rentSavingsDebit.deducted) * 100) / 100;
      }
    }

    if (userType === 'landlord' && remaining > 0) {
      const landlordRentAvailable = await getLandlordRentFundingBalance(userId, client);

      if (landlordRentAvailable < remaining) {
        await client.query('ROLLBACK');
        return res.status(402).json({
          success: false,
          message: 'Insufficient cleared rent balance for landlord subscription.',
          data: {
            amount_required: amount,
            amount_remaining: remaining,
            landlord_rent_available: landlordRentAvailable,
            funding: await buildSubscriptionFundingSnapshot({ userId, userType, amount }),
          },
        });
      }

      fundingBreakdown.landlord_rent = remaining;
      remaining = 0;
    }

    if (remaining > 0) {
      await client.query('ROLLBACK');
      return res.status(402).json({
        success: false,
        message: 'Insufficient subscription funding.',
        data: {
          amount_required: amount,
          amount_remaining: remaining,
          funding: await buildSubscriptionFundingSnapshot({ userId, userType, amount }),
        },
      });
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (
         user_id,
         payment_type,
         amount,
         currency,
         subscription_duration_days,
         payment_method,
         payment_status,
         transaction_reference,
         completed_at,
         gateway_response
       )
       VALUES ($1, $2, $3, 'NGN', $4, 'internal_balance', 'completed', $5, CURRENT_TIMESTAMP, $6)
       RETURNING id`,
      [
        userId,
        paymentType,
        amount,
        MONTHLY_SUBSCRIPTION_DURATION_DAYS,
        reference,
        JSON.stringify({
          funding_source: 'internal',
          funding_breakdown: fundingBreakdown,
          quote,
          full_name: user.full_name,
          email: user.email,
        }),
      ]
    );

    const paymentId = paymentResult.rows[0].id;

    if (userType === 'landlord' && fundingBreakdown.landlord_rent > 0) {
      await client.query(
        `INSERT INTO landlord_rent_deductions (
           landlord_id, payment_id, amount, deduction_type, description
         )
         VALUES ($1, $2, $3, 'subscription', $4)`,
        [
          userId,
          paymentId,
          fundingBreakdown.landlord_rent,
          `Monthly subscription ${reference}`,
        ]
      );
    }

    const currentExpiry = user.subscription_expires_at
      ? new Date(user.subscription_expires_at)
      : null;
    const startDate =
      currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + MONTHLY_SUBSCRIPTION_DURATION_DAYS);

    await client.query(
      `UPDATE users
       SET subscription_active = TRUE,
           subscription_expires_at = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [expiryDate, userId]
    );

    await client.query('COMMIT');

    if (['tenant_subscription', 'landlord_subscription'].includes(paymentType)) {
      await commissionService.processPaymentCommission(paymentId);
    }

    return res.json({
      success: true,
      message: 'Monthly subscription activated successfully',
      data: {
        payment_id: paymentId,
        reference,
        amount_paid: amount,
        funding_breakdown: fundingBreakdown,
        subscription_expires_at: expiryDate,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors when the transaction was not started or already closed.
    }

    console.error("Subscription initialization error:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to initialize subscription payment",
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Verify Subscription Payment
exports.verifySubscription = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    // Verify with Paystack
    const paystackResponse = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      }
    );

    const transaction = paystackResponse.data.data;

    if (transaction.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
        status: transaction.status
      });
    }

    // Get payment record
    const paymentResult = await db.query(
      "SELECT * FROM payments WHERE transaction_reference = $1",
      [reference]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    const payment = paymentResult.rows[0];

    // Update payment status
    await db.query(
      `UPDATE payments 
       SET payment_status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           gateway_response = $1
       WHERE id = $2`,
      [JSON.stringify(transaction), payment.id]
    );

    // Update user subscription
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + payment.subscription_duration_days);

    await db.query(
      `UPDATE users 
       SET subscription_active = TRUE,
           subscription_expires_at = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [expiryDate, userId]
    );
    // Calculate commission for subscription
    await commissionService.processPaymentCommission(payment.id);

    res.json({
      success: true,
      message: "Subscription activated successfully!",
      data: {
        subscription_expires_at: expiryDate,
        amount_paid: transaction.amount / 100
      }
    });
  } catch (error) {
    console.error("Subscription verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify subscription payment"
    });
  }
};


// =====================================================
//             GET SUBSCRIPTION STATUS
// =====================================================

exports.getSubscriptionStatus = async (req, res) => {
  try {
    await ensureInternalSubscriptionSchema();

    const userId = req.user.id;
    const userType = req.user.user_type;

    const result = await db.query(
      `SELECT subscription_active, subscription_expires_at 
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];
    const quote = ['tenant', 'landlord'].includes(userType)
      ? await buildMonthlySubscriptionQuote({
          userId,
          userType,
          stateId: req.query.state_id,
          lgaName: req.query.lga_name,
        })
      : null;
    const funding = quote
      ? await buildSubscriptionFundingSnapshot({
          userId,
          userType,
          amount: quote.amount,
        })
      : null;
    const now = new Date();
    const isActive =
      user.subscription_active &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) > now;

    res.json({
      success: true,
      data: {
        active: isActive,
        expires_at: user.subscription_expires_at,
        quote,
        funding,
        days_remaining: isActive
          ? Math.ceil(
              (new Date(user.subscription_expires_at) - now) /
                (1000 * 60 * 60 * 24)
            )
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get subscription status"
    });
  }
};

// =====================================================
//          TENANT PROPERTY UNLOCK PAYMENT
// =====================================================

exports.initializePropertyUnlock = async (req, res) => {
  try {
    await ensurePropertyUnlockSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { property_id, payment_method } = req.body;

    const propertyResult = await db.query(
      `SELECT id, title
       FROM properties
       WHERE id = $1
         AND is_available = TRUE
         AND is_verified = TRUE`,
      [property_id]
    );

    if (!propertyResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Property not found or unavailable",
      });
    }

    const existingUnlock = await db.query(
      `SELECT id, unlocked_at
       FROM tenant_property_unlocks
       WHERE tenant_id = $1 AND property_id = $2`,
      [userId, property_id]
    );

    if (existingUnlock.rows.length) {
      return res.json({
        success: true,
        message: "Property already unlocked for this tenant",
        data: {
          already_unlocked: true,
          property_id,
          unlocked_at: existingUnlock.rows[0].unlocked_at,
        },
      });
    }

    const userResult = await db.query(
      "SELECT email, full_name FROM users WHERE id = $1",
      [userId]
    );
    const user = userResult.rows[0];

    const paymentResult = await db.query(
      `INSERT INTO payments (
         user_id, payment_type, amount, currency,
         property_id, payment_method, payment_status
       )
       VALUES ($1, 'property_unlock', $2, 'NGN', $3, $4, 'pending')
       RETURNING id`,
      [userId, PROPERTY_UNLOCK_PRICE_NGN, property_id, payment_method]
    );
    const paymentId = paymentResult.rows[0].id;

    if (payment_method === "paystack") {
      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: user.email,
          amount: PROPERTY_UNLOCK_PRICE_NGN * 100,
          reference: `UNLOCK_${paymentId}_${Date.now()}`,
          callback_url: `${FRONTEND_URL}/properties/${property_id}`,
          metadata: {
            payment_id: paymentId,
            user_id: userId,
            property_id,
            payment_type: "property_unlock",
            full_name: user.full_name,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      await db.query(
        "UPDATE payments SET transaction_reference = $1 WHERE id = $2",
        [paystackResponse.data.data.reference, paymentId]
      );

      return res.json({
        success: true,
        message: "Property unlock payment initialized",
        data: {
          payment_id: paymentId,
          property_id,
          amount: PROPERTY_UNLOCK_PRICE_NGN,
          authorization_url: paystackResponse.data.data.authorization_url,
          access_code: paystackResponse.data.data.access_code,
          reference: paystackResponse.data.data.reference,
        },
      });
    }

    if (payment_method === "bank_transfer") {
      const reference = `UNLOCK_${paymentId}_${Date.now()}`;
      await db.query(
        "UPDATE payments SET transaction_reference = $1 WHERE id = $2",
        [reference, paymentId]
      );

      return res.json({
        success: true,
        message: "Please transfer to unlock this property",
        data: {
          payment_id: paymentId,
          property_id,
          amount: PROPERTY_UNLOCK_PRICE_NGN,
          reference,
          bank_name: "Your Bank Name",
          account_number: "1234567890",
          account_name: "Rental Hub NG",
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: "Unsupported payment method",
    });
  } catch (error) {
    console.error("Property unlock initialization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize property unlock payment",
      error: error.message,
    });
  }
};

exports.verifyPropertyUnlock = async (req, res) => {
  try {
    await ensurePropertyUnlockSchema();

    const { reference } = req.params;
    const userId = req.user.id;

    const paymentResult = await db.query(
      `SELECT *
       FROM payments
       WHERE transaction_reference = $1
         AND user_id = $2
         AND payment_type = 'property_unlock'`,
      [reference, userId]
    );

    if (!paymentResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Property unlock payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    if (payment.payment_status !== "completed") {
      const paystackResponse = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        }
      );

      const transaction = paystackResponse.data.data;
      if (transaction.status !== "success") {
        return res.status(400).json({
          success: false,
          message: "Payment verification failed",
          status: transaction.status,
        });
      }

      await db.query(
        `UPDATE payments
         SET payment_status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             gateway_response = $1
         WHERE id = $2`,
        [JSON.stringify(transaction), payment.id]
      );
    }

    await db.query(
      `INSERT INTO tenant_property_unlocks (
         tenant_id, property_id, payment_id, transaction_reference
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, property_id)
       DO UPDATE SET
         payment_id = EXCLUDED.payment_id,
         transaction_reference = EXCLUDED.transaction_reference,
         unlocked_at = CURRENT_TIMESTAMP`,
      [userId, payment.property_id, payment.id, reference]
    );

    // Calculate commission for property unlock
    await commissionService.processPaymentCommission(payment.id); // ADD THIS LINE


    res.json({
      success: true,
      message: "Property unlocked successfully",
      data: {
        property_id: payment.property_id,
        reference,
      },
    });
  } catch (error) {
    console.error("Property unlock verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify property unlock payment",
    });
  }
};

exports.getPropertyUnlockStatus = async (req, res) => {
  try {
    await ensurePropertyUnlockSchema();

    const userId = req.user.id;
    const propertyId = Number(req.params.propertyId);

    const result = await db.query(
      `SELECT id, unlocked_at, transaction_reference
       FROM tenant_property_unlocks
       WHERE tenant_id = $1 AND property_id = $2`,
      [userId, propertyId]
    );

    if (!result.rows.length) {
      return res.json({
        success: true,
        data: { unlocked: false, property_id: propertyId },
      });
    }

    res.json({
      success: true,
      data: {
        unlocked: true,
        property_id: propertyId,
        unlocked_at: result.rows[0].unlocked_at,
        reference: result.rows[0].transaction_reference,
      },
    });
  } catch (error) {
    console.error("Property unlock status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get property unlock status",
    });
  }
};

// =====================================================
//        PLATFORM LAWYER DIRECTORY UNLOCK PAYMENT
// =====================================================

exports.initializeLawyerDirectoryUnlock = async (req, res) => {
  let transactionStarted = false;

  try {
    await ensureLawyerDirectoryUnlockSchema();
    await ensureWalletLedgerSchema();

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!['tenant', 'landlord'].includes(userType)) {
      return res.status(403).json({
        success: false,
        message: 'Only tenant and landlord accounts can unlock the lawyer directory',
      });
    }

    const unlockStatus = await readLawyerDirectoryUnlockStatus(userId);

    if (unlockStatus.unlocked) {
      return res.json({
        success: true,
        message: 'Lawyer directory already unlocked for this user',
        data: {
          already_unlocked: true,
          unlocked_at: unlockStatus.unlock?.unlocked_at || null,
          reference: unlockStatus.unlock?.transaction_reference || null,
        },
      });
    }

    const userResult = await db.query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    await db.query('BEGIN');
    transactionStarted = true;

    const walletResult = await db.query(
      `SELECT balance
       FROM wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    const walletBalance = walletResult.rows.length
      ? Number(walletResult.rows[0].balance)
      : 0;

    if (walletBalance < LAWYER_DIRECTORY_UNLOCK_PRICE_NGN) {
      await db.query('ROLLBACK');
      transactionStarted = false;
      return res.status(402).json({
        success: false,
        message: `Insufficient wallet balance. Fund your wallet from the dashboard before unlocking. Available: ₦${walletBalance.toLocaleString()}`,
        data: {
          available_balance: walletBalance,
          amount_required: LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
        },
      });
    }

    const reference = `LAWYERDIR_WALLET_${userId}_${Date.now()}`;

    const paymentResult = await db.query(
      `INSERT INTO payments (
         user_id,
         payment_type,
         amount,
         currency,
         payment_method,
         payment_status,
         transaction_reference,
         completed_at,
         gateway_response
       )
       VALUES ($1, 'lawyer_directory_unlock', $2, 'NGN', 'wallet', 'completed', $3, CURRENT_TIMESTAMP, $4)
       RETURNING id`,
      [
        userId,
        LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
        reference,
        JSON.stringify({
          funding_source: 'wallet',
          full_name: user.full_name,
          email: user.email,
        }),
      ]
    );

    await db.query(
      `UPDATE wallets
       SET balance = balance - $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId, LAWYER_DIRECTORY_UNLOCK_PRICE_NGN]
    );

    await db.query(
      `INSERT INTO lawyer_directory_unlocks (
         user_id, payment_id, transaction_reference
       )
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET
         payment_id = EXCLUDED.payment_id,
         transaction_reference = EXCLUDED.transaction_reference,
         unlocked_at = CURRENT_TIMESTAMP`,
      [userId, paymentResult.rows[0].id, reference]
    );

    await db.query('COMMIT');
    transactionStarted = false;

    return res.json({
      success: true,
      message: 'Lawyer directory unlocked successfully from your wallet',
      data: {
        payment_id: paymentResult.rows[0].id,
        amount: LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
        reference,
        unlocked_at: new Date().toISOString(),
        available_balance: walletBalance - LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Lawyer directory unlock rollback error:', rollbackError);
      }
    }
    console.error('Lawyer directory unlock initialization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to unlock lawyer directory from wallet',
    });
  }
};

exports.verifyLawyerDirectoryUnlock = async (req, res) => {
  try {
    await ensureLawyerDirectoryUnlockSchema();

    const { reference } = req.params;
    const userId = req.user.id;

    const paymentResult = await db.query(
      `SELECT *
       FROM payments
       WHERE transaction_reference = $1
         AND user_id = $2
         AND payment_type = 'lawyer_directory_unlock'`,
      [reference, userId]
    );

    if (!paymentResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Lawyer directory payment not found',
      });
    }

    const payment = paymentResult.rows[0];

    if (payment.payment_status !== 'completed') {
      const paystackResponse = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        }
      );

      const transaction = paystackResponse.data.data;
      if (transaction.status !== 'success') {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed',
          status: transaction.status,
        });
      }

      await db.query(
        `UPDATE payments
         SET payment_status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             gateway_response = $1
         WHERE id = $2`,
        [JSON.stringify(transaction), payment.id]
      );
    }

    await db.query(
      `INSERT INTO lawyer_directory_unlocks (
         user_id, payment_id, transaction_reference
       )
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET
         payment_id = EXCLUDED.payment_id,
         transaction_reference = EXCLUDED.transaction_reference,
         unlocked_at = CURRENT_TIMESTAMP`,
      [userId, payment.id, reference]
    );

    return res.json({
      success: true,
      message: 'Lawyer directory unlocked successfully',
      data: {
        reference,
        amount: LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
      },
    });
  } catch (error) {
    console.error('Lawyer directory unlock verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify lawyer directory payment',
    });
  }
};

exports.getLawyerDirectoryUnlockStatus = async (req, res) => {
  try {
    await ensureWalletLedgerSchema();
    const unlockStatus = await readLawyerDirectoryUnlockStatus(req.user.id);
    const walletResult = await db.query(
      `SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`,
      [req.user.id]
    );
    const walletBalance = walletResult.rows.length
      ? Number(walletResult.rows[0].balance)
      : 0;

    return res.json({
      success: true,
      data: {
        unlocked: unlockStatus.unlocked,
        unlocked_at: unlockStatus.unlock?.unlocked_at || null,
        reference: unlockStatus.unlock?.transaction_reference || null,
        amount: LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
        available_balance: walletBalance,
        payment_method: 'wallet',
      },
    });
  } catch (error) {
    console.error('Lawyer directory unlock status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get lawyer directory unlock status',
    });
  }
};


// =====================================================
//           LANDLORD LISTING PAYMENT
// =====================================================

exports.initializeListingPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { plan_id, property_id, payment_method } = req.body;

    const plan = LISTING_PLANS.find((p) => p.id === plan_id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Listing plan not found"
      });
    }

    const userResult = await db.query(
      "SELECT email, full_name FROM users WHERE id = $1",
      [userId]
    );
    const user = userResult.rows[0];

    const paymentResult = await db.query(
      `INSERT INTO payments (user_id, payment_type, amount, currency,
                             property_id, payment_method, payment_status)
       VALUES ($1, 'landlord_listing', $2, 'NGN', $3, $4, 'pending')
       RETURNING id`,
      [userId, plan.price, property_id || null, payment_method]
    );

    const paymentId = paymentResult.rows[0].id;

    if (payment_method === "paystack") {
      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: user.email,
          amount: plan.price * 100,
          reference: `LIST_${paymentId}_${Date.now()}`,
          callback_url: `${FRONTEND_URL}/payment/verify-listing`,
          metadata: {
            payment_id: paymentId,
            user_id: userId,
            plan_id: plan_id,
            property_id,
            payment_type: "landlord_listing",
            full_name: user.full_name,
            duration_days: plan.duration_days,
            featured: plan.featured
          }
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      await db.query(
        "UPDATE payments SET transaction_reference = $1 WHERE id = $2",
        [paystackResponse.data.data.reference, paymentId]
      );

      return res.json({
        success: true,
        message: "Payment initialized",
        data: {
          payment_id: paymentId,
          authorization_url: paystackResponse.data.data.authorization_url,
          access_code: paystackResponse.data.data.access_code,
          reference: paystackResponse.data.data.reference
        }
      });
    }

    if (payment_method === "bank_transfer") {
      return res.json({
        success: true,
        message: "Please transfer to the account below",
        data: {
          payment_id: paymentId,
          bank_name: "Your Bank Name",
          account_number: "1234567890",
          account_name: "Rental Hub NG",
          amount: plan.price,
          reference: `LIST_${paymentId}_${Date.now()}`
        }
      });
    }
  } catch (error) {
    console.error("Listing payment initialization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize listing payment",
      error: error.message
    });
  }
};



// =====================================================
//          VERIFY LISTING PAYMENT
// =====================================================

exports.verifyListingPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    const paystackResponse = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      }
    );

    const transaction = paystackResponse.data.data;

    if (transaction.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
        status: transaction.status
      });
    }

    const paymentResult = await db.query(
      "SELECT * FROM payments WHERE transaction_reference = $1",
      [reference]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    const payment = paymentResult.rows[0];
    const metadata = transaction.metadata;

    // Update payment status
    await db.query(
      `UPDATE payments 
       SET payment_status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           gateway_response = $1
       WHERE id = $2`,
      [JSON.stringify(transaction), payment.id]
    );

    // Update property if needed
    if (payment.property_id) {
      const expiryDate = new Date();
      expiryDate.setDate(
        expiryDate.getDate() + parseInt(metadata.duration_days || 30)
      );

      await db.query(
        `UPDATE properties 
         SET expires_at = $1,
             featured = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND landlord_id = $4`,
        [
          expiryDate,
          metadata.featured || false,
          payment.property_id,
          userId
        ]
      );
    }

 // Calculate commission for listing
    await commissionService.processPaymentCommission(payment.id); // ADD THIS LINE

      res.json({
      success: true,
      message: "Listing payment successful!",
      data: {
        property_id: payment.property_id,
        amount_paid: transaction.amount / 100,
        duration_days: metadata.duration_days,
        featured: metadata.featured
      }
    });
  } catch (error) {
    console.error("Listing payment verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify listing payment"
    });
  }
};



// =====================================================
//                 RENT PAYMENT
// =====================================================

exports.initializeRentPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { property_id, amount, payment_method } = req.body;

    // Validate property
    const propertyResult = await db.query(
      `SELECT p.id, p.landlord_id, p.title,
              u.email AS landlord_email, 
              u.full_name AS landlord_name
       FROM properties p
       JOIN users u ON p.landlord_id = u.id
       WHERE p.id = $1`,
      [property_id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    const property = propertyResult.rows[0];

    // Get tenant info
    const userResult = await db.query(
      "SELECT email, full_name FROM users WHERE id = $1",
      [userId]
    );

    const user = userResult.rows[0];

    // Platform commission (2.5%)
    const platformFee = amount * 0.025;
    const landlordAmount = amount - platformFee;

    // Save payment record
    const paymentResult = await db.query(
      `INSERT INTO payments (user_id, payment_type, amount, currency,
                             property_id, payment_method, payment_status)
       VALUES ($1, 'rent_payment', $2, 'NGN', $3, $4, 'pending')
       RETURNING id`,
      [userId, amount, property_id, payment_method]
    );

    const paymentId = paymentResult.rows[0].id;

    if (payment_method === "paystack") {
      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: user.email,
          amount: amount * 100,
          reference: `RENT_${paymentId}_${Date.now()}`,
          callback_url: `${FRONTEND_URL}/payment/verify-rent`,
          metadata: {
            payment_id: paymentId,
            user_id: userId,
            property_id: property_id,
            landlord_id: property.landlord_id,
            payment_type: "rent_payment",
            tenant_name: user.full_name,
            landlord_name: property.landlord_name,
            property_title: property.title,
            platform_fee: platformFee,
            landlord_amount: landlordAmount
          }
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      await db.query(
        "UPDATE payments SET transaction_reference = $1 WHERE id = $2",
        [paystackResponse.data.data.reference, paymentId]
      );

      return res.json({
        success: true,
        message: "Rent payment initialized",
        data: {
          payment_id: paymentId,
          authorization_url: paystackResponse.data.data.authorization_url,
          access_code: paystackResponse.data.data.access_code,
          reference: paystackResponse.data.data.reference,
          total_amount: amount,
          platform_fee: platformFee,
          landlord_receives: landlordAmount
        }
      });
    }

    if (payment_method === "bank_transfer") {
      return res.json({
        success: true,
        message: "Please transfer to the account below",
        data: {
          payment_id: paymentId,
          bank_name: "Your Bank Name",
          account_number: "1234567890",
          account_name: "Rental Hub NG",
          amount,
          reference: `RENT_${paymentId}_${Date.now()}`,
          platform_fee: platformFee,
          landlord_receives: landlordAmount
        }
      });
    }
  } catch (error) {
    console.error("Rent payment initialization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize rent payment",
      error: error.message
    });
  }
};




// Verify rent payment
exports.verifyRentPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    const paystackResponse = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      }
    );

    const transaction = paystackResponse.data.data;

    if (transaction.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
        status: transaction.status
      });
    }

    const paymentResult = await db.query(
      "SELECT * FROM payments WHERE transaction_reference = $1",
      [reference]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    const payment = paymentResult.rows[0];

    await db.query(
      `UPDATE payments 
       SET payment_status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           gateway_response = $1
       WHERE id = $2`,
      [JSON.stringify(transaction), payment.id]
    );

 // Calculate commission for rent payment
    await commissionService.processPaymentCommission(payment.id); // ADD THIS LINE

     res.json({
      success: true,
      message: "Rent payment successful!",
      data: {
        property_id: payment.property_id,
        amount_paid: transaction.amount / 100,
        transaction_date: transaction.paid_at
      }
    });
  } catch (error) {
    console.error("Rent payment verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify rent payment"
    });
  }
};




// =====================================================
//            WALLET FUNDING VIA PAYSTACK
// =====================================================

exports.initializeWalletFunding = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || Number(amount) < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum wallet funding amount is ₦100',
      });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment service is not configured',
      });
    }

    const userResult = await db.query(
      'SELECT email, full_name, user_type FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Save a pending payment record
    const paymentResult = await db.query(
      `INSERT INTO payments
         (user_id, payment_type, amount, currency, payment_method, payment_status)
       VALUES ($1, 'wallet_funding', $2, 'NGN', 'paystack', 'pending')
       RETURNING id`,
      [userId, Number(amount)]
    );

    const paymentId = paymentResult.rows[0].id;
    const reference = `WALLET_${userId}_${paymentId}_${Date.now()}`;

    // Update reference
    await db.query(
      'UPDATE payments SET transaction_reference = $1 WHERE id = $2',
      [reference, paymentId]
    );

    // Initialize Paystack transaction
    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: user.email,
        amount: Math.round(Number(amount) * 100), // kobo
        reference,
        callback_url: `${FRONTEND_URL}/payment/verify-wallet-funding`,
        metadata: {
          payment_id:   paymentId,
          user_id:      userId,
          payment_type: 'wallet_funding',
          full_name:    user.full_name,
          user_type:    user.user_type,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return res.json({
      success: true,
      message: 'Wallet funding payment initialized',
      data: {
        payment_id:        paymentId,
        amount:            Number(amount),
        reference,
        authorization_url: paystackResponse.data.data.authorization_url,
        access_code:       paystackResponse.data.data.access_code,
      },
    });
  } catch (error) {
    console.error('Initialize wallet funding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize wallet funding',
    });
  }
};


exports.verifyWalletFunding = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'Reference is required' });
    }

    // Fetch payment record
    const paymentResult = await db.query(
      `SELECT * FROM payments
       WHERE transaction_reference = $1
         AND user_id = $2
         AND payment_type = 'wallet_funding'`,
      [reference, userId]
    );

    if (!paymentResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    const payment = paymentResult.rows[0];

    // Already processed
    if (payment.payment_status === 'completed') {
      return res.json({
        success: true,
        message: 'Wallet already funded for this transaction',
        data: { amount: payment.amount, already_processed: true },
      });
    }

    // Verify with Paystack
    const paystackResponse = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );

    const transaction = paystackResponse.data.data;

    if (transaction.status !== 'success') {
      return res.status(402).json({
        success: false,
        message: 'Payment not completed yet',
        status: transaction.status,
      });
    }

    const amountPaid = Number(transaction.amount) / 100;

    // Mark payment as completed
    await db.query(
      `UPDATE payments
       SET payment_status = 'completed',
           completed_at   = CURRENT_TIMESTAMP,
           gateway_response = $1
       WHERE id = $2`,
      [JSON.stringify(transaction), payment.id]
    );

    // Credit the wallet
    await db.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET balance = wallets.balance + $2, updated_at = CURRENT_TIMESTAMP`,
      [userId, amountPaid]
    );

// Calculate commission for wallet funding
    await commissionService.processPaymentCommission(payment.id); // ADD THIS LINE

      return res.json({
      success: true,
      message: `₦${amountPaid.toLocaleString()} has been added to your wallet successfully!`,
      data: { amount_funded: amountPaid, reference },
    });
  } catch (error) {
    console.error('Verify wallet funding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify wallet funding',
    });
  }
};


// =====================================================
//               PAYMENT HISTORY
// =====================================================

exports.getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { payment_type, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        p.*,
        prop.title AS property_title
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE p.user_id = $1
    `;
    let countQuery = "SELECT COUNT(*) FROM payments p WHERE p.user_id = $1";
    const params = [userId];
    const countParams = [userId];
    let paramCount = 2;

    if (payment_type) {
      query += ` AND p.payment_type = $${paramCount}`;
      countQuery += ` AND p.payment_type = $${paramCount}`;
      params.push(payment_type);
      countParams.push(payment_type);
      paramCount++;
    }

    if (status) {
      query += ` AND p.payment_status = $${paramCount}`;
      countQuery += ` AND p.payment_status = $${paramCount}`;
      params.push(status);
      countParams.push(status);
      paramCount++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const countResult = await db.query(countQuery, countParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment history"
    });
  }
};


// Get payment details
exports.getPaymentDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { paymentId } = req.params;

    const result = await db.query(
      `SELECT p.*, 
              prop.title AS property_title,
              prop.full_address AS property_address
       FROM payments p
       LEFT JOIN properties prop ON p.property_id = prop.id
       WHERE p.id = $1 AND p.user_id = $2`,
      [paymentId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
            message: "Failed to fetch payment details"
    });
  }
};


// Retry a pending payment – create a fresh Paystack transaction for it
exports.retryPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { paymentId } = req.params;

    // Look up the original payment record
    const paymentResult = await db.query(
      `SELECT p.*, prop.title AS property_title
       FROM payments p
       LEFT JOIN properties prop ON p.property_id = prop.id
       WHERE p.id = $1 AND p.user_id = $2`,
      [paymentId, userId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    const payment = paymentResult.rows[0];

    // Only allow retry of pending payments
    if (payment.payment_status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot retry a payment with status "${payment.payment_status}". Only pending payments can be retried.`
      });
    }

    // Get user email for Paystack
    const userResult = await db.query(
      "SELECT email, full_name FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const user = userResult.rows[0];

    // Create a new payment record for this retry attempt
    const newPaymentResult = await db.query(
      `INSERT INTO payments (user_id, payment_type, amount, currency,
                             property_id, payment_method, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id`,
      [
        userId,
        payment.payment_type,
        payment.amount,
        payment.currency || 'NGN',
        payment.property_id,
        payment.payment_method || 'paystack'
      ]
    );
    const newPaymentId = newPaymentResult.rows[0].id;

        // Determine callback URL and reference prefix based on payment type
    const CALLBACK_MAP = {
      rent_payment:       `${FRONTEND_URL}/payment/verify-rent`,
      tenant_subscription:`${FRONTEND_URL}/payment/verify-subscription`,
      property_unlock:    `${FRONTEND_URL}/properties/${payment.property_id || ''}`,
      wallet_funding:     `${FRONTEND_URL}/payment/verify-wallet-funding`,
      landlord_listing:   `${FRONTEND_URL}/payment/verify-listing`,
    };
    const REF_PREFIX_MAP = {
      rent_payment:       'RETRY_RENT',
      tenant_subscription:'RETRY_SUB',
      property_unlock:    'RETRY_UNLOCK',
      wallet_funding:     'RETRY_WALLET',
      landlord_listing:   'RETRY_LIST',
    };
    const callbackUrl = CALLBACK_MAP[payment.payment_type] || `${FRONTEND_URL}/payment/verify-rent`;
    const refPrefix = REF_PREFIX_MAP[payment.payment_type] || 'RETRY';

    // Initialize Paystack transaction
    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: user.email,
        amount: Number(payment.amount) * 100,
        reference: `${refPrefix}_${newPaymentId}_${Date.now()}`,
        callback_url: callbackUrl,
        metadata: {
          payment_id: newPaymentId,
          original_payment_id: payment.id,
          user_id: userId,
          property_id: payment.property_id,
          payment_type: payment.payment_type,
          tenant_name: user.full_name,
          property_title: payment.property_title,
        }
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Update the new payment with the transaction reference
    await db.query(
      "UPDATE payments SET transaction_reference = $1 WHERE id = $2",
      [paystackResponse.data.data.reference, newPaymentId]
    );

    return res.json({
      success: true,
      message: "Payment retry initialized",
      data: {
        payment_id: newPaymentId,
        original_payment_id: payment.id,
        authorization_url: paystackResponse.data.data.authorization_url,
        access_code: paystackResponse.data.data.access_code,
        reference: paystackResponse.data.data.reference,
        amount: payment.amount,
        payment_type: payment.payment_type
      }
    });
  } catch (error) {
    console.error("Retry payment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retry payment",
      error: error.message
    });
  }
};



// =====================================================
//                 PAYSTACK WEBHOOK
// =====================================================

exports.paystackWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    switch (event.event) {
      case "charge.success":
        await handleSuccessfulPayment(event.data);
        break;

      case "charge.failed":
        await handleFailedPayment(event.data);
        break;

      case "transfer.success":
      case "transfer.failed":
      case "transfer.reversed":
        await handleTransferWebhook(event.event, event.data);
        break;

      default:
        console.log("Unhandled event:", event.event);
    }

    res.status(200).send("Webhook received");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Webhook processing failed");
  }
};


// Handle successful payment
async function handleSuccessfulPayment(data) {
  try {
    const reference = data.reference;
    const metadata = data.metadata || {};

    await db.query(
      `UPDATE payments 
       SET payment_status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           gateway_response = $1
       WHERE transaction_reference = $2`,
      [JSON.stringify(data), reference]
    );

    const storedPaymentResult = await db.query(
      'SELECT id FROM payments WHERE transaction_reference = $1 LIMIT 1',
      [reference]
    );
    const paymentId = storedPaymentResult.rows[0]?.id || null;

    if (metadata.payment_type === "tenant_subscription") {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + (metadata.duration_days || 30));

      await db.query(
        `UPDATE users 
         SET subscription_active = TRUE,
             subscription_expires_at = $1
         WHERE id = $2`,
        [expiry, metadata.user_id]
      );
    }

    if (metadata.payment_type === "landlord_listing") {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + (metadata.duration_days || 30));

      await db.query(
        `UPDATE properties 
         SET expires_at = $1,
             featured = $2
         WHERE id = $3`,
        [expiry, metadata.featured === "true", metadata.property_id]
      );
    }

    if (metadata.payment_type === "property_unlock") {
      await ensurePropertyUnlockSchema();

      await db.query(
        `INSERT INTO tenant_property_unlocks (
           tenant_id, property_id, payment_id, transaction_reference
         )
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, property_id)
         DO UPDATE SET
           payment_id = EXCLUDED.payment_id,
           transaction_reference = EXCLUDED.transaction_reference,
           unlocked_at = CURRENT_TIMESTAMP`,
        [metadata.user_id, metadata.property_id, paymentId, reference]
      );
    }

    if (metadata.payment_type === 'lawyer_directory_unlock') {
      await ensureLawyerDirectoryUnlockSchema();

      await db.query(
        `INSERT INTO lawyer_directory_unlocks (
           user_id, payment_id, transaction_reference
         )
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id)
         DO UPDATE SET
           payment_id = EXCLUDED.payment_id,
           transaction_reference = EXCLUDED.transaction_reference,
           unlocked_at = CURRENT_TIMESTAMP`,
        [metadata.user_id, paymentId, reference]
      );
    }
    
    if (metadata.payment_type === "wallet_funding") {
      await db.query(
        `INSERT INTO wallets (user_id, balance)
         VALUES ($1, $2)
         ON CONFLICT (user_id)
         DO UPDATE SET balance = wallets.balance + $2, updated_at = CURRENT_TIMESTAMP`,
        [metadata.user_id, data.amount / 100]
      );
    }

    if (
      paymentId &&
      [
        'tenant_subscription',
        'landlord_listing',
        'property_unlock',
        'rent_payment',
        'wallet_funding',
      ].includes(metadata.payment_type)
    ) {
      await commissionService.processPaymentCommission(paymentId);
    }

    console.log("Webhook payment processed:", reference);
  } catch (error) {
    console.error("Webhook success handler error:", error);
  }
}

async function handleTransferWebhook(eventName, data) {
  try {
    const reference = data?.reference;
    if (!reference) return;

    if (reference.startsWith('AGW_')) {
      let status = 'pending';
      if (eventName === 'transfer.success') status = 'success';
      else if (eventName === 'transfer.failed') status = 'failed';
      else if (eventName === 'transfer.reversed') status = 'reversed';

      await AgentWithdrawalService.reconcilePaystackTransfer(reference, status, data);
      return;
    }

    if (reference.startsWith('WLW_')) {
      const result = await db.query(
        `SELECT * FROM withdrawal_requests WHERE paystack_transfer_reference = $1 LIMIT 1`,
        [reference]
      );

      if (!result.rows.length) return;
      const withdrawal = result.rows[0];

      if (eventName === 'transfer.success') {
        await db.query(
          `UPDATE withdrawal_requests
           SET status = 'processed',
               processed_at = CURRENT_TIMESTAMP,
               paystack_transfer_status = 'success',
               paystack_last_response = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [JSON.stringify(data), withdrawal.id]
        );
      } else if (eventName === 'transfer.failed' || eventName === 'transfer.reversed') {
        if (withdrawal.status !== 'pending' && withdrawal.status !== 'rejected') {
          await db.query(
            `UPDATE wallets
             SET balance = balance + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2`,
            [withdrawal.amount, withdrawal.user_id]
          );
        }

        await db.query(
          `UPDATE withdrawal_requests
           SET status = 'pending',
               paystack_transfer_status = $1,
               paystack_last_response = $2,
               payout_failed_reason = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [
            eventName === 'transfer.failed' ? 'failed' : 'reversed',
            JSON.stringify(data),
            data?.failure_reason || data?.reason || 'Transfer failed',
            withdrawal.id,
          ]
        );
      }
      return;
    }

    if (reference.startsWith('SAW_')) {
      const result = await db.query(
        `SELECT * FROM admin_withdrawals WHERE paystack_transfer_reference = $1 LIMIT 1`,
        [reference]
      );

      if (!result.rows.length) return;
      const withdrawal = result.rows[0];

      if (eventName === 'transfer.success') {
        await db.query(
          `UPDATE admin_withdrawals
           SET status = 'processed',
               processed_at = CURRENT_TIMESTAMP,
               paystack_transfer_status = 'success',
               paystack_last_response = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [JSON.stringify(data), withdrawal.id]
        );
      } else if (eventName === 'transfer.failed' || eventName === 'transfer.reversed') {
        if (withdrawal.status !== 'pending' && withdrawal.status !== 'rejected') {
          await db.query(
            `UPDATE users
             SET admin_wallet_balance = admin_wallet_balance + $1
             WHERE id = $2`,
            [withdrawal.amount, withdrawal.admin_id]
          );
        }

        await db.query(
          `UPDATE admin_withdrawals
           SET status = 'pending',
               paystack_transfer_status = $1,
               paystack_last_response = $2,
               payout_failed_reason = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [
            eventName === 'transfer.failed' ? 'failed' : 'reversed',
            JSON.stringify(data),
            data?.failure_reason || data?.reason || 'Transfer failed',
            withdrawal.id,
          ]
        );
      }
    }
  } catch (error) {
    console.error('Transfer webhook handler error:', error);
  }
}


// Handle failed payment
async function handleFailedPayment(data) {
  try {
    const reference = data.reference;

    await db.query(
      `UPDATE payments 
       SET payment_status = 'failed',
           gateway_response = $1
       WHERE transaction_reference = $2`,
      [JSON.stringify(data), reference]
    );

    console.log("Payment failed:", reference);
  } catch (error) {
    console.error("Webhook failure handler error:", error);
  }
}




// =====================================================
//             BANK ACCOUNT VERIFICATION
// =====================================================

exports.getBanks = async (_req, res) => {
  try {
    const banks = await fetchBanksFromPaystack(false);

    return res.json({
      success: true,
      data: banks,
      meta: {
        cached: true,
        count: banks.length,
      },
    });
  } catch (error) {
    console.error('Get banks error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch banks',
    });
  }
};

exports.refreshBankCache = async (_req, res) => {
  try {
    const banks = await fetchBanksFromPaystack(true);

    return res.json({
      success: true,
      message: 'Bank list refreshed successfully',
      data: banks,
      meta: {
        refreshed_at: new Date().toISOString(),
        count: banks.length,
      },
    });
  } catch (error) {
    console.error('Refresh bank cache error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to refresh banks',
    });
  }
};

exports.verifyBankAccount = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { bank_name, account_number } = req.body;
    
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment service is not configured'
      });
    }

    const banks = await fetchBanksFromPaystack(false);
    const bank = banks.find(b => 
      b.name.toLowerCase().includes(bank_name.toLowerCase()) ||
      bank_name.toLowerCase().includes(b.name.toLowerCase())
    );

    if (!bank) {
      return res.status(400).json({
        success: false,
        message: 'Bank not found. Please select a valid bank from the list.'
      });
    }

    // Now verify the account number with Paystack
    const verifyResponse = await axios.get(
      `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${account_number}&bank_code=${bank.code}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (verifyResponse.data.status === true) {
      return res.json({
        success: true,
        message: 'Account verified successfully',
        data: {
          account_name: verifyResponse.data.data.account_name,
          account_number: verifyResponse.data.data.account_number,
          bank_code: bank.code,
          bank_name: bank.name
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unable to verify account. Please check the account number and try again.'
      });
    }
  } catch (error) {
    console.error('Bank account verification error:', error);
    
    // Handle specific Paystack errors
    if (error.response) {
      const paystackError = error.response.data;
      
      if (paystackError.message === 'Invalid bank code') {
        return res.status(400).json({
          success: false,
          message: 'Invalid bank selected. Please choose a valid bank from the list.'
        });
      }
      
      if (paystackError.message === 'Account number could not be resolved') {
        return res.status(400).json({
          success: false,
          message: 'Account number could not be verified. Please check the account number and try again.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: paystackError.message || 'Failed to verify account. Please try again.'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to verify account. Please try again later.'
    });
  }
};

module.exports = exports;
