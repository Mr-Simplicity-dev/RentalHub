const axios = require('axios');
const db = require('../config/middleware/database');
const { getFrontendUrl } = require('../config/utils/frontendUrl');
const verificationService =
  require('../services/evidenceVerification.service');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const EVIDENCE_VERIFICATION_FEE_NGN = 20000;
let evidenceVerificationSchemaReady = false;

const resolveFrontendUrl = (req) => getFrontendUrl(req.get('origin'));

const ensureEvidenceVerificationSchema = async () => {
  if (evidenceVerificationSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS evidence_verification_payments (
      id SERIAL PRIMARY KEY,
      dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
      payer_email VARCHAR(255) NOT NULL,
      payer_name VARCHAR(255),
      amount DECIMAL(12, 2) NOT NULL DEFAULT 20000,
      currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
      payment_method VARCHAR(50) NOT NULL DEFAULT 'paystack',
      transaction_reference VARCHAR(255) NOT NULL UNIQUE,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      gateway_response JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_verification_payments_dispute
      ON evidence_verification_payments(dispute_id);

    CREATE INDEX IF NOT EXISTS idx_evidence_verification_payments_reference
      ON evidence_verification_payments(transaction_reference);
  `);

  evidenceVerificationSchemaReady = true;
};

const getDispute = async (disputeId) => {
  const result = await db.query(
    'SELECT id FROM disputes WHERE id = $1',
    [disputeId]
  );

  return result.rows[0] || null;
};

const getEvidenceVerificationPayment = async (disputeId, reference) => {
  const result = await db.query(
    `SELECT *
     FROM evidence_verification_payments
     WHERE dispute_id = $1
       AND transaction_reference = $2
     LIMIT 1`,
    [disputeId, reference]
  );

  return result.rows[0] || null;
};

exports.initializeVerificationPayment = async (req, res) => {
  try {
    await ensureEvidenceVerificationSchema();

    const { disputeId } = req.params;
    const payerEmail = req.body?.payer_email?.trim().toLowerCase();
    const payerName = req.body?.payer_name?.trim() || null;

    if (!disputeId) {
      return res.status(400).json({
        success: false,
        message: 'Dispute ID is required',
      });
    }

    if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required',
      });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment service is not configured',
      });
    }

    const dispute = await getDispute(disputeId);

    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found',
      });
    }

    const reference = `EVID_${disputeId}_${Date.now()}`;

    await db.query(
      `INSERT INTO evidence_verification_payments (
         dispute_id,
         payer_email,
         payer_name,
         amount,
         transaction_reference
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        disputeId,
        payerEmail,
        payerName,
        EVIDENCE_VERIFICATION_FEE_NGN,
        reference,
      ]
    );

    const callbackUrl =
      `${resolveFrontendUrl(req)}/verify-case?dispute=${encodeURIComponent(disputeId)}`;

    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: payerEmail,
        amount: EVIDENCE_VERIFICATION_FEE_NGN * 100,
        reference,
        callback_url: callbackUrl,
        metadata: {
          payment_type: 'evidence_verification',
          dispute_id: Number(disputeId),
          payer_name: payerName,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({
      success: true,
      message: 'Evidence verification payment initialized',
      data: {
        dispute_id: Number(disputeId),
        amount: EVIDENCE_VERIFICATION_FEE_NGN,
        reference,
        authorization_url: paystackResponse.data.data.authorization_url,
        access_code: paystackResponse.data.data.access_code,
      },
    });
  } catch (error) {
    console.error('Evidence verification payment error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to initialize verification payment',
    });
  }
};

exports.verifyDispute = async (req, res) => {
  try {
    await ensureEvidenceVerificationSchema();

    const { disputeId } = req.params;
    const reference =
      req.query.reference ||
      req.query.trxref ||
      req.query.verify_ref;

    if (!reference) {
      return res.status(402).json({
        success: false,
        payment_required: true,
        message: 'Payment of N20,000 is required before verification',
      });
    }

    const dispute = await getDispute(disputeId);

    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found',
      });
    }

    const payment = await getEvidenceVerificationPayment(disputeId, reference);

    if (!payment) {
      return res.status(403).json({
        success: false,
        message: 'Valid verification payment not found for this dispute',
      });
    }

    if (payment.payment_status !== 'completed') {
      if (!PAYSTACK_SECRET_KEY) {
        return res.status(500).json({
          success: false,
          message: 'Payment service is not configured',
        });
      }

      const paystackResponse = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          },
        }
      );

      const transaction = paystackResponse.data.data;

      if (transaction.status !== 'success') {
        return res.status(402).json({
          success: false,
          payment_required: true,
          message: 'Verification payment is not completed yet',
        });
      }

      const amountPaid = Number(transaction.amount || 0) / 100;

      if (amountPaid < EVIDENCE_VERIFICATION_FEE_NGN) {
        return res.status(402).json({
          success: false,
          payment_required: true,
          message: 'Verification payment amount is insufficient',
        });
      }

      await db.query(
        `UPDATE evidence_verification_payments
         SET payment_status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             gateway_response = $1
         WHERE transaction_reference = $2`,
        [JSON.stringify(transaction), reference]
      );
    }

    const result =
      await verificationService.verifyDisputeEvidence(disputeId);

    res.json({
      success: true,
      verification: result,
    });
  } catch (error) {
    console.error('Verification error:', error);

    res.status(500).json({
      success: false,
      message: 'Verification failed',
    });
  }
};
