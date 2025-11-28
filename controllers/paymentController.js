 const axios = require('axios'); const crypto = require('crypto'); const pool = require('../config/middleware/database'); const { validationResult } = require('express-validator');

// Paystack configuration const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY; const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// ============ SUBSCRIPTION PLANS ============

const SUBSCRIPTION_PLANS = [ { id: 'basic_monthly', name: 'Basic Monthly', duration_days: 30, price: 1000, // NGN 1,000 features: ['View all properties', 'Contact landlords', 'Save favorites'] }, { id: 'standard_quarterly', name: 'Standard Quarterly', duration_days: 90, price: 2500, // NGN 2,500 (save 500) features: ['View all properties', 'Contact landlords', 'Save favorites', 'Priority support'] }, { id: 'premium_yearly', name: 'Premium Yearly', duration_days: 365, price: 8000, // NGN 8,000 (save 4,000) features: ['View all properties', 'Contact landlords', 'Save favorites', 'Priority support', 'Early access to new listings'] } ];

const LISTING_PLANS = [ { id: 'single_listing_30', name: 'Single Listing - 30 Days', duration_days: 30, price: 2000, // NGN 2,000 listings_count: 1, featured: false }, { id: 'single_listing_60', name: 'Single Listing - 60 Days', duration_days: 60, price: 3500, // NGN 3,500 listings_count: 1, featured: false }, { id: 'featured_listing_30', name: 'Featured Listing - 30 Days', duration_days: 30, price: 5000, // NGN 5,000 listings_count: 1, featured: true }, { id: 'multi_listing_monthly', name: 'Multiple Listings - 30 Days', duration_days: 30, price: 10000, // NGN 10,000 listings_count: 5, featured: false }, { id: 'unlimited_monthly', name: 'Unlimited Listings - 30 Days', duration_days: 30, price: 20000, // NGN 20,000 listings_count: -1, // unlimited featured: false } ];

// Get subscription plans exports.getSubscriptionPlans = (req, res) => { res.json({ success: true, data: SUBSCRIPTION_PLANS }); };

// Get listing plans exports.getListingPlans = (req, res) => { res.json({ success: true, data: LISTING_PLANS }); };

// ============ TENANT SUBSCRIPTION ============

exports.initializeSubscription = async (req, res) => { try { const errors = validationResult(req); if (!errors.isEmpty()) { return res.status(400).json({ success: false, errors: errors.array() }); }

const userId = req.user.id;
const { plan_id, payment_method } = req.body;

// Find plan
const plan = SUBSCRIPTION_PLANS.find(p => p.id === plan_id);
if (!plan) {
  return res.status(404).json({
    success: false,
    message: 'Subscription plan not found'
  });
}

// Get user email
const userResult = await pool.query(
  'SELECT email, full_name FROM users WHERE id = $1',
  [userId]
);
const user = userResult.rows[0];

// Create payment record
const paymentResult = await pool.query(
  `INSERT INTO payments (user_id, payment_type, amount, currency, 
                         subscription_duration_days, payment_method, payment_status)
   VALUES ($1, 'tenant_subscription', $2, 'NGN', $3, $4, 'pending')
   RETURNING id`,
  [userId, plan.price, plan.duration_days, payment_method]
);

const paymentId = paymentResult.rows[0].id;

if (payment_method === 'paystack') {
  // Initialize Paystack payment
  const paystackResponse = await axios.post(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    {
      email: user.email,
      amount: plan.price * 100, // Paystack uses kobo (smallest currency unit)
      reference: `SUB_${paymentId}_${Date.now()}`,
      callback_url: `${process.env.FRONTEND_URL}/payment/verify-subscription`,
      metadata: {
        payment_id: paymentId,
        user_id: userId,
        plan_id: plan_id,
        payment_type: 'tenant_subscription',
        full_name: user.full_name
      }
    },
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // Update payment with transaction reference
  await pool.query(
    'UPDATE payments SET transaction_reference = $1 WHERE id = $2',
    [paystackResponse.data.data.reference, paymentId]
  );

  res.json({
    success: true,
    message: 'Payment initialized',
    data: {
      payment_id: paymentId,
      authorization_url: paystackResponse.data.data.authorization_url,
      access_code: paystackResponse.data.data.access_code,
      reference: paystackResponse.data.data.reference
    }
  });

} else if (payment_method === 'bank_transfer') {
  // Provide bank details for manual transfer
  res.json({
    success: true,
    message: 'Please transfer to the account below',
    data: {
      payment_id: paymentId,
      bank_name: 'Your Bank Name',
      account_number: '1234567890',
      account_name: 'Rental Platform Ltd',
      amount: plan.price,
      reference: `SUB_${paymentId}_${Date.now()}`
    }
  });
}
} catch (error) { console.error('Subscription initialization error:', error); res.status(500).json({ success: false, message: 'Failed to initialize subscription payment', error: error.message }); } };

// Verify subscription payment exports.verifySubscription = async (req, res) => { try { const { reference } = req.params; const userId = req.user.id;

// Verify with Paystack
const paystackResponse = await axios.get(
  `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
  {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
    }
  }
);

const transaction = paystackResponse.data.data;

if (transaction.status === 'success') {
  // Get payment record
  const paymentResult = await pool.query(
    'SELECT * FROM payments WHERE transaction_reference = $1',
    [reference]
  );

  if (paymentResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Payment record not found'
    });
  }

  const payment = paymentResult.rows[0];

  // Update payment status
  await pool.query(
    `UPDATE payments 
     SET payment_status = 'completed', 
         completed_at = CURRENT_TIMESTAMP,
         gateway_response = $1
     WHERE id = $2`,
    [JSON.stringify(transaction), payment.id]
  );

  // Calculate subscription expiry
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + payment.subscription_duration_days);

  // Update user subscription
  await pool.query(
    `UPDATE users 
     SET subscription_active = TRUE,
         subscription_expires_at = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [expiryDate, userId]
  );

  res.json({
    success: true,
    message: 'Subscription activated successfully!',
    data: {
      subscription_expires_at: expiryDate,
      amount_paid: transaction.amount / 100
    }
  });

} else {
  res.status(400).json({
    success: false,
    message: 'Payment verification failed',
    status: transaction.status
  });
}
} catch (error) { console.error('Subscription verification error:', error); res.status(500).json({ success: false, message: 'Failed to verify subscription payment' }); } };

// Get subscription status exports.getSubscriptionStatus = async (req, res) => { try { const userId = req.user.id;

const result = await pool.query(
  `SELECT subscription_active, subscription_expires_at 
   FROM users WHERE id = $1`,
  [userId]
);

const user = result.rows[0];
const now = new Date();
const isActive = user.subscription_active && 
                 user.subscription_expires_at && 
                 new Date(user.subscription_expires_at) > now;

res.json({
  success: true,
  data: {
    active: isActive,
    expires_at: user.subscription_expires_at,
    days_remaining: isActive ? 
      Math.ceil((new Date(user.subscription_expires_at) - now) / (1000 * 60 * 60 * 24)) : 0
  }
});
} catch (error) { res.status(500).json({ success: false, message: 'Failed to get subscription status' }); } };

