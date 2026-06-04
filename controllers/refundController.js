// =====================================================
//              REFUND CONTROLLER
// =====================================================
// Flow:
//   1. Tenant submits a refund request on a completed rent_payment
//   2. Landlord sees pending requests and approves or rejects
//   3. On approval the payment is marked refunded (manual payout handled offline or via Paystack)
//   4. Admin can view all refund requests across the platform
//   5. Tenant requests expired-rent grace, hierarchy admin/support enables it,
//      then landlord approves or rejects the tenant-requested duration
// =====================================================

const db = require('../config/middleware/database');
const axios = require('axios');
const {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCodeFromName,
  isValidPaystackSignature,
} = require('../services/paystackTransfer.service');
const {
  getLandlordPropertyFeeStatus,
} = require('../config/utils/landlordPropertyFee');
const { sendEmail } = require('../config/utils/mailer');
const { getFrontendUrl } = require('../config/utils/frontendUrl');
const { formatDate } = require('../config/utils/helpers');
const { createNotification } = require('../config/utils/notificationService');
const {
  ensureWalletLedgerSchema,
  creditWallet,
  clearMaturedLandlordRentCredits,
  reverseLandlordRentCreditForPayment,
  getWalletBalance,
  getWalletCreditSummaryForUser,
  getLandlordRentDeductionTotal,
} = require('../services/walletLedgerService');

const WALLET_WITHDRAWAL_ADMIN_ROLES = ['admin', 'super_admin', 'financial_admin', 'super_financial_admin'];
const TENANCY_ADMIN_ROLES = new Set([
  'admin',
  'lga_admin',
  'lga_support_admin',
  'state_admin',
  'state_support_admin',
  'super_support_admin',
  'super_admin',
]);
const TENANCY_LGA_ADMIN_ROLES = new Set(['admin', 'lga_admin', 'lga_support_admin']);
const TENANCY_STATE_ADMIN_ROLES = new Set(['state_admin', 'state_support_admin']);
const TENANCY_SUPER_ADMIN_ROLES = new Set(['super_admin', 'super_support_admin']);
const TENANCY_HIERARCHY_LABEL = 'LGA admin/support, state admin/support, or super admin';
const EARLY_EXIT_REASONS = new Set([
  'relocation_transfer_migration',
  'transfer_relocation',
  'moved_out_early_agreement',
]);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL   = 'https://api.paystack.co';
const FRONTEND_URL = getFrontendUrl();

const tenancyDurationSql = `
  CASE
    WHEN prop.payment_frequency = 'monthly' THEN INTERVAL '1 month'
    ELSE INTERVAL '1 year'
  END
`;

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const addDurationToDate = (baseDate, months = 0, days = 0) => {
  const date = new Date(baseDate);
  if (Number(months) > 0) {
    date.setMonth(date.getMonth() + Number(months));
  }
  if (Number(days) > 0) {
    date.setDate(date.getDate() + Number(days));
  }
  return date;
};

const getDurationWeight = (months = 0, days = 0) =>
  (Number(months || 0) * 31) + Number(days || 0);

const formatDurationParts = (days = 0, months = 0) => {
  const parts = [];
  if (Number(months) > 0) {
    parts.push(`${Number(months)} ${Number(months) === 1 ? 'month' : 'months'}`);
  }
  if (Number(days) > 0) {
    parts.push(`${Number(days)} ${Number(days) === 1 ? 'day' : 'days'}`);
  }
  return parts.length ? parts.join(' and ') : 'the requested time';
};

const sendEmailSafely = async (payload) => {
  try {
    await sendEmail(payload);
  } catch (error) {
    console.error('Tenancy workflow email error:', error.message);
  }
};

