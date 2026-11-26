const db = require('../config/middleware/database');
const {
  isReceiptEligiblePaymentStatus,
  isCompletedPayoutStatus,
  isFailedOrReversedPayoutStatus,
  loadReceiptContext,
  buildReceiptData,
  loadSavingsContributionContext,
  buildSavingsContributionReceiptData,
  loadWalletTransactionContext,
  buildWalletTransactionReceiptData,
  loadUserPayoutContext,
  buildUserPayoutReceiptData,
  loadAgentPayoutContext,
  buildAgentPayoutReceiptData,
  loadAdminPayoutContext,
  buildAdminPayoutReceiptData,
  loadRefundContext,
  buildRefundReceiptData,
  loadTransportationReceiptContext,
  buildTransportationReceiptData,
  loadFumigationReceiptContext,
  buildFumigationReceiptData,
  loadEvidenceReceiptContext,
  buildEvidenceReceiptData,
} = require('../config/utils/paymentReceipt');
const {
  authorizePaymentReceipt,
  authorizeSavingsReceipt,
  authorizeWalletTransactionReceipt,
  authorizeUserPayoutReceipt,
  authorizeAgentPayoutReceipt,
  authorizeAdminPayoutReceipt,
  authorizeRefundReceipt,
  authorizeTransportationReceipt,
  authorizeFumigationReceipt,
  authorizeEvidenceReceipt,
  logReceiptAccessDenial,
} = require('../config/utils/receiptAuth');
const { renderReceiptPdf } = require('../config/utils/receiptPdfRenderer');
const { paymentReceiptNumber } = require('../config/utils/referenceGenerator');

