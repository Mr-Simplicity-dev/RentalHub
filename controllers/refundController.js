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
      reason              VARCHAR(100)  NOT NULL,
      details             TEXT,
      status              VARCHAR(20)   NOT NULL DEFAULT 'pending',
        -- pending | approved | rejected | refunded
      landlord_note       TEXT,
      requested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at         TIMESTAMP,
      refunded_at         TIMESTAMP,
      created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT chk_refund_status
        CHECK (status IN ('pending','approved','rejected','refunded'))
    );

    CREATE INDEX IF NOT EXISTS idx_refund_requests_tenant
      ON refund_requests(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_landlord
      ON refund_requests(landlord_id);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_payment
      ON refund_requests(payment_id);
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
//     LANDLORD — Approve Refund Request
// =====================================================
exports.approveRefundRequest = async (req, res) => {
  try {
    await ensureRefundSchema();

    const landlordId = req.user.id;
    const { refundId } = req.params;
    const { landlord_note } = req.body;

    // Confirm this refund belongs to the landlord and is still pending
    const refundResult = await db.query(
      `SELECT rr.*, p.transaction_reference
       FROM refund_requests rr
       JOIN payments p ON rr.payment_id = p.id
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

    // Mark as approved
    await db.query(
      `UPDATE refund_requests
       SET status        = 'approved',
           landlord_note = $1,
           reviewed_at   = CURRENT_TIMESTAMP,
           updated_at    = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [landlord_note || null, refundId]
    );

    // Attempt Paystack refund if there is a transaction reference
    if (refund.transaction_reference && PAYSTACK_SECRET_KEY) {
      try {
        await axios.post(
          `${PAYSTACK_BASE_URL}/refund`,
          {
            transaction: refund.transaction_reference,
            amount: Math.round(Number(refund.amount) * 100), // kobo
          },
          {
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        // Mark as refunded immediately if Paystack accepted it
        await db.query(
          `UPDATE refund_requests
           SET status      = 'refunded',
               refunded_at = CURRENT_TIMESTAMP,
               updated_at  = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [refundId]
        );

        // Mark the original payment as refunded
        await db.query(
          `UPDATE payments SET payment_status = 'refunded' WHERE id = $1`,
          [refund.payment_id]
        );

        return res.json({
          success: true,
          message: 'Refund approved and processed via Paystack.',
          data: { refund_id: refundId, status: 'refunded' },
        });
      } catch (paystackErr) {
        // Paystack refund failed — approved but needs manual processing
        console.error('Paystack refund error:', paystackErr.response?.data || paystackErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Refund request approved. Please process the payout manually.',
      data: { refund_id: refundId, status: 'approved' },
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


module.exports = exports;