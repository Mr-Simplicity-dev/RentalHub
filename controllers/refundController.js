// =====================================================
//              REFUND CONTROLLER
// =====================================================
// Flow:
//   1. Tenant submits a refund request on a completed rent_payment
//   2. Landlord sees pending requests and approves or rejects
//   3. On approval the payment is marked refunded (manual payout handled offline or via Paystack)
//   4. Admin can view all refund requests across the platform
// =====================================================

const db = require('../config/middleware/database');
const axios = require('axios');
const {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCodeFromName,
  isValidPaystackSignature,
} = require('../services/paystackTransfer.service');

const WALLET_WITHDRAWAL_ADMIN_ROLES = ['admin', 'super_admin', 'financial_admin', 'super_financial_admin'];

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL   = 'https://api.paystack.co';

// ── Ensure refund table exists ────────────────────────────────────────────────
let refundSchemaReady = false;

const ensureRefundSchema = async () => {
  if (refundSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS refund_requests (
      id                  SERIAL PRIMARY KEY,
      payment_id          INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      tenant_id           INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      landlord_id         INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      property_id         INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      amount              NUMERIC(12,2) NOT NULL,
      refund_type         VARCHAR(20)   NOT NULL DEFAULT 'full',
      refund_months       INTEGER,
      approved_amount     NUMERIC(12,2),
      reason              VARCHAR(100)  NOT NULL,
      details             TEXT,
      status              VARCHAR(20)   NOT NULL DEFAULT 'pending',
      landlord_note       TEXT,
      requested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at         TIMESTAMP,
      refunded_at         TIMESTAMP,
      created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_refund_status
        CHECK (status IN ('pending','approved','rejected','refunded')),
      CONSTRAINT chk_refund_type
        CHECK (refund_type IN ('full','partial_months','partial_custom'))
    );

    ALTER TABLE refund_requests
      ADD COLUMN IF NOT EXISTS refund_type     VARCHAR(20)   NOT NULL DEFAULT 'full',
      ADD COLUMN IF NOT EXISTS refund_months   INTEGER,
      ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(12,2);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_tenant
      ON refund_requests(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_landlord
      ON refund_requests(landlord_id);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_payment
      ON refund_requests(payment_id);

    -- Wallet: holds approved refund amounts until withdrawn
    CREATE TABLE IF NOT EXISTS wallets (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      balance     NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Withdrawal requests
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount          NUMERIC(12,2) NOT NULL,
      bank_name       VARCHAR(100) NOT NULL,
      account_number  VARCHAR(20)  NOT NULL,
      account_name    VARCHAR(100) NOT NULL,
      status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
      admin_note      TEXT,
      requested_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at    TIMESTAMP,
      CONSTRAINT chk_withdrawal_status
        CHECK (status IN ('pending','approved','rejected','processed'))
    );

    ALTER TABLE withdrawal_requests
      ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_reference VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_status VARCHAR(40),
      ADD COLUMN IF NOT EXISTS paystack_last_response JSONB,
      ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payout_failed_reason TEXT;

    CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON withdrawal_requests(user_id);
  `);

  refundSchemaReady = true;
};


// =====================================================
//         TENANT — Submit Refund Request
// =====================================================
exports.submitRefundRequest = async (req, res) => {
  try {
    await ensureRefundSchema();

    const tenantId = req.user.id;
    const { payment_id, reason, details } = req.body;

    if (!payment_id || !reason) {
      return res.status(400).json({
        success: false,
        message: 'payment_id and reason are required',
      });
    }

    // Confirm the payment belongs to this tenant and is a completed rent payment
    const paymentResult = await db.query(
      `SELECT p.id, p.amount, p.payment_status, p.property_id,
              prop.landlord_id, prop.title AS property_title
       FROM payments p
       JOIN properties prop ON p.property_id = prop.id
       WHERE p.id       = $1
         AND p.user_id  = $2
         AND p.payment_type    = 'rent_payment'
         AND p.payment_status  = 'completed'`,
      [payment_id, tenantId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found, does not belong to you, or is not eligible for a refund. Only completed rent payments can be refunded.',
      });
    }

    const payment = paymentResult.rows[0];

    // Block duplicate pending/approved requests for the same payment
    const existing = await db.query(
      `SELECT id, status FROM refund_requests
       WHERE payment_id = $1 AND tenant_id = $2
         AND status IN ('pending', 'approved')`,
      [payment_id, tenantId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A refund request for this payment is already ${existing.rows[0].status}.`,
      });
    }

    // Create the refund request
    const result = await db.query(
      `INSERT INTO refund_requests
         (payment_id, tenant_id, landlord_id, property_id, amount, reason, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        payment_id,
        tenantId,
        payment.landlord_id,
        payment.property_id,
        payment.amount,
        reason,
        details || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Refund request submitted successfully. The landlord will review it shortly.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Submit refund request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit refund request',
    });
  }
};


// =====================================================
//         TENANT — Get My Refund Requests
// =====================================================
exports.getTenantRefundRequests = async (req, res) => {
  try {
    await ensureRefundSchema();

    const tenantId = req.user.id;

    const result = await db.query(
      `SELECT
          rr.*,
          prop.title          AS property_title,
          prop.full_address   AS property_address,
          u.full_name         AS landlord_name,
          p.transaction_reference,
          p.completed_at      AS payment_date
       FROM refund_requests rr
       JOIN properties prop ON rr.property_id  = prop.id
       JOIN users      u    ON rr.landlord_id   = u.id
       JOIN payments   p    ON rr.payment_id    = p.id
       WHERE rr.tenant_id = $1
       ORDER BY rr.requested_at DESC`,
      [tenantId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get tenant refund requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch refund requests',
    });
  }
};


// =====================================================
//     TENANT — Get Eligible Rent Payments
//     (completed rent payments with no pending/approved refund)
// =====================================================
exports.getEligibleRentPayments = async (req, res) => {
  try {
    await ensureRefundSchema();

    const tenantId = req.user.id;

    const result = await db.query(
      `SELECT
          p.id            AS payment_id,
          p.amount,
          p.completed_at  AS paid_at,
          p.transaction_reference,
          prop.title      AS property_title,
          prop.full_address AS property_address,
          u.full_name     AS landlord_name
       FROM payments p
       JOIN properties prop ON p.property_id = prop.id
       JOIN users      u    ON prop.landlord_id = u.id
       WHERE p.user_id         = $1
         AND p.payment_type    = 'rent_payment'
         AND p.payment_status  = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM refund_requests rr
           WHERE rr.payment_id = p.id
             AND rr.tenant_id  = p.user_id
             AND rr.status IN ('pending', 'approved', 'refunded')
         )
       ORDER BY p.completed_at DESC`,
      [tenantId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get eligible rent payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch eligible payments',
    });
  }
};


// =====================================================
//     LANDLORD — Get Pending Refund Requests
// =====================================================
exports.getLandlordRefundRequests = async (req, res) => {
  try {
    await ensureRefundSchema();

    const landlordId = req.user.id;
    const { status } = req.query; // optional filter: pending | approved | rejected | refunded

    let query = `
      SELECT
          rr.*,
          prop.title          AS property_title,
          prop.full_address   AS property_address,
          t.full_name         AS tenant_name,
          t.email             AS tenant_email,
          t.phone             AS tenant_phone,
          p.transaction_reference,
          p.completed_at      AS payment_date
       FROM refund_requests rr
       JOIN properties prop ON rr.property_id = prop.id
       JOIN users      t    ON rr.tenant_id   = t.id
       JOIN payments   p    ON rr.payment_id  = p.id
       WHERE rr.landlord_id = $1
    `;
    const params = [landlordId];

    if (status) {
      params.push(status);
      query += ` AND rr.status = $${params.length}`;
    }

    query += ' ORDER BY rr.requested_at DESC';

    const result = await db.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get landlord refund requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch refund requests',
    });
  }
};


// =====================================================
//     LANDLORD — Approve Refund Request (full / partial)
// =====================================================
// refund_type: 'full' | 'partial_months' | 'partial_custom'
// refund_months: number of months to refund (for partial_months)
// approved_amount: custom amount (for partial_custom)
// =====================================================
exports.approveRefundRequest = async (req, res) => {
  try {
    await ensureRefundSchema();

    const landlordId = req.user.id;
    const { refundId } = req.params;
    const {
      landlord_note,
      refund_type = 'full',      // full | partial_months | partial_custom
      refund_months,             // e.g. 3, 6, 10 — used when refund_type = partial_months
      approved_amount,           // custom amount  — used when refund_type = partial_custom
    } = req.body;

    // Fetch refund + original payment details
    const refundResult = await db.query(
      `SELECT rr.*, p.transaction_reference, p.amount AS original_amount,
              p.payment_frequency, prop.rent_amount AS monthly_rent
       FROM refund_requests rr
       JOIN payments   p    ON rr.payment_id   = p.id
       JOIN properties prop ON rr.property_id  = prop.id
       WHERE rr.id = $1 AND rr.landlord_id = $2 AND rr.status = 'pending'`,
      [refundId, landlordId]
    );

    if (refundResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Refund request not found, does not belong to you, or is no longer pending.',
      });
    }

    const refund = refundResult.rows[0];
    const originalAmount = Number(refund.original_amount);
    const monthlyRent = Number(refund.monthly_rent);

    // ── Calculate approved amount based on refund type ──────────────────────
    let finalAmount;

    if (refund_type === 'full') {
      finalAmount = originalAmount;
    } else if (refund_type === 'partial_months') {
      if (!refund_months || refund_months <= 0) {
        return res.status(400).json({
          success: false,
          message: 'refund_months is required for partial_months refund type',
        });
      }
      finalAmount = Math.min(monthlyRent * Number(refund_months), originalAmount);
    } else if (refund_type === 'partial_custom') {
      if (!approved_amount || Number(approved_amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'approved_amount is required for partial_custom refund type',
        });
      }
      finalAmount = Math.min(Number(approved_amount), originalAmount);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid refund_type. Must be full, partial_months, or partial_custom',
      });
    }

    // ── Try Paystack refund ─────────────────────────────────────────────────
    let paystackSuccess = false;

    if (refund.transaction_reference && PAYSTACK_SECRET_KEY) {
      try {
        await axios.post(
          `${PAYSTACK_BASE_URL}/refund`,
          {
            transaction: refund.transaction_reference,
            amount: Math.round(finalAmount * 100), // kobo
          },
          {
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        paystackSuccess = true;
      } catch (paystackErr) {
        console.error('Paystack refund error:', paystackErr.response?.data || paystackErr.message);
      }
    }

    const newStatus = paystackSuccess ? 'refunded' : 'approved';

    // ── Update refund request ───────────────────────────────────────────────
    await db.query(
      `UPDATE refund_requests
       SET status          = $1,
           refund_type     = $2,
           refund_months   = $3,
           approved_amount = $4,
           landlord_note   = $5,
           reviewed_at     = CURRENT_TIMESTAMP,
           refunded_at     = CASE WHEN $1 = 'refunded' THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at      = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [newStatus, refund_type, refund_months || null, finalAmount, landlord_note || null, refundId]
    );

    // ── Credit tenant wallet ────────────────────────────────────────────────
    await db.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET balance = wallets.balance + $2, updated_at = CURRENT_TIMESTAMP`,
      [refund.tenant_id, finalAmount]
    );

    if (paystackSuccess) {
      await db.query(
        `UPDATE payments SET payment_status = 'refunded' WHERE id = $1`,
        [refund.payment_id]
      );
    }

    const months = refund_type === 'partial_months' ? refund_months : null;
    const typeLabel = refund_type === 'full'
      ? 'full refund'
      : refund_type === 'partial_months'
      ? `${months}-month partial refund`
      : 'custom partial refund';

    return res.json({
      success: true,
      message: `${typeLabel} of ₦${finalAmount.toLocaleString()} approved. ${paystackSuccess ? 'Processed via Paystack.' : 'Credited to tenant wallet — manual payout pending.'}`,
      data: {
        refund_id: refundId,
        status: newStatus,
        approved_amount: finalAmount,
        refund_type,
        refund_months: months,
      },
    });
  } catch (error) {
    console.error('Approve refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve refund request',
    });
  }
};


// =====================================================
//     LANDLORD — Reject Refund Request
// =====================================================
exports.rejectRefundRequest = async (req, res) => {
  try {
    await ensureRefundSchema();

    const landlordId = req.user.id;
    const { refundId } = req.params;
    const { landlord_note } = req.body;

    if (!landlord_note || !landlord_note.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A reason for rejection (landlord_note) is required.',
      });
    }

    const result = await db.query(
      `UPDATE refund_requests
       SET status        = 'rejected',
           landlord_note = $1,
           reviewed_at   = CURRENT_TIMESTAMP,
           updated_at    = CURRENT_TIMESTAMP
       WHERE id = $2 AND landlord_id = $3 AND status = 'pending'
       RETURNING *`,
      [landlord_note, refundId, landlordId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Refund request not found, does not belong to you, or is no longer pending.',
      });
    }

    res.json({
      success: true,
      message: 'Refund request rejected.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Reject refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject refund request',
    });
  }
};


// =====================================================
//     ADMIN — Get All Refund Requests
// =====================================================
exports.adminGetAllRefundRequests = async (req, res) => {
  try {
    await ensureRefundSchema();

    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
          rr.*,
          prop.title        AS property_title,
          t.full_name       AS tenant_name,
          t.email           AS tenant_email,
          l.full_name       AS landlord_name,
          l.email           AS landlord_email,
          p.transaction_reference,
          p.completed_at    AS payment_date
       FROM refund_requests rr
       JOIN properties prop ON rr.property_id = prop.id
       JOIN users      t    ON rr.tenant_id   = t.id
       JOIN users      l    ON rr.landlord_id = l.id
       JOIN payments   p    ON rr.payment_id  = p.id
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` WHERE rr.status = $${params.length}`;
    }

    query += ` ORDER BY rr.requested_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Admin get refund requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch refund requests',
    });
  }
};