const DOCUMENT_HANDLERS = {
  payment: {
    load: loadReceiptContext,
    authorize: authorizePaymentReceipt,
    build: buildReceiptData,
    checkStatus: (ctx) => {
      if (!isReceiptEligiblePaymentStatus(ctx.payment.payment_status)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'RECEIPT_NOT_AVAILABLE_FOR_STATUS',
          message: `Official payment receipt is only available for completed payments (current status: ${ctx.payment.payment_status}).`,
        };
      }
      return { ok: true };
    },
    filename: (id) => `receipt-${String(id).padStart(6, '0')}.pdf`,
  },
  savings: {
    load: loadSavingsContributionContext,
    authorize: authorizeSavingsReceipt,
    build: buildSavingsContributionReceiptData,
    checkStatus: () => ({ ok: true }),
    filename: (id) => `savings-receipt-${String(id).padStart(6, '0')}.pdf`,
  },
  'wallet-transaction': {
    load: loadWalletTransactionContext,
    authorize: authorizeWalletTransactionReceipt,
    build: buildWalletTransactionReceiptData,
    checkStatus: () => ({ ok: true }),
    filename: (id) => `wallet-record-${String(id).padStart(6, '0')}.pdf`,
  },
  'user-payout': {
    load: loadUserPayoutContext,
    authorize: authorizeUserPayoutReceipt,
    build: buildUserPayoutReceiptData,
    checkStatus: (ctx) => {
      const st = ctx.withdrawal.paystack_transfer_status === 'reversed'
        ? 'reversed'
        : ctx.withdrawal.paystack_transfer_status === 'failed'
          ? 'failed'
          : ctx.withdrawal.status;
      if (!isCompletedPayoutStatus(st) && !isFailedOrReversedPayoutStatus(st)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'PAYOUT_RECEIPT_NOT_READY',
          message: `Payout receipt is available once the withdrawal is processed, failed, or reversed (current status: ${st}).`,
        };
      }
      return { ok: true };
    },
    filename: (id) => `payout-wdr-${String(id).padStart(6, '0')}.pdf`,
  },
  'agent-payout': {
    load: loadAgentPayoutContext,
    authorize: authorizeAgentPayoutReceipt,
    build: buildAgentPayoutReceiptData,
    checkStatus: (ctx) => {
      const st = ctx.withdrawal.paystack_transfer_status === 'reversed'
        ? 'reversed'
        : ctx.withdrawal.paystack_transfer_status === 'failed'
          ? 'failed'
          : ctx.withdrawal.status;
      if (!isCompletedPayoutStatus(st) && !isFailedOrReversedPayoutStatus(st)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'PAYOUT_RECEIPT_NOT_READY',
          message: `Agent payout receipt is available once the withdrawal is completed, failed, or reversed (current status: ${st}).`,
        };
      }
      return { ok: true };
    },
    filename: (id) => `payout-ag-${String(id).padStart(6, '0')}.pdf`,
  },
  'admin-payout': {
    load: loadAdminPayoutContext,
    authorize: authorizeAdminPayoutReceipt,
    build: buildAdminPayoutReceiptData,
    checkStatus: (ctx) => {
      const st = ctx.withdrawal.paystack_transfer_status === 'reversed'
        ? 'reversed'
        : ctx.withdrawal.paystack_transfer_status === 'failed'
          ? 'failed'
          : ctx.withdrawal.status;
      if (!isCompletedPayoutStatus(st) && !isFailedOrReversedPayoutStatus(st)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'PAYOUT_RECEIPT_NOT_READY',
          message: `Administrator payout receipt is available once the withdrawal is processed, failed, or reversed (current status: ${st}).`,
        };
      }
      return { ok: true };
    },
    filename: (id) => `payout-saw-${String(id).padStart(6, '0')}.pdf`,
  },
  refund: {
    load: loadRefundContext,
    authorize: authorizeRefundReceipt,
    build: buildRefundReceiptData,
    checkStatus: (ctx) => {
      const st = String(ctx.refund.status || '').toLowerCase();
      if (!['approved', 'refunded', 'rejected'].includes(st)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'REFUND_CONFIRMATION_NOT_READY',
          message: `Refund confirmation is available once the refund has been reviewed (current status: ${st || 'pending'}).`,
        };
      }
      return { ok: true };
    },
    filename: (id) => `refund-confirmation-${String(id).padStart(6, '0')}.pdf`,
  },
  transportation: {
    load: loadTransportationReceiptContext,
    authorize: authorizeTransportationReceipt,
    build: buildTransportationReceiptData,
    checkStatus: (ctx) => {
      if (!isReceiptEligiblePaymentStatus(ctx.booking.payment_status)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'RECEIPT_NOT_AVAILABLE_FOR_STATUS',
          message: `Transportation booking receipt is only available for completed payments (current status: ${ctx.booking.payment_status}).`,
        };
      }
      return { ok: true };
    },
    filename: (id) => `transportation-receipt-${String(id).padStart(6, '0')}.pdf`,
  },
  fumigation: {
    load: loadFumigationReceiptContext,
    authorize: authorizeFumigationReceipt,
    build: buildFumigationReceiptData,
    checkStatus: (ctx) => {
      const st = ctx.booking.payment_status || ctx.booking.fp_status;
      if (!isReceiptEligiblePaymentStatus(st)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'RECEIPT_NOT_AVAILABLE_FOR_STATUS',
          message: `Fumigation service receipt is only available for completed payments (current status: ${st || 'pending'}).`,
        };
      }
      return { ok: true };
    },
    filename: (id) => `fumigation-receipt-${String(id).padStart(6, '0')}.pdf`,
  },
  evidence: {
    load: loadEvidenceReceiptContext,
    authorize: authorizeEvidenceReceipt,
    build: buildEvidenceReceiptData,
    checkStatus: (ctx) => {
      if (!isReceiptEligiblePaymentStatus(ctx.evidencePayment.payment_status)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'RECEIPT_NOT_AVAILABLE_FOR_STATUS',
          message: `Evidence verification receipt is only available for completed payments (current status: ${ctx.evidencePayment.payment_status}).`,
        };
      }
      return { ok: true };
    },
    filename: (id) => `evidence-receipt-${String(id).padStart(6, '0')}.pdf`,
  },
};