// ============ LANDLORD LISTING PAYMENT ============

exports.initializeListingPayment = async (req, res) => { try { const errors = validationResult(req); if (!errors.isEmpty()) { return res.status(400).json({ success: false, errors: errors.array() }); }

const userId = req.user.id;
const { plan_id, property_id, payment_method } = req.body;

// Find plan
const plan = LISTING_PLANS.find(p => p.id === plan_id);
if (!plan) {
  return res.status(404).json({
    success: false,
    message: 'Listing plan not found'
  });
}

// Get user email
const userResult = await pool.query(
  'SELECT email, full_name FROM users WHERE id = $1',
  [userId]
);
const user = userResult.rows[0];

// Create payment record
const paymentResult = await pool.query(
  `INSERT INTO payments (user_id, payment_type, amount, currency, 
                         property_id, payment_method, payment_status)
   VALUES ($1, 'landlord_listing', $2, 'NGN', $3, $4, 'pending')
   RETURNING id`,
  [userId, plan.price, property_id || null, payment_method]
);

const paymentId = paymentResult.rows[0].id;

if (payment_method === 'paystack') {
  const paystackResponse = await axios.post(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    {
      email: user.email,
      amount: plan.price * 100,
      reference: `LIST_${paymentId}_${Date.now()}`,
      callback_url: `${process.env.FRONTEND_URL}/payment/verify-listing`,
      metadata: {
        payment_id: paymentId,
        user_id: userId,
        plan_id: plan_id,
        property_id: property_id,
        payment_type: 'landlord_listing',
        full_name: user.full_name,
        duration_days: plan.duration_days,
        featured: plan.featured
      }
    },
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  await pool.query(
    'UPDATE payments SET transaction_reference = $1 WHERE id = $2',
    [paystackResponse.data.data.reference, paymentId]
  );

  res.json({
    success: true,
    message: 'Payment initialized',
    data: {
      payment_id: paymentId,
      authorization_url: paystackResponse.data.data.authorization_url,
      access_code: paystackResponse.data.data.access_code,
      reference: paystackResponse.data.data.reference
    }
  });

} else if (payment_method === 'bank_transfer') {
  res.json({
    success: true,
    message: 'Please transfer to the account below',
    data: {
      payment_id: paymentId,
      bank_name: 'Your Bank Name',
      account_number: '1234567890',
      account_name: 'Rental Platform Ltd',
      amount: plan.price,
      reference: `LIST_${paymentId}_${Date.now()}`
    }
  });
}
} catch (error) { console.error('Listing payment initialization error:', error); res.status(500).json({ success: false, message: 'Failed to initialize listing payment', error: error.message }); } };

// Verify listing payment exports.verifyListingPayment = async (req, res) => { try { const { reference } = req.params; const userId = req.user.id;

const paystackResponse = await axios.get(
  `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
  {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
    }
  }
);

const transaction = paystackResponse.data.data;

if (transaction.status === 'success') {
  const paymentResult = await pool.query(
    'SELECT * FROM payments WHERE transaction_reference = $1',
    [reference]
  );

  if (paymentResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Payment record not found'
    });
  }

  const payment = paymentResult.rows[0];
  const metadata = transaction.metadata;

  // Update payment status
  await pool.query(
    `UPDATE payments 
     SET payment_status = 'completed', 
         completed_at = CURRENT_TIMESTAMP,
         gateway_response = $1
     WHERE id = $2`,
    [JSON.stringify(transaction), payment.id]
  );

  // If property_id exists, update property expiry
  if (payment.property_id) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + metadata.duration_days);

    await pool.query(
      `UPDATE properties 
       SET expires_at = $1,
           featured = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND landlord_id = $4`,
      [expiryDate, metadata.featured || false, payment.property_id, userId]
    );
  }

  res.json({
    success: true,
    message: 'Listing payment successful!',
    data: {
      property_id: payment.property_id,
      amount_paid: transaction.amount / 100,
      duration_days: metadata.duration_days,
      featured: metadata.featured
    }
  });

} else {
  res.status(400).json({
    success: false,
    message: 'Payment verification failed',
    status: transaction.status
  });
}
 } catch (error) {
    console.error('Listing payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify listing payment'
    });
  }
};

// ============ RENT PAYMENT ============

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

    // Verify property exists and get landlord info
    const propertyResult = await pool.query(
      `SELECT p.id, p.landlord_id, p.title, u.email as landlord_email, u.full_name as landlord_name
       FROM properties p
       JOIN users u ON p.landlord_id = u.id
       WHERE p.id = $1`,
      [property_id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    const property = propertyResult.rows[0];

    // Get tenant info
    const userResult = await pool.query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Platform commission (2.5%)
    const platformFee = amount * 0.025;
    const landlordAmount = amount - platformFee;

    // Create payment record
    const paymentResult = await pool.query(
      `INSERT INTO payments (user_id, payment_type, amount, currency, 
                             property_id, payment_method, payment_status)
       VALUES ($1, 'rent_payment', $2, 'NGN', $3, $4, 'pending')
       RETURNING id`,
      [userId, amount, property_id, payment_method]
    );

    const paymentId = paymentResult.rows[0].id;

    if (payment_method === 'paystack') {
      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: user.email,
          amount: amount * 100,
          reference: `RENT_${paymentId}_${Date.now()}`,
          callback_url: `${process.env.FRONTEND_URL}/payment/verify-rent`,
          metadata: {
            payment_id: paymentId,
            user_id: userId,
            property_id: property_id,
            landlord_id: property.landlord_id,
            payment_type: 'rent_payment',
            tenant_name: user.full_name,
            landlord_name: property.landlord_name,
            property_title: property.title,
            platform_fee: platformFee,
            landlord_amount: landlordAmount
          },
          // Split payment - send to landlord's subaccount (requires Paystack subaccount setup)
          // subaccount: property.landlord_subaccount_code,
          // transaction_charge: platformFee * 100
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      await pool.query(
        'UPDATE payments SET transaction_reference = $1 WHERE id = $2',
        [paystackResponse.data.data.reference, paymentId]
      );

      res.json({
        success: true,
        message: 'Rent payment initialized',
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

    } else if (payment_method === 'bank_transfer') {
      res.json({
        success: true,
        message: 'Please transfer to the account below',
        data: {
          payment_id: paymentId,
          bank_name: 'Your Bank Name',
          account_number: '1234567890',
          account_name: 'Rental Platform Ltd',
          amount: amount,
          reference: `RENT_${paymentId}_${Date.now()}`,
          platform_fee: platformFee,
          landlord_receives: landlordAmount
        }
      });
    }

  } catch (error) {
    console.error('Rent payment initialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize rent payment',
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
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const transaction = paystackResponse.data.data;

    if (transaction.status === 'success') {
      const paymentResult = await pool.query(
        'SELECT * FROM payments WHERE transaction_reference = $1',
        [reference]
      );

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Payment record not found'
        });
      }

      const payment = paymentResult.rows[0];

      // Update payment status
      await pool.query(
        `UPDATE payments 
         SET payment_status = 'completed', 
             completed_at = CURRENT_TIMESTAMP,
             gateway_response = $1
         WHERE id = $2`,
        [JSON.stringify(transaction), payment.id]
      );

      // TODO: Send notification to landlord about rent payment
      // TODO: Generate receipt

      res.json({
        success: true,
        message: 'Rent payment successful!',
        data: {
          property_id: payment.property_id,
          amount_paid: transaction.amount / 100,
          transaction_date: transaction.paid_at
        }
      });

    } else {
      res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        status: transaction.status
      });
    }

  } catch (error) {
    console.error('Rent payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify rent payment'
    });
  }
};

// ============ PAYMENT HISTORY ============

exports.getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { payment_type, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM payments WHERE user_id = $1';
    const params = [userId];
    let paramCount = 2;

    if (payment_type) {
      query += ` AND payment_type = $${paramCount}`;
      params.push(payment_type);
      paramCount++;
    }

    if (status) {
      query += ` AND payment_status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM payments WHERE user_id = $1';
    const countResult = await pool.query(countQuery, [userId]);

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
      message: 'Failed to fetch payment history'
    });
  }
};

