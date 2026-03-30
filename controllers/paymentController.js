// ====================== IMPORTS ======================
const axios = require("axios");
const crypto = require("crypto");
const db = require('../config/middleware/database');
const { validationResult } = require("express-validator");
const { getFrontendUrl } = require('../config/utils/frontendUrl');
const {
  LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
  ensureLawyerDirectoryUnlockSchema,
  getLawyerDirectoryUnlockStatus: readLawyerDirectoryUnlockStatus,
} = require('../config/utils/lawyerDirectoryAccess');
const commissionService = require('../services/commissionService');

// ====================== PAYSTACK CONFIG ======================
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";
const PROPERTY_UNLOCK_PRICE_NGN = Number(process.env.PROPERTY_UNLOCK_PRICE_NGN || 1000);
const FRONTEND_URL = getFrontendUrl();

let propertyUnlockSchemaReady = false;
let walletLedgerSchemaReady = false;
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

const SUBSCRIPTION_PLANS = [
  {
    id: "basic_monthly",
    name: "Basic Monthly",
    duration_days: 30,
    price: 1000,
    features: [
      "View all properties",
      "Contact landlords",
      "Save favorites"
    ]
  },
  {
    id: "standard_quarterly",
    name: "Standard Quarterly",
    duration_days: 90,
    price: 2500,
    features: [
      "View all properties",
      "Contact landlords",
      "Save favorites",
      "Priority support"
    ]
  },
  {
    id: "premium_yearly",
    name: "Premium Yearly",
    duration_days: 365,
    price: 8000,
    features: [
      "View all properties",
      "Contact landlords",
      "Save favorites",
      "Priority support",
      "Early access to new listings"
    ]
  }
];


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


// =====================================================
//              PUBLIC PLAN ENDPOINTS
// =====================================================

// Get subscription plans
exports.getSubscriptionPlans = (req, res) => {
  res.json({
    success: true,
    data: SUBSCRIPTION_PLANS
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

exports.initializeSubscription = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { plan_id, payment_method } = req.body;

    // Find plan
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === plan_id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found"
      });
    }

    // Get user email
    const userResult = await db.query(
      "SELECT email, full_name FROM users WHERE id = $1",
      [userId]
    );
    const user = userResult.rows[0];

    // Create payment record
    const paymentResult = await db.query(
      `INSERT INTO payments (user_id, payment_type, amount, currency,
                             subscription_duration_days, payment_method, payment_status)
       VALUES ($1, 'tenant_subscription', $2, 'NGN', $3, $4, 'pending')
       RETURNING id`,
      [userId, plan.price, plan.duration_days, payment_method]
    );

    const paymentId = paymentResult.rows[0].id;

    // PAYSTACK
    if (payment_method === "paystack") {
      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: user.email,
          amount: plan.price * 100,
          reference: `SUB_${paymentId}_${Date.now()}`,
          callback_url: `${FRONTEND_URL}/payment/verify-subscription`,
          metadata: {
            payment_id: paymentId,
            user_id: userId,
            plan_id: plan_id,
            payment_type: "tenant_subscription",
            full_name: user.full_name
          }
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      // Update DB with reference
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

    // Bank transfer fallback
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
          reference: `SUB_${paymentId}_${Date.now()}`
        }
      });
    }
  } catch (error) {
    console.error("Subscription initialization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize subscription payment",
      error: error.message
    });
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
    const userId = req.user.id;

    const result = await db.query(
      `SELECT subscription_active, subscription_expires_at 
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];
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




// =====================================================
//                 PAYSTACK WEBHOOK
// =====================================================

exports.paystackWebhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
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
        console.log("Transfer successful:", event.data);
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