// =====================================================
//     ADMIN/SUPPORT - Enable or reject relocation refund
// =====================================================
exports.adminReviewRelocationRefund = async (req, res) => {
  try {
    await ensureRefundSchema();

    const role = getRequesterRole(req.user);
    if (!isTenancyAdminRole(role)) {
      return res.status(403).json({
        success: false,
        message: `${TENANCY_HIERARCHY_LABEL} access is required`,
      });
    }

    const { refundId } = req.params;
    const { action, admin_note } = req.body;
    const nextAction = String(action || '').trim().toLowerCase();

    if (!['enable', 'reject'].includes(nextAction)) {
      return res.status(400).json({
        success: false,
        message: 'action must be enable or reject',
      });
    }

    const refundResult = await db.query(
      `SELECT
          rr.*,
          prop.title AS property_title,
          prop.lga_name,
          st.state_name,
          t.full_name AS tenant_name,
          t.email AS tenant_email,
          l.full_name AS landlord_name,
          l.email AS landlord_email
       FROM refund_requests rr
       JOIN properties prop ON prop.id = rr.property_id
       LEFT JOIN states st ON st.id = prop.state_id
       JOIN users t ON t.id = rr.tenant_id
       JOIN users l ON l.id = rr.landlord_id
       WHERE rr.id = $1
         AND rr.request_category = 'early_exit_refund'
         AND rr.status = 'pending'`,
      [refundId]
    );

    if (!refundResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Pending relocation refund request not found',
      });
    }

    const refund = refundResult.rows[0];
    const scopeError = getAdminScopeError(req.user, refund);
    if (scopeError) {
      return res.status(403).json({ success: false, message: scopeError });
    }

    const result = await db.query(
      nextAction === 'enable'
        ? `UPDATE refund_requests
           SET feature_enabled = TRUE,
               feature_enabled_by = $1,
               feature_enabled_at = CURRENT_TIMESTAMP,
               admin_note = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`
        : `UPDATE refund_requests
           SET status = 'rejected',
               admin_note = $2,
               reviewed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`,
      [req.user.id, admin_note || null, refundId]
    );

    const propertyTitle = refund.property_title || 'the rented property';
    if (nextAction === 'enable') {
      await createNotificationSafely(
        refund.landlord_id,
        'relocation_refund_enabled',
        'Relocation refund enabled',
        `${TENANCY_HIERARCHY_LABEL} enabled a relocation refund request for ${propertyTitle}. Please review it from your dashboard.`,
        '/dashboard'
      );
      await createNotificationSafely(
        refund.tenant_id,
        'relocation_refund_enabled',
        'Relocation refund enabled',
        `Your relocation refund request for ${propertyTitle} has been enabled for landlord review.`,
        '/dashboard'
      );

      await Promise.all([
        sendEmailSafely({
          to: refund.landlord_email,
          subject: 'Relocation refund request enabled',
          html: `
            <div style="font-family: sans-serif; line-height: 1.6;">
              <h2>Relocation Refund Enabled</h2>
              <p>Hello ${escapeHtml(refund.landlord_name || 'there')},</p>
              <p>${escapeHtml(TENANCY_HIERARCHY_LABEL)} enabled a tenant relocation refund request for <strong>${escapeHtml(propertyTitle)}</strong>.</p>
              <p>Please open your dashboard to approve a full refund, partial months, custom amount, or reject with a reason.</p>
              <p><a href="${FRONTEND_URL}/dashboard" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">Open Dashboard</a></p>
            </div>
          `,
        }),
        sendEmailSafely({
          to: refund.tenant_email,
          subject: 'Your relocation refund request is enabled',
          html: `
            <div style="font-family: sans-serif; line-height: 1.6;">
              <h2>Relocation Refund Enabled</h2>
              <p>Hello ${escapeHtml(refund.tenant_name || 'there')},</p>
              <p>Your relocation refund request for <strong>${escapeHtml(propertyTitle)}</strong> has been enabled for landlord review.</p>
              <p><a href="${FRONTEND_URL}/dashboard" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">Open Dashboard</a></p>
            </div>
          `,
        }),
      ]);
    } else {
      await createNotificationSafely(
        refund.tenant_id,
        'relocation_refund_rejected',
        'Relocation refund not enabled',
        `${TENANCY_HIERARCHY_LABEL} did not enable your relocation refund request for ${propertyTitle}.`,
        '/dashboard'
      );
    }

    return res.json({
      success: true,
      message: nextAction === 'enable'
        ? 'Relocation refund enabled for landlord review'
        : 'Relocation refund request rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Admin review relocation refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review relocation refund request',
    });
  }
};

const createNotificationSafely = async (userId, type, title, message, link = '/dashboard') => {
  if (!userId) return;
  try {
    await createNotification(userId, type, title, message, link);
  } catch (error) {
    console.error('Tenancy workflow notification error:', error.message);
  }
};

const getRequesterRole = (user) => normalizeText(user?.user_type || user?.userType);

const isTenancyAdminRole = (role) => TENANCY_ADMIN_ROLES.has(normalizeText(role));

const getAdminScopeError = (admin, record) => {
  const role = getRequesterRole(admin);
  if (!isTenancyAdminRole(role)) {
    return `${TENANCY_HIERARCHY_LABEL} access is required`;
  }

  if (TENANCY_SUPER_ADMIN_ROLES.has(role)) {
    return null;
  }

  const assignedState = normalizeText(admin?.assigned_state);
  const assignedCity = normalizeText(admin?.assigned_city);
  const recordState = normalizeText(record?.state_name);
  const recordLga = normalizeText(record?.lga_name || record?.city);

  if (TENANCY_STATE_ADMIN_ROLES.has(role)) {
    if (!assignedState) return 'Your admin account is missing assigned_state';
    return assignedState === recordState ? null : 'This request is outside your assigned state';
  }

  if (TENANCY_LGA_ADMIN_ROLES.has(role)) {
    if (!assignedState || !assignedCity) {
      return 'Your admin account is missing assigned state or local government';
    }
    return assignedState === recordState && assignedCity === recordLga
      ? null
      : 'This request is outside your assigned local government area';
  }

  return `${TENANCY_HIERARCHY_LABEL} access is required`;
};