// Get payment details
exports.getPaymentDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { paymentId } = req.params;

    const result = await pool.query(
      `SELECT p.*, 
              prop.title as property_title,
              prop.full_address as property_address
       FROM payments p
       LEFT JOIN properties prop ON p.property_id = prop.id
       WHERE p.id = $1 AND p.user_id = $2`,
      [paymentId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details'
    });
  }
};

// ============ WEBHOOKS ============

// Paystack Webhook
exports.paystackWebhook = async (req, res) => {
  try {
    // Verify webhook signature
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).send('Invalid signature');
    }

    const event = req.body;

    // Handle different event types
    switch (event.event) {
      case 'charge.success':
        await handleSuccessfulPayment(event.data);
        break;
      
      case 'charge.failed':
        await handleFailedPayment(event.data);
        break;
      
      case 'transfer.success':
        // Handle successful transfer to landlord
        console.log('Transfer successful:', event.data);
        break;
      
      default:
        console.log('Unhandled event:', event.event);
    }

    res.status(200).send('Webhook received');

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook processing failed');
  }
};

// Handle successful payment from webhook
async function handleSuccessfulPayment(data) {
  try {
    const reference = data.reference;
    const metadata = data.metadata;

    // Update payment status
    await pool.query(
      `UPDATE payments 
       SET payment_status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           gateway_response = $1
       WHERE transaction_reference = $2`,
      [JSON.stringify(data), reference]
    );

    // Handle based on payment type
    if (metadata.payment_type === 'tenant_subscription') {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + parseInt(metadata.duration_days || 30));

      await pool.query(
        `UPDATE users 
         SET subscription_active = TRUE,
             subscription_expires_at = $1
         WHERE id = $2`,
        [expiryDate, metadata.user_id]
      );
    } 
    else if (metadata.payment_type === 'landlord_listing') {
      if (metadata.property_id) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(metadata.duration_days || 30));

        await pool.query(
          `UPDATE properties 
           SET expires_at = $1,
               featured = $2
           WHERE id = $3`,
          [expiryDate, metadata.featured === 'true', metadata.property_id]
        );
      }
    }

    console.log('Payment processed successfully:', reference);
  } catch (error) {
    console.error('Error handling successful payment:', error);
  }
}

// Handle failed payment from webhook
async function handleFailedPayment(data) {
  try {
    const reference = data.reference;

    await pool.query(
      `UPDATE payments 
       SET payment_status = 'failed',
           gateway_response = $1
       WHERE transaction_reference = $2`,
      [JSON.stringify(data), reference]
    );

    console.log('Payment failed:', reference);
  } catch (error) {
    console.error('Error handling failed payment:', error);
  }
}

// Flutterwave Webhook (if you want to support multiple gateways)
exports.flutterwaveWebhook = async (req, res) => {
  try {
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
    const signature = req.headers['verif-hash'];

    if (!signature || signature !== secretHash) {
      return res.status(401).send('Invalid signature');
    }

    const payload = req.body;

    // Handle webhook events
    console.log('Flutterwave webhook:', payload);

    res.status(200).send('Webhook received');

  } catch (error) {
    console.error('Flutterwave webhook error:', error);
    res.status(500).send('Webhook processing failed');
  }
};

module.exports = exports;