const resolveCanonicalDocument = async (req, res, kind, rawId) => {
  const handler = DOCUMENT_HANDLERS[kind];
  if (!handler) {
    res.status(400).json({ success: false, message: 'Unsupported receipt document type' });
    return null;
  }

  const recordId = Number.parseInt(rawId, 10);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid document id' });
    return null;
  }

  const ctx = await handler.load(recordId);
  if (!ctx) {
    res.status(404).json({ success: false, message: 'Financial record not found' });
    return null;
  }

  const authResult = await handler.authorize(req.user, ctx);
  if (!authResult.allowed) {
    logReceiptAccessDenial(req, { kind, resourceId: recordId, reason: authResult.reason });
    res.status(403).json({ success: false, message: 'Access denied' });
    return null;
  }

  const eligibility = handler.checkStatus(ctx);
  if (!eligibility.ok) {
    res.status(eligibility.statusCode || 409).json({
      success: false,
      code: eligibility.code,
      message: eligibility.message,
    });
    return null;
  }

  const receipt = handler.build(ctx, { viewerPerspective: authResult.perspective });
  return { receipt, handler, recordId };
};

exports.getDocumentJson = async (req, res) => {
  try {
    const resolved = await resolveCanonicalDocument(req, res, req.params.kind, req.params.id);
    if (!resolved) return;
    return res.json({ success: true, data: resolved.receipt });
  } catch (error) {
    req.logger?.error?.('Receipt document JSON error:', error);
    return res.status(500).json({ success: false, message: 'Failed to build receipt document' });
  }
};

exports.getDocumentPdf = async (req, res) => {
  try {
    const resolved = await resolveCanonicalDocument(req, res, req.params.kind, req.params.id);
    if (!resolved) return;
    return renderReceiptPdf(resolved.receipt, res, {
      filename: resolved.handler.filename(resolved.recordId),
    });
  } catch (error) {
    req.logger?.error?.('Receipt document PDF error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to generate receipt PDF' });
    }
  }
};

// Backwards-compatible wrappers for existing /receipt/:paymentId, /receipt-pdf/:paymentId, /savings-receipt.pdf
exports.getPaymentReceiptJson = async (req, res) => {
  req.params.kind = 'payment';
  req.params.id = req.params.paymentId;
  return exports.getDocumentJson(req, res);
};

exports.getPaymentReceiptPdf = async (req, res) => {
  req.params.kind = 'payment';
  req.params.id = req.params.paymentId;
  return exports.getDocumentPdf(req, res);
};

exports.getSavingsReceiptPdf = async (req, res) => {
  req.params.kind = 'savings';
  req.params.id = req.query.contribution_id;
  return exports.getDocumentPdf(req, res);
};

// Landlord rent-received confirmation records list (strictly scoped to landlord's own properties)
exports.getLandlordRentReceipts = async (req, res) => {
  try {
    const landlordId = Number(req.user.id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const result = await db.query(
      `SELECT p.id, p.amount, p.currency, p.payment_method, p.payment_channel,
              p.payment_status, p.transaction_reference, p.created_at, p.completed_at,
              prop.id AS property_id, prop.title AS property_title,
              tu.full_name AS tenant_name,
              wt.metadata AS wallet_metadata
       FROM payments p
       JOIN properties prop ON prop.id = p.property_id
       LEFT JOIN users tu ON tu.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT metadata FROM wallet_transactions
         WHERE payment_id = p.id AND source = 'rent_payment' AND type = 'credit'
         ORDER BY id ASC LIMIT 1
       ) wt ON true
       WHERE prop.landlord_id = $1
         AND p.payment_type = 'rent_payment'
         AND p.payment_status IN ('completed', 'refunded')
       ORDER BY COALESCE(p.completed_at, p.created_at) DESC, p.id DESC
       LIMIT $2`,
      [landlordId, limit]
    );

    const rows = result.rows.map((row) => {
      const grossAmount = Number(row.amount || 0);
      const platformFee = Number(row.wallet_metadata?.platform_fee || 0);
      return {
        id: row.id,
        receipt_number: paymentReceiptNumber(row.id),
        property_id: row.property_id,
        property_title: row.property_title || '',
        tenant_name: row.tenant_name || '',
        gross_amount: grossAmount,
        platform_fee: platformFee,
        net_amount: Math.max(0, grossAmount - platformFee),
        currency: row.currency || 'NGN',
        payment_method: row.payment_method,
        payment_channel: row.payment_channel,
        payment_status: row.payment_status,
        transaction_reference: row.transaction_reference,
        paid_at: row.completed_at || row.created_at,
      };
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    req.logger?.error?.('Get landlord rent receipts error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load landlord rent records' });
  }
};

exports.DOCUMENT_HANDLERS = DOCUMENT_HANDLERS;