const adminScopeWhere = (admin, params, alias = 'prop', stateAlias = 'st') => {
  const role = getRequesterRole(admin);
  if (TENANCY_SUPER_ADMIN_ROLES.has(role)) {
    return '';
  }

  if (TENANCY_STATE_ADMIN_ROLES.has(role)) {
    params.push(admin.assigned_state);
    return ` AND LOWER(TRIM(${stateAlias}.state_name)) = LOWER(TRIM($${params.length}))`;
  }

  if (TENANCY_LGA_ADMIN_ROLES.has(role)) {
    params.push(admin.assigned_state);
    const stateParam = params.length;
    params.push(admin.assigned_city);
    const cityParam = params.length;
    return ` AND LOWER(TRIM(${stateAlias}.state_name)) = LOWER(TRIM($${stateParam}))
             AND LOWER(TRIM(COALESCE(${alias}.lga_name, ${alias}.city, ''))) = LOWER(TRIM($${cityParam}))`;
  }

  return ' AND 1 = 0';
};

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
      ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS request_category VARCHAR(40) NOT NULL DEFAULT 'standard_refund',
      ADD COLUMN IF NOT EXISTS requested_move_out_date DATE,
      ADD COLUMN IF NOT EXISTS requested_refund_months INTEGER,
      ADD COLUMN IF NOT EXISTS requested_refund_amount NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS refund_due_days INTEGER,
      ADD COLUMN IF NOT EXISTS refund_due_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS feature_enabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS feature_enabled_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS admin_note TEXT;

    CREATE INDEX IF NOT EXISTS idx_refund_requests_tenant
      ON refund_requests(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_landlord
      ON refund_requests(landlord_id);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_payment
      ON refund_requests(payment_id);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_feature_enabled
      ON refund_requests(request_category, feature_enabled, status, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_refund_requests_due_at
      ON refund_requests(refund_due_at)
      WHERE refund_due_at IS NOT NULL;

    CREATE TABLE IF NOT EXISTS tenancy_adjustment_requests (
      id SERIAL PRIMARY KEY,
      request_type VARCHAR(30) NOT NULL DEFAULT 'grace_period',
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      tenancy_expires_at TIMESTAMP,
      requested_duration_days INTEGER,
      requested_duration_months INTEGER,
      approved_duration_days INTEGER,
      approved_duration_months INTEGER,
      tenant_note TEXT,
      landlord_note TEXT,
      admin_note TEXT,
      feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      enabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      enabled_at TIMESTAMP,
      status VARCHAR(30) NOT NULL DEFAULT 'pending_admin_review',
      grace_ends_at TIMESTAMP,
      requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP,
      landlord_reviewed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_tenancy_adjustment_request_type
        CHECK (request_type IN ('grace_period')),
      CONSTRAINT chk_tenancy_adjustment_status
        CHECK (status IN (
          'pending_admin_review',
          'enabled',
          'rejected',
          'landlord_approved',
          'landlord_rejected',
          'cancelled',
          'expired'
        ))
    );

    CREATE INDEX IF NOT EXISTS idx_tenancy_adjustments_tenant
      ON tenancy_adjustment_requests(tenant_id, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tenancy_adjustments_landlord
      ON tenancy_adjustment_requests(landlord_id, status, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tenancy_adjustments_property
      ON tenancy_adjustment_requests(property_id, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tenancy_adjustments_status
      ON tenancy_adjustment_requests(status, requested_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tenancy_adjustments_one_active_grace
      ON tenancy_adjustment_requests(payment_id, tenant_id)
      WHERE request_type = 'grace_period'
        AND status IN ('pending_admin_review', 'enabled', 'landlord_approved');

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

    CREATE TABLE IF NOT EXISTS landlord_rent_deductions (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL,
      deduction_type VARCHAR(40) NOT NULL DEFAULT 'subscription',
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_landlord_rent_deduction_type
        CHECK (
          deduction_type IN (
            'subscription',
            'property_fee',
            'annual_listing_renewal',
            'monthly_maintenance'
          )
        )
    );

    ALTER TABLE landlord_rent_deductions
      DROP CONSTRAINT IF EXISTS chk_landlord_rent_deduction_type;

    ALTER TABLE landlord_rent_deductions
      ADD CONSTRAINT chk_landlord_rent_deduction_type
      CHECK (
        deduction_type IN (
          'subscription',
          'property_fee',
          'annual_listing_renewal',
          'monthly_maintenance'
        )
      );

    CREATE INDEX IF NOT EXISTS idx_landlord_rent_deductions_landlord
      ON landlord_rent_deductions(landlord_id, created_at DESC);
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
    const {
      payment_id,
      reason,
      details,
      request_category,
      requested_move_out_date,
      requested_refund_months,
      requested_refund_amount,
      refund_due_days,
    } = req.body;

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
    const isEarlyExitRefund =
      request_category === 'early_exit_refund' ||
      EARLY_EXIT_REASONS.has(String(reason || '').trim());

    let normalizedMoveOutDate = null;
    let normalizedRefundMonths = null;
    let normalizedRefundAmount = null;
    let normalizedDueDays = null;
    let refundDueAt = null;

    if (isEarlyExitRefund) {
      if (!requested_move_out_date) {
        return res.status(400).json({
          success: false,
          message: 'Move-out date is required for relocation refund requests.',
        });
      }

      normalizedMoveOutDate = new Date(requested_move_out_date);
      if (Number.isNaN(normalizedMoveOutDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Move-out date is invalid.',
        });
      }

      normalizedRefundMonths = requested_refund_months
        ? Math.max(Number(requested_refund_months), 0)
        : null;
      normalizedRefundAmount = requested_refund_amount
        ? Math.max(Number(requested_refund_amount), 0)
        : null;
      normalizedDueDays = refund_due_days ? Math.max(Number(refund_due_days), 0) : null;

      if (!normalizedDueDays || normalizedDueDays < 1) {
        return res.status(400).json({
          success: false,
          message: 'Enter the number of days you are giving the landlord to make the refund available.',
        });
      }

      refundDueAt = new Date();
      refundDueAt.setDate(refundDueAt.getDate() + normalizedDueDays);
    }

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
         (
           payment_id,
           tenant_id,
           landlord_id,
           property_id,
           amount,
           reason,
           details,
           request_category,
           requested_move_out_date,
           requested_refund_months,
           requested_refund_amount,
           refund_due_days,
           refund_due_at,
           feature_enabled
         )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        payment_id,
        tenantId,
        payment.landlord_id,
        payment.property_id,
        payment.amount,
        reason,
        details || null,
        isEarlyExitRefund ? 'early_exit_refund' : 'standard_refund',
        normalizedMoveOutDate,
        normalizedRefundMonths,
        normalizedRefundAmount,
        normalizedDueDays,
        refundDueAt,
        !isEarlyExitRefund,
      ]
    );

    if (isEarlyExitRefund) {
      await createNotificationSafely(
        payment.landlord_id,
        'relocation_refund_requested',
        'Relocation refund request submitted',
        `A tenant submitted a relocation refund request. It must be enabled by the assigned ${TENANCY_HIERARCHY_LABEL.toLowerCase()} team before landlord review.`,
        '/dashboard'
      );
    }

    res.status(201).json({
      success: true,
      message: isEarlyExitRefund
        ? `Relocation refund request submitted. The assigned ${TENANCY_HIERARCHY_LABEL.toLowerCase()} team must enable it before the landlord can review it.`
        : 'Refund request submitted successfully. The landlord will review it shortly.',
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
          COALESCE(p.completed_at, p.created_at) + ${tenancyDurationSql} AS tenancy_expires_at,
          prop.title      AS property_title,
          prop.full_address AS property_address,
          prop.payment_frequency,
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
         AND (
           rr.request_category <> 'early_exit_refund'
           OR rr.feature_enabled = TRUE
         )
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
       WHERE rr.id = $1
         AND rr.landlord_id = $2
         AND rr.status = 'pending'
         AND (
           rr.request_category <> 'early_exit_refund'
           OR rr.feature_enabled = TRUE
         )`,
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
    await creditWallet({
      userId: refund.tenant_id,
      paymentId: refund.payment_id,
      amount: finalAmount,
      source: 'rent_refund',
      reference: `REFUND_${refundId}_${refund.payment_id}`,
      description: `Approved rent refund request #${refundId}`,
      metadata: {
        refund_id: refundId,
        refund_type,
        refund_months: refund_type === 'partial_months' ? refund_months : null,
        paystack_refund_requested: paystackSuccess,
      },
    });

    await reverseLandlordRentCreditForPayment({
      paymentId: refund.payment_id,
      amount: finalAmount,
      reason: `Approved rent refund request #${refundId}`,
    });

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
         AND (
           request_category <> 'early_exit_refund'
           OR feature_enabled = TRUE
         )
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

    const role = getRequesterRole(req.user);
    if (!isTenancyAdminRole(role)) {
      return res.status(403).json({
        success: false,
        message: `${TENANCY_HIERARCHY_LABEL} access is required`,
      });
    }

    const { status, category, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
          rr.*,
          prop.title        AS property_title,
          prop.lga_name      AS lga_name,
          st.state_name      AS state_name,
          t.full_name       AS tenant_name,
          t.email           AS tenant_email,
          l.full_name       AS landlord_name,
          l.email           AS landlord_email,
          p.transaction_reference,
          p.completed_at    AS payment_date
       FROM refund_requests rr
       JOIN properties prop ON rr.property_id = prop.id
       LEFT JOIN states st  ON st.id = prop.state_id
       JOIN users      t    ON rr.tenant_id   = t.id
       JOIN users      l    ON rr.landlord_id = l.id
       JOIN payments   p    ON rr.payment_id  = p.id
       WHERE 1 = 1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND rr.status = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND rr.request_category = $${params.length}`;
    }

    query += adminScopeWhere(req.user, params, 'prop', 'st');
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
//     TENANT - Grace period eligibility and requests
// =====================================================
exports.getEligibleGracePeriodPayments = async (req, res) => {
  try {
    await ensureRefundSchema();

    const tenantId = req.user.id;
    const result = await db.query(
      `WITH latest_rent_payments AS (
         SELECT
           p.id AS payment_id,
           p.amount,
           p.completed_at AS paid_at,
           p.transaction_reference,
           prop.id AS property_id,
           prop.title AS property_title,
           prop.full_address AS property_address,
           prop.payment_frequency,
           prop.landlord_id,
           u.full_name AS landlord_name,
           COALESCE(p.completed_at, p.created_at) + ${tenancyDurationSql} AS tenancy_expires_at,
           ROW_NUMBER() OVER (
             PARTITION BY p.user_id, p.property_id
             ORDER BY COALESCE(p.completed_at, p.created_at) DESC, p.id DESC
           ) AS rn
         FROM payments p
         JOIN properties prop ON p.property_id = prop.id
         JOIN users u ON u.id = prop.landlord_id
         WHERE p.user_id = $1
           AND p.payment_type = 'rent_payment'
           AND p.payment_status = 'completed'
           AND p.property_id IS NOT NULL
       )
       SELECT *
       FROM latest_rent_payments lrp
       WHERE lrp.rn = 1
         AND lrp.tenancy_expires_at <= CURRENT_TIMESTAMP
         AND NOT EXISTS (
           SELECT 1
           FROM tenancy_adjustment_requests tar
           WHERE tar.payment_id = lrp.payment_id
             AND tar.tenant_id = $1
             AND tar.request_type = 'grace_period'
             AND tar.status IN ('pending_admin_review', 'enabled', 'landlord_approved')
         )
       ORDER BY lrp.tenancy_expires_at ASC`,
      [tenantId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get eligible grace payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expired rent payments',
    });
  }
};

exports.submitGracePeriodRequest = async (req, res) => {
  try {
    await ensureRefundSchema();

    const tenantId = req.user.id;
    const {
      payment_id,
      requested_duration_days,
      requested_duration_months,
      tenant_note,
    } = req.body;

    const days = Number(requested_duration_days || 0);
    const months = Number(requested_duration_months || 0);

    if (!payment_id) {
      return res.status(400).json({ success: false, message: 'payment_id is required' });
    }

    if ((!Number.isFinite(days) || days < 0) || (!Number.isFinite(months) || months < 0) || (days < 1 && months < 1)) {
      return res.status(400).json({
        success: false,
        message: 'Request at least one day or one month for the grace period.',
      });
    }

    const paymentResult = await db.query(
      `SELECT
          p.id AS payment_id,
          p.amount,
          prop.id AS property_id,
          prop.title AS property_title,
          prop.full_address AS property_address,
          prop.landlord_id,
          prop.payment_frequency,
          COALESCE(p.completed_at, p.created_at) + ${tenancyDurationSql} AS tenancy_expires_at,
          landlord.email AS landlord_email,
          landlord.full_name AS landlord_name,
          tenant.email AS tenant_email,
          tenant.full_name AS tenant_name
       FROM payments p
       JOIN properties prop ON prop.id = p.property_id
       JOIN users landlord ON landlord.id = prop.landlord_id
       JOIN users tenant ON tenant.id = p.user_id
       WHERE p.id = $1
         AND p.user_id = $2
         AND p.payment_type = 'rent_payment'
         AND p.payment_status = 'completed'`,
      [payment_id, tenantId]
    );

    if (!paymentResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Completed rent payment not found for this tenant.',
      });
    }

    const payment = paymentResult.rows[0];
    if (new Date(payment.tenancy_expires_at) > new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Grace period can only be requested after the rent period has expired.',
      });
    }

    const existing = await db.query(
      `SELECT id, status
       FROM tenancy_adjustment_requests
       WHERE payment_id = $1
         AND tenant_id = $2
         AND request_type = 'grace_period'
         AND status IN ('pending_admin_review', 'enabled', 'landlord_approved')`,
      [payment_id, tenantId]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        success: false,
        message: `A grace period request for this rent is already ${existing.rows[0].status.replace(/_/g, ' ')}.`,
      });
    }

    const result = await db.query(
      `INSERT INTO tenancy_adjustment_requests (
         request_type,
         payment_id,
         tenant_id,
         landlord_id,
         property_id,
         tenancy_expires_at,
         requested_duration_days,
         requested_duration_months,
         tenant_note,
         status
       )
       VALUES ('grace_period', $1, $2, $3, $4, $5, $6, $7, $8, 'pending_admin_review')
       RETURNING *`,
      [
        payment.payment_id,
        tenantId,
        payment.landlord_id,
        payment.property_id,
        payment.tenancy_expires_at,
        Math.floor(days) || null,
        Math.floor(months) || null,
        tenant_note || null,
      ]
    );

    await createNotificationSafely(
      payment.landlord_id,
      'grace_period_requested',
      'Tenant-requested grace period submitted',
      `A tenant requested a ${formatDurationParts(Math.floor(days) || 0, Math.floor(months) || 0)} grace period for ${payment.property_title}. The assigned ${TENANCY_HIERARCHY_LABEL.toLowerCase()} team must enable it before you can respond.`,
      '/dashboard'
    );

    await sendEmailSafely({
      to: payment.landlord_email,
      subject: 'Tenant requested a grace period',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Tenant Grace Period Request</h2>
          <p>Hello ${escapeHtml(payment.landlord_name || 'there')},</p>
          <p><strong>${escapeHtml(payment.tenant_name || 'A tenant')}</strong> requested <strong>${escapeHtml(formatDurationParts(Math.floor(days) || 0, Math.floor(months) || 0))}</strong> extra time for <strong>${escapeHtml(payment.property_title || 'your property')}</strong>.</p>
          <p>The assigned ${escapeHtml(TENANCY_HIERARCHY_LABEL.toLowerCase())} team must enable this tenant request before you can approve or reject it.</p>
        </div>
      `,
    });

    res.status(201).json({
      success: true,
      message: `Grace period request submitted. The assigned ${TENANCY_HIERARCHY_LABEL.toLowerCase()} team must enable it before the landlord can respond.`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Submit grace period request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit grace period request',
    });
  }
};