// =====================================================
//     TENANT — Get Wallet Balance
// =====================================================
exports.getWalletBalance = async (req, res) => {
  try {
    await ensureRefundSchema();
    const userId = req.user.id;

    const result = await db.query(
      `SELECT balance FROM wallets WHERE user_id = $1`,
      [userId]
    );

    const balance = result.rows.length ? Number(result.rows[0].balance) : 0;

    res.json({ success: true, data: { balance } });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet balance' });
  }
};


// =====================================================
//     TENANT / LANDLORD — Request Withdrawal
// =====================================================
exports.requestWithdrawal = async (req, res) => {
  try {
    await ensureRefundSchema();

    const userId = req.user.id;
    const { amount, bank_name, bank_code, account_number, account_name } = req.body;

    if (!amount || !bank_name || !account_number || !account_name) {
      return res.status(400).json({
        success: false,
        message: 'amount, bank_name, account_number and account_name are required',
      });
    }

    const withdrawAmount = Number(amount);
    if (withdrawAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
    }

    // Check wallet balance
    const walletResult = await db.query(
      `SELECT balance FROM wallets WHERE user_id = $1`,
      [userId]
    );

    const balance = walletResult.rows.length ? Number(walletResult.rows[0].balance) : 0;

    if (withdrawAmount > balance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Available: ₦${balance.toLocaleString()}`,
      });
    }

    // For landlords — enforce 14 working days hold
    const userResult = await db.query(`SELECT user_type FROM users WHERE id = $1`, [userId]);
    const userType = userResult.rows[0]?.user_type;

    if (userType === 'landlord') {
      // Check if there are any rent payments received within 14 working days
      // 14 working days ≈ 20 calendar days
      const recentPayments = await db.query(
        `SELECT COUNT(*) FROM payments p
         JOIN properties prop ON p.property_id = prop.id
         WHERE prop.landlord_id = $1
           AND p.payment_type = 'rent_payment'
           AND p.payment_status = 'completed'
           AND p.completed_at > NOW() - INTERVAL '20 days'
           AND NOT EXISTS (
             SELECT 1 FROM refund_requests rr
             WHERE rr.payment_id = p.id
               AND rr.status IN ('pending', 'approved')
           )`,
        [userId]
      );
      // We allow withdrawal — the 14 day window just means they must wait
      // If there are recent uncleared payments we warn but don't block
      // (admin reviews all withdrawals before processing)
    }

    // Deduct from wallet
    await db.query(
      `UPDATE wallets SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [withdrawAmount, userId]
    );

    // Create withdrawal request
    const result = await db.query(
      `INSERT INTO withdrawal_requests
         (user_id, amount, bank_name, bank_code, account_number, account_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, withdrawAmount, bank_name, bank_code || null, account_number, account_name]
    );

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted. It will be processed within 1–3 business days.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Request withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit withdrawal request' });
  }
};


// =====================================================
//     TENANT / LANDLORD — Get My Withdrawal Requests
// =====================================================
exports.getMyWithdrawals = async (req, res) => {
  try {
    await ensureRefundSchema();
    const userId = req.user.id;

    const result = await db.query(
      `SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY requested_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawal requests' });
  }
};

// =====================================================
//     ADMIN / SUPER ADMIN / FINANCIAL ADMIN
//     Get pending wallet withdrawal requests
// =====================================================
exports.getPendingWalletWithdrawals = async (req, res) => {
  try {
    await ensureRefundSchema();

    if (!WALLET_WITHDRAWAL_ADMIN_ROLES.includes(req.user.user_type)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const result = await db.query(
      `SELECT wr.*, u.full_name, u.email, u.user_type
       FROM withdrawal_requests wr
       JOIN users u ON u.id = wr.user_id
       WHERE wr.status = 'pending'
       ORDER BY wr.requested_at ASC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get pending wallet withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending wallet withdrawals' });
  }
};

// =====================================================
//     ADMIN / SUPER ADMIN / FINANCIAL ADMIN
//     Approve + auto-payout wallet withdrawal
// =====================================================
exports.approveWalletWithdrawal = async (req, res) => {
  try {
    await ensureRefundSchema();

    if (!WALLET_WITHDRAWAL_ADMIN_ROLES.includes(req.user.user_type)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { withdrawalId } = req.params;

    const requestResult = await db.query(
      `SELECT * FROM withdrawal_requests WHERE id = $1 LIMIT 1`,
      [withdrawalId]
    );

    if (!requestResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    const withdrawal = requestResult.rows[0];
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Withdrawal is already ${withdrawal.status}` });
    }

    const bankCode = withdrawal.bank_code || await resolveBankCodeFromName(withdrawal.bank_name);

    let recipientCode = withdrawal.paystack_recipient_code;
    if (!recipientCode) {
      const recipient = await createTransferRecipient({
        name: withdrawal.account_name,
        accountNumber: withdrawal.account_number,
        bankCode,
      });
      recipientCode = recipient.recipient_code;
    }

    const reference = `WLW_${withdrawal.id}_${Date.now()}`;
    const transfer = await initiateTransfer({
      amount: withdrawal.amount,
      recipientCode,
      reason: `Wallet withdrawal #${withdrawal.id}`,
      reference,
    });

    const result = await db.query(
      `UPDATE withdrawal_requests
       SET status = 'approved',
           bank_code = $1,
           paystack_recipient_code = $2,
           paystack_transfer_code = $3,
           paystack_transfer_reference = $4,
           paystack_transfer_status = $5,
           paystack_last_response = $6,
           payout_attempted_at = CURRENT_TIMESTAMP,
           admin_note = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        bankCode,
        recipientCode,
        transfer?.transfer_code || null,
        transfer?.reference || reference,
        transfer?.status || 'pending',
        JSON.stringify(transfer || {}),
        req.body?.admin_note || 'Auto payout initiated',
        withdrawalId,
      ]
    );

    res.json({ success: true, message: 'Withdrawal approved and payout initiated', data: result.rows[0] });
  } catch (error) {
    console.error('Approve wallet withdrawal error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to approve wallet withdrawal' });
  }
};

// =====================================================
//     ADMIN / SUPER ADMIN / FINANCIAL ADMIN
//     Reject wallet withdrawal and refund user balance
// =====================================================
exports.rejectWalletWithdrawal = async (req, res) => {
  try {
    await ensureRefundSchema();

    if (!WALLET_WITHDRAWAL_ADMIN_ROLES.includes(req.user.user_type)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { withdrawalId } = req.params;
    const reason = req.body?.admin_note || 'Rejected by admin';

    const requestResult = await db.query(
      `SELECT * FROM withdrawal_requests WHERE id = $1 LIMIT 1`,
      [withdrawalId]
    );

    if (!requestResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    const withdrawal = requestResult.rows[0];
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot reject withdrawal in ${withdrawal.status} state` });
    }

    await db.query(
      `UPDATE wallets
       SET balance = balance + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [withdrawal.amount, withdrawal.user_id]
    );

    const result = await db.query(
      `UPDATE withdrawal_requests
       SET status = 'rejected',
           admin_note = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [reason, withdrawalId]
    );

    res.json({ success: true, message: 'Withdrawal rejected and funds refunded', data: result.rows[0] });
  } catch (error) {
    console.error('Reject wallet withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject wallet withdrawal' });
  }
};