exports.getTenantGracePeriodRequests = async (req, res) => {
  try {
    await ensureRefundSchema();

    const result = await db.query(
      `SELECT
          tar.*,
          prop.title AS property_title,
          prop.full_address AS property_address,
          landlord.full_name AS landlord_name
       FROM tenancy_adjustment_requests tar
       JOIN properties prop ON prop.id = tar.property_id
       JOIN users landlord ON landlord.id = tar.landlord_id
       WHERE tar.tenant_id = $1
       ORDER BY tar.requested_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get tenant grace requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch grace period requests',
    });
  }
};

// =====================================================
//     LANDLORD - Grace period review
// =====================================================
exports.getLandlordGracePeriodRequests = async (req, res) => {
  try {
    await ensureRefundSchema();

    const landlordId = req.user.id;
    const { status } = req.query;
    const params = [landlordId];
    let query = `
      SELECT
          tar.*,
          prop.title AS property_title,
          prop.full_address AS property_address,
          tenant.full_name AS tenant_name,
          tenant.email AS tenant_email,
          tenant.phone AS tenant_phone
       FROM tenancy_adjustment_requests tar
       JOIN properties prop ON prop.id = tar.property_id
       JOIN users tenant ON tenant.id = tar.tenant_id
       WHERE tar.landlord_id = $1
         AND tar.request_type = 'grace_period'
         AND tar.feature_enabled = TRUE
    `;

    if (status) {
      params.push(status);
      query += ` AND tar.status = $${params.length}`;
    }

    query += ' ORDER BY tar.requested_at DESC';

    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get landlord grace period requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch grace period requests',
    });
  }
};

exports.respondGracePeriodRequest = async (req, res) => {
  try {
    await ensureRefundSchema();

    const landlordId = req.user.id;
    const { requestId } = req.params;
    const {
      action,
      approved_duration_days,
      approved_duration_months,
      landlord_note,
    } = req.body;
    const nextAction = String(action || '').trim().toLowerCase();

    if (!['approve', 'reject'].includes(nextAction)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }

    const requestResult = await db.query(
      `SELECT
          tar.*,
          prop.title AS property_title,
          tenant.email AS tenant_email,
          tenant.full_name AS tenant_name
       FROM tenancy_adjustment_requests tar
       JOIN properties prop ON prop.id = tar.property_id
       JOIN users tenant ON tenant.id = tar.tenant_id
       WHERE tar.id = $1
         AND tar.landlord_id = $2
         AND tar.request_type = 'grace_period'
         AND tar.status = 'enabled'
         AND tar.feature_enabled = TRUE`,
      [requestId, landlordId]
    );

    if (!requestResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Enabled grace period request not found',
      });
    }

    const request = requestResult.rows[0];

    if (nextAction === 'reject') {
      const result = await db.query(
        `UPDATE tenancy_adjustment_requests
         SET status = 'landlord_rejected',
             landlord_note = $1,
             landlord_reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [landlord_note || null, requestId]
      );

      await createNotificationSafely(
        request.tenant_id,
        'grace_period_rejected',
        'Grace period rejected',
        `Your landlord rejected the grace period request for ${request.property_title}.`,
        '/dashboard'
      );

      return res.json({
        success: true,
        message: 'Grace period request rejected',
        data: result.rows[0],
      });
    }

    const hasApprovedDays = approved_duration_days !== undefined &&
      approved_duration_days !== null &&
      approved_duration_days !== '';
    const hasApprovedMonths = approved_duration_months !== undefined &&
      approved_duration_months !== null &&
      approved_duration_months !== '';
    const requestedDays = Number(request.requested_duration_days || 0);
    const requestedMonths = Number(request.requested_duration_months || 0);
    const days = Number(hasApprovedDays ? approved_duration_days : requestedDays);
    const months = Number(hasApprovedMonths ? approved_duration_months : requestedMonths);
    if ((!Number.isFinite(days) || days < 0) || (!Number.isFinite(months) || months < 0) || (days < 1 && months < 1)) {
      return res.status(400).json({
        success: false,
        message: 'Approve at least one day or one month for the grace period.',
      });
    }

    if (getDurationWeight(months, days) > getDurationWeight(requestedMonths, requestedDays)) {
      return res.status(400).json({
        success: false,
        message: 'Approved grace period cannot exceed the duration requested by the tenant. Ask the tenant to submit a new request for a longer period.',
      });
    }

    const baseDate = new Date(Math.max(
      new Date(request.tenancy_expires_at || Date.now()).getTime(),
      Date.now()
    ));
    const graceEndsAt = addDurationToDate(baseDate, Math.floor(months), Math.floor(days));

    const result = await db.query(
      `UPDATE tenancy_adjustment_requests
       SET status = 'landlord_approved',
           approved_duration_days = $1,
           approved_duration_months = $2,
           landlord_note = $3,
           grace_ends_at = $4,
           landlord_reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [
        Math.floor(days) || null,
        Math.floor(months) || null,
        landlord_note || null,
        graceEndsAt,
        requestId,
      ]
    );

    await createNotificationSafely(
      request.tenant_id,
      'grace_period_approved',
      'Grace period approved',
      `Your landlord approved the grace period for ${request.property_title}. It ends on ${formatDate(graceEndsAt)}.`,
      '/dashboard'
    );

    await sendEmailSafely({
      to: request.tenant_email,
      subject: 'Your grace period was approved',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Grace Period Approved</h2>
          <p>Hello ${escapeHtml(request.tenant_name || 'there')},</p>
          <p>Your landlord approved a grace period for <strong>${escapeHtml(request.property_title || 'your rented property')}</strong>.</p>
          <p><strong>Grace period ends:</strong> ${formatDate(graceEndsAt)}</p>
          <p><a href="${FRONTEND_URL}/dashboard" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">Open Dashboard</a></p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: 'Grace period approved',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Respond grace period request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to grace period request',
    });
  }
};

// =====================================================
//     ADMIN/SUPPORT - Grace period enablement
// =====================================================
exports.adminGetTenancyAdjustmentRequests = async (req, res) => {
  try {
    await ensureRefundSchema();

    const role = getRequesterRole(req.user);
    if (!isTenancyAdminRole(role)) {
      return res.status(403).json({
        success: false,
        message: `${TENANCY_HIERARCHY_LABEL} access is required`,
      });
    }

    const { status = 'pending_admin_review', page = 1, limit = 20 } = req.query;
    const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * pageSize;
    const params = [];
    let query = `
      SELECT
          tar.*,
          prop.title AS property_title,
          prop.full_address AS property_address,
          prop.lga_name,
          st.state_name,
          tenant.full_name AS tenant_name,
          tenant.email AS tenant_email,
          landlord.full_name AS landlord_name,
          landlord.email AS landlord_email,
          enabled_by_user.full_name AS enabled_by_name
       FROM tenancy_adjustment_requests tar
       JOIN properties prop ON prop.id = tar.property_id
       LEFT JOIN states st ON st.id = prop.state_id
       JOIN users tenant ON tenant.id = tar.tenant_id
       JOIN users landlord ON landlord.id = tar.landlord_id
       LEFT JOIN users enabled_by_user ON enabled_by_user.id = tar.enabled_by
       WHERE tar.request_type = 'grace_period'
    `;

    if (status && status !== 'all') {
      params.push(status);
      query += ` AND tar.status = $${params.length}`;
    }

    query += adminScopeWhere(req.user, params, 'prop', 'st');
    query += ` ORDER BY tar.requested_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(pageSize, offset);

    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Admin get tenancy adjustment requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenancy adjustment requests',
    });
  }
};

exports.adminReviewTenancyAdjustmentRequest = async (req, res) => {
  try {
    await ensureRefundSchema();

    const role = getRequesterRole(req.user);
    if (!isTenancyAdminRole(role)) {
      return res.status(403).json({
        success: false,
        message: `${TENANCY_HIERARCHY_LABEL} access is required`,
      });
    }

    const { requestId } = req.params;
    const { action, admin_note } = req.body;
    const nextAction = String(action || '').trim().toLowerCase();

    if (!['enable', 'reject'].includes(nextAction)) {
      return res.status(400).json({ success: false, message: 'action must be enable or reject' });
    }

    const requestResult = await db.query(
      `SELECT
          tar.*,
          prop.title AS property_title,
          prop.lga_name,
          st.state_name,
          tenant.full_name AS tenant_name,
          tenant.email AS tenant_email,
          landlord.full_name AS landlord_name,
          landlord.email AS landlord_email
       FROM tenancy_adjustment_requests tar
       JOIN properties prop ON prop.id = tar.property_id
       LEFT JOIN states st ON st.id = prop.state_id
       JOIN users tenant ON tenant.id = tar.tenant_id
       JOIN users landlord ON landlord.id = tar.landlord_id
       WHERE tar.id = $1
         AND tar.request_type = 'grace_period'
         AND tar.status = 'pending_admin_review'`,
      [requestId]
    );

    if (!requestResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Pending grace period request not found',
      });
    }

    const request = requestResult.rows[0];
    const scopeError = getAdminScopeError(req.user, request);
    if (scopeError) {
      return res.status(403).json({ success: false, message: scopeError });
    }

    const result = await db.query(
      nextAction === 'enable'
        ? `UPDATE tenancy_adjustment_requests
           SET status = 'enabled',
               feature_enabled = TRUE,
               enabled_by = $1,
               enabled_at = CURRENT_TIMESTAMP,
               admin_note = $2,
               reviewed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`
        : `UPDATE tenancy_adjustment_requests
           SET status = 'rejected',
               feature_enabled = FALSE,
               enabled_by = $1,
               admin_note = $2,
               reviewed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`,
      [req.user.id, admin_note || null, requestId]
    );

    const propertyTitle = request.property_title || 'the rented property';
    if (nextAction === 'enable') {
      await createNotificationSafely(
        request.landlord_id,
        'grace_period_enabled',
        'Tenant-requested grace period enabled',
        `${TENANCY_HIERARCHY_LABEL} enabled a tenant-requested grace period for ${propertyTitle}. Please approve or reject it from your dashboard.`,
        '/dashboard'
      );
      await createNotificationSafely(
        request.tenant_id,
        'grace_period_enabled',
        'Tenant-requested grace period enabled',
        `Your grace period request for ${propertyTitle} has been enabled for landlord review.`,
        '/dashboard'
      );

      await Promise.all([
        sendEmailSafely({
          to: request.landlord_email,
          subject: 'Grace period request enabled',
          html: `
            <div style="font-family: sans-serif; line-height: 1.6;">
              <h2>Grace Period Request Enabled</h2>
              <p>Hello ${escapeHtml(request.landlord_name || 'there')},</p>
              <p>${escapeHtml(TENANCY_HIERARCHY_LABEL)} enabled <strong>${escapeHtml(request.tenant_name || 'a tenant')}</strong>'s grace period request for <strong>${escapeHtml(propertyTitle)}</strong>.</p>
              <p>Please open your dashboard to approve the tenant-requested days/months or reject with a reason.</p>
              <p><a href="${FRONTEND_URL}/dashboard" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">Open Dashboard</a></p>
            </div>
          `,
        }),
        sendEmailSafely({
          to: request.tenant_email,
          subject: 'Your grace period request is enabled',
          html: `
            <div style="font-family: sans-serif; line-height: 1.6;">
              <h2>Grace Period Request Enabled</h2>
              <p>Hello ${escapeHtml(request.tenant_name || 'there')},</p>
              <p>Your grace period request for <strong>${escapeHtml(propertyTitle)}</strong> has been enabled for landlord review.</p>
              <p><a href="${FRONTEND_URL}/dashboard" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">Open Dashboard</a></p>
            </div>
          `,
        }),
      ]);
    } else {
      await createNotificationSafely(
        request.tenant_id,
        'grace_period_not_enabled',
        'Grace period not enabled',
        `${TENANCY_HIERARCHY_LABEL} did not enable your grace period request for ${propertyTitle}.`,
        '/dashboard'
      );
    }

    res.json({
      success: true,
      message: nextAction === 'enable'
        ? 'Grace period request enabled for landlord review'
        : 'Grace period request rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Admin review tenancy adjustment request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review tenancy adjustment request',
    });
  }
};