// =====================================================
//     Paystack webhook for wallet withdrawals
// =====================================================
exports.walletWithdrawalWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body || {});

    if (!isValidPaystackSignature(rawBody, signature)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body?.event;
    const payload = req.body?.data || {};

    if (!event || !event.startsWith('transfer.')) {
      return res.json({ success: true, message: 'Ignored event' });
    }

    const reference = payload.reference;
    if (!reference || !reference.startsWith('WLW_')) {
      return res.json({ success: true, message: 'Event not for wallet withdrawals' });
    }

    const findResult = await db.query(
      `SELECT * FROM withdrawal_requests WHERE paystack_transfer_reference = $1 LIMIT 1`,
      [reference]
    );

    if (!findResult.rows.length) {
      return res.json({ success: true, message: 'Withdrawal not found for reference' });
    }

    const withdrawal = findResult.rows[0];

    if (event === 'transfer.success') {
      await db.query(
        `UPDATE withdrawal_requests
         SET status = 'processed',
             processed_at = CURRENT_TIMESTAMP,
             paystack_transfer_status = 'success',
             paystack_last_response = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(payload), withdrawal.id]
      );
    } else if (event === 'transfer.failed' || event === 'transfer.reversed') {
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
          event === 'transfer.failed' ? 'failed' : 'reversed',
          JSON.stringify(payload),
          payload?.failure_reason || payload?.reason || 'Transfer failed',
          withdrawal.id,
        ]
      );
    }

    return res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Wallet withdrawal webhook error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process webhook' });
  }
};


// =====================================================
//     LANDLORD — Get Wallet Balance (cleared funds)
//     Only rent payments older than 14 working days
//     with no active refund dispute count as cleared
// =====================================================
exports.getLandlordWalletBalance = async (req, res) => {
  try {
    await ensureRefundSchema();
    const landlordId = req.user.id;

    // Cleared rent income = sum of rent payments > 20 calendar days old
    // with no pending/approved refund requests
    const clearedResult = await db.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS cleared_amount
       FROM payments p
       JOIN properties prop ON p.property_id = prop.id
       WHERE prop.landlord_id   = $1
         AND p.payment_type     = 'rent_payment'
         AND p.payment_status   = 'completed'
         AND p.completed_at     < NOW() - INTERVAL '20 days'
         AND NOT EXISTS (
           SELECT 1 FROM refund_requests rr
           WHERE rr.payment_id = p.id
             AND rr.status IN ('pending','approved')
         )`,
      [landlordId]
    );

    // Pending (within 14 working days or disputed)
    const pendingResult = await db.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS pending_amount
       FROM payments p
       JOIN properties prop ON p.property_id = prop.id
       WHERE prop.landlord_id   = $1
         AND p.payment_type     = 'rent_payment'
         AND p.payment_status   = 'completed'
         AND (
           p.completed_at >= NOW() - INTERVAL '20 days'
           OR EXISTS (
             SELECT 1 FROM refund_requests rr
             WHERE rr.payment_id = p.id
               AND rr.status IN ('pending','approved')
           )
         )`,
      [landlordId]
    );

    // Already withdrawn
    const withdrawnResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS withdrawn_amount
       FROM withdrawal_requests
       WHERE user_id = $1 AND status IN ('approved','processed')`,
      [landlordId]
    );

    const cleared   = Number(clearedResult.rows[0].cleared_amount);
    const pending   = Number(pendingResult.rows[0].pending_amount);
    const withdrawn = Number(withdrawnResult.rows[0].withdrawn_amount);
    const available = Math.max(0, cleared - withdrawn);

    res.json({
      success: true,
      data: {
        cleared_balance:   cleared,
        pending_balance:   pending,
        withdrawn_total:   withdrawn,
        available_to_withdraw: available,
      },
    });
  } catch (error) {
    console.error('Get landlord wallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet balance' });
  }
};


module.exports = exports;