// =====================================================
//     TENANT — Get Wallet Balance
// =====================================================
exports.getWalletBalance = async (req, res) => {
  try {
    await ensureRefundSchema();
    await ensureWalletLedgerSchema();
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

/**
 * Helper: verify bank account details with Paystack and return the verified account name.
 * Throws with a user-friendly message on failure.
 */
const verifyBankAccountWithPaystack = async (bankName, accountNumber) => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Payment service is not configured');
  }

  // Fetch banks from Paystack
  const banksRes = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const banks = banksRes.data?.data || [];
  const bank = banks.find(b =>
    b.name.toLowerCase().includes(bankName.toLowerCase()) ||
    bankName.toLowerCase().includes(b.name.toLowerCase())
  );

  if (!bank) {
    throw new Error('Bank not found. Please select a valid bank from the list.');
  }

  const verifyRes = await axios.get(
    `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bank.code}`,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (verifyRes.data?.status !== true || !verifyRes.data?.data?.account_name) {
    throw new Error('Unable to verify account. Please check the account number and try again.');
  }

  return {
    verifiedName: verifyRes.data.data.account_name,
    bankCode: bank.code,
  };
};

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

    // ── Server-side account name verification ──────────────────────────────
    try {
      const { verifiedName } = await verifyBankAccountWithPaystack(bank_name, account_number);
      // Compare names — allow case-insensitive and partial word matching
      const normalizedVerified = verifiedName.trim().toLowerCase().replace(/\s+/g, ' ');
      const normalizedProvided = account_name.trim().toLowerCase().replace(/\s+/g, ' ');
      if (normalizedVerified !== normalizedProvided) {
        return res.status(400).json({
          success: false,
          message: `Account name mismatch. The bank record shows "${verifiedName}". Please use the exact name as registered with your bank.`,
        });
      }
    } catch (verifyErr) {
      return res.status(400).json({
        success: false,
        message: verifyErr.message || 'Could not verify account details. Please try again.',
      });
    }

    const userResult = await db.query(`SELECT user_type FROM users WHERE id = $1`, [userId]);
    const userType = userResult.rows[0]?.user_type;

    if (userType === 'landlord') {
      await clearMaturedLandlordRentCredits({ landlordId: userId });
    }

    // Check wallet balance
    const walletBalance = await getWalletBalance(userId);
    const rentDeductions = userType === 'landlord'
      ? await getLandlordRentDeductionTotal(userId)
      : 0;
    const balance = userType === 'landlord'
      ? Math.max(0, walletBalance - rentDeductions)
      : walletBalance;

    if (withdrawAmount > balance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Available: ₦${balance.toLocaleString()}`,
      });
    }

    // For landlords — enforce 14 working days hold
    if (userType === 'landlord') {
      const feeStatus = await getLandlordPropertyFeeStatus(userId);
      if (feeStatus.reserve_required && Number(feeStatus.amount_due || 0) > 0) {
        const availableAfterReserve = Number(feeStatus.available_after_reserve || 0);

        if (withdrawAmount > availableAfterReserve) {
          const reserveLabel = feeStatus.reserve_label || 'landlord property charges';
          return res.status(400).json({
            success: false,
            code: 'LANDLORD_PROPERTY_FEE_RESERVED',
            message: `You cannot withdraw all funds now. Your ${reserveLabel} reserve of N${Number(feeStatus.amount_due || 0).toLocaleString()} is due on ${new Date(feeStatus.due_at).toLocaleDateString()} for ${feeStatus.property_count} posted propert${Number(feeStatus.property_count) === 1 ? 'y' : 'ies'}. Maximum available after reserve: N${availableAfterReserve.toLocaleString()}.`,
            data: {
              property_fee: feeStatus,
              max_withdrawable_after_reserve: availableAfterReserve,
            },
          });
        }
      }

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
    res.status(500).json({ success: false, message: 'Failed to approve wallet withdrawal' });
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
    await ensureWalletLedgerSchema();
    const landlordId = req.user.id;

    await clearMaturedLandlordRentCredits({ landlordId });

    const walletSummary = await getWalletCreditSummaryForUser(landlordId);
    const pendingResult = await db.query(
      `SELECT COALESCE(SUM(wt.amount), 0) AS disputed_pending_amount
       FROM wallet_transactions wt
       WHERE wt.user_id = $1
         AND wt.source = 'rent_payment'
         AND wt.status = 'pending'
         AND EXISTS (
           SELECT 1
           FROM refund_requests rr
           WHERE rr.payment_id = wt.payment_id
             AND rr.status IN ('pending','approved')
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

    const pending   = Number(walletSummary.pending_rent || 0);
    const withdrawn = Number(withdrawnResult.rows[0].withdrawn_amount);
    const rentDeductions = await getLandlordRentDeductionTotal(landlordId);
    const walletBalance = Number(walletSummary.wallet_balance || 0);
    const available = Math.max(0, walletBalance - rentDeductions);
    const propertyFeeStatus = await getLandlordPropertyFeeStatus(landlordId);

    res.json({
      success: true,
      data: {
        cleared_balance:   available,
        wallet_balance:    walletBalance,
        rent_available_to_withdraw: available,
        cleared_rent_total: Number(walletSummary.cleared_rent || 0),
        rent_deductions_total: rentDeductions,
        pending_balance:   pending,
        disputed_pending_balance: Number(pendingResult.rows[0]?.disputed_pending_amount || 0),
        withdrawn_total:   withdrawn,
        available_to_withdraw: available,
        property_fee: propertyFeeStatus,
      },
    });
  } catch (error) {
    console.error('Get landlord wallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet balance' });
  }
};


module.exports = exports;
