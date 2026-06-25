const express = require('express');
const { authenticate, requireSuperAdmin } = require('../config/middleware/auth');
const { requireSuperAdminOrDelegatedDirectWithdraw } = require('../config/middleware/requireFinancialAdmin');
const superCtrl = require('../controllers/superAdmin.controller');
const adCtrl = require('../controllers/adController');
const platformRatingCtrl = require('../controllers/platformRatingController');
const audit = require('../config/middleware/auditMiddleware');
const db = require('../config/middleware/database');
const bcrypt = require('bcryptjs');
const commissionService = require('../services/commissionService');
const { criticalFinanceOpsLimiter } = require('../config/middleware/securityRateLimiters');

const router = express.Router();

// ================== PENDING ADMIN APPROVALS ==================

let adminApprovalDecisionSchemaReady = false;

const ensureAdminApprovalDecisionSchema = async () => {
  if (adminApprovalDecisionSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_approval_decisions (
      id SERIAL PRIMARY KEY,
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      decision VARCHAR(20) NOT NULL,
      note TEXT,
      target_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_admin_approval_decision
        CHECK (decision IN ('approved', 'rejected'))
    );

    CREATE INDEX IF NOT EXISTS idx_admin_approval_decisions_created
      ON admin_approval_decisions(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_admin_approval_decisions_target
      ON admin_approval_decisions(target_user_id, created_at DESC);
  `);

  adminApprovalDecisionSchemaReady = true;
};

const getApprovalActorName = (user = {}) =>
  user.full_name || user.name || user.email || `Admin #${user.id || 'unknown'}`;

const createAdminApprovalDecision = async ({
  targetUserId,
  actorId,
  actorName,
  decision,
  note = null,
  targetSnapshot = {},
}) => {
  await db.query(
    `INSERT INTO admin_approval_decisions (
       target_user_id,
       actor_id,
       actor_name,
       decision,
       note,
       target_snapshot
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      targetUserId,
      actorId || null,
      actorName || null,
      decision,
      note || null,
      JSON.stringify(targetSnapshot || {}),
    ]
  );
};

// Allow super_admin OR a delegated super_financial_admin to hit these routes
const canManagePendingAdmins = async (req, res, next) => {
  const userType = req.user?.user_type;
  if (userType === 'super_admin') return next();

  if (userType === 'super_financial_admin') {
    const perm = await db.query(
      `SELECT can_approve_admins FROM sfa_delegation_permissions WHERE super_financial_admin_id = $1`,
      [req.user.id]
    );
    if (perm.rows[0]?.can_approve_admins) return next();
  }

  return res.status(403).json({ success: false, message: 'Access denied.' });
};

// GET /super/pending-admins
router.get('/pending-admins', authenticate, async (req, res, next) => {
  try {
    await ensureAdminApprovalDecisionSchema();

    await canManagePendingAdmins(req, res, async () => {
      // Super Financial Admin cannot see other super_financial_admin pending accounts
      const isSFA = req.user.user_type === 'super_financial_admin';
      const [pendingResult, decisionsResult] = await Promise.all([
        db.query(
        `SELECT id, full_name, email, phone, user_type,
                assigned_state, assigned_city, lawyer_client_scope,
                created_at, approval_status
         FROM users
         WHERE approval_status = 'pending'
           AND deleted_at IS NULL
           ${isSFA ? `AND user_type <> 'super_financial_admin'` : ''}
         ORDER BY created_at DESC`
        ),
        db.query(
          `SELECT
             id,
             target_user_id,
             actor_id,
             actor_name,
             decision,
             note,
             target_snapshot,
             created_at
           FROM admin_approval_decisions
           ${isSFA ? `WHERE COALESCE(target_snapshot->>'user_type', '') <> 'super_financial_admin'` : ''}
           ORDER BY created_at DESC
           LIMIT 25`
        ),
      ]);

      res.json({
        success: true,
        data: {
          pending: pendingResult.rows,
          recent_decisions: decisionsResult.rows,
        },
      });
    });
  } catch (err) {
    console.error('Get pending admins error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /super/pending-admins/:id/approve
router.patch('/pending-admins/:id/approve', authenticate, canManagePendingAdmins, async (req, res) => {
  try {
    await ensureAdminApprovalDecisionSchema();

    const { id } = req.params;
    const isSFA = req.user.user_type === 'super_financial_admin';
    const decisionNote = String(req.body?.decision_note || '').trim() || null;

    await db.query('BEGIN');

    // SFA cannot approve another super_financial_admin
    const target = await db.query(
      `SELECT id, full_name, email, phone, user_type, assigned_state, assigned_city,
              lawyer_client_scope, approval_status, created_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );
    if (!target.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    if (target.rows[0].approval_status !== 'pending') {
      await db.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Account is not pending approval' });
    }
    if (isSFA && target.rows[0].user_type === 'super_financial_admin') {
      await db.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Only the Super Admin can approve Super Financial Admin accounts' });
    }

    await db.query(
      `UPDATE users SET approval_status = 'approved' WHERE id = $1`,
      [id]
    );

    await createAdminApprovalDecision({
      targetUserId: Number(id),
      actorId: req.user.id,
      actorName: getApprovalActorName(req.user),
      decision: 'approved',
      note: decisionNote,
      targetSnapshot: target.rows[0],
    });

    await db.query('COMMIT');

    res.json({ success: true, message: 'Admin account approved successfully' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Approve pending admin error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /super/pending-admins/:id/reject
router.patch('/pending-admins/:id/reject', authenticate, canManagePendingAdmins, async (req, res) => {
  try {
    await ensureAdminApprovalDecisionSchema();

    const { id } = req.params;
    const isSFA = req.user.user_type === 'super_financial_admin';
    const decisionNote = String(req.body?.decision_note || '').trim();

    if (!decisionNote) {
      return res.status(400).json({ success: false, message: 'A rejection reason is required' });
    }

    await db.query('BEGIN');

    const target = await db.query(
      `SELECT id, full_name, email, phone, user_type, assigned_state, assigned_city,
              lawyer_client_scope, approval_status, created_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );
    if (!target.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    if (target.rows[0].approval_status !== 'pending') {
      await db.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Account is not pending approval' });
    }
    if (isSFA && target.rows[0].user_type === 'super_financial_admin') {
      await db.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Only the Super Admin can reject Super Financial Admin accounts' });
    }

    // Soft-delete the rejected account
    await db.query(
      `UPDATE users SET deleted_at = NOW(), approval_status = 'rejected' WHERE id = $1`,
      [id]
    );

    await createAdminApprovalDecision({
      targetUserId: Number(id),
      actorId: req.user.id,
      actorName: getApprovalActorName(req.user),
      decision: 'rejected',
      note: decisionNote,
      targetSnapshot: target.rows[0],
    });

    await db.query('COMMIT');

    res.json({ success: true, message: 'Admin account rejected and removed' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Reject pending admin error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================== SFA DELEGATION PERMISSIONS ==================

// GET /super/sfa-permissions  (super_admin only)
router.get('/sfa-permissions', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const sfas = await db.query(
      `SELECT u.id, u.full_name, u.email,
              COALESCE(p.can_approve_admins, FALSE)  AS can_approve_admins,
              COALESCE(p.can_direct_withdraw, FALSE) AS can_direct_withdraw,
              p.granted_at
       FROM users u
       LEFT JOIN sfa_delegation_permissions p ON p.super_financial_admin_id = u.id
       WHERE u.user_type = 'super_financial_admin'
         AND u.deleted_at IS NULL
         AND COALESCE(u.approval_status, 'approved') = 'approved'
       ORDER BY u.full_name`
    );
    res.json({ success: true, data: sfas.rows });
  } catch (err) {
    console.error('Get SFA permissions error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /super/sfa-permissions/:sfaId  (super_admin only)
router.patch('/sfa-permissions/:sfaId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { sfaId } = req.params;
    const { can_approve_admins, can_direct_withdraw } = req.body;

    // Verify target is a super_financial_admin
    const target = await db.query(
      `SELECT id FROM users WHERE id = $1 AND user_type = 'super_financial_admin' AND deleted_at IS NULL`,
      [sfaId]
    );
    if (!target.rows.length) {
      return res.status(404).json({ success: false, message: 'Super Financial Admin not found' });
    }

    await db.query(
      `INSERT INTO sfa_delegation_permissions
         (super_financial_admin_id, can_approve_admins, can_direct_withdraw, granted_by, granted_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (super_financial_admin_id) DO UPDATE
         SET can_approve_admins  = EXCLUDED.can_approve_admins,
             can_direct_withdraw = EXCLUDED.can_direct_withdraw,
             granted_by          = EXCLUDED.granted_by,
             granted_at          = NOW(),
             updated_at          = NOW()`,
      [sfaId, !!can_approve_admins, !!can_direct_withdraw, req.user.id]
    );

    res.json({ success: true, message: 'Permissions updated successfully' });
  } catch (err) {
    console.error('Update SFA permissions error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================== SUPER ADMIN DIRECT WITHDRAWAL ==================

// POST /super/withdraw/direct  (super_admin or delegated super_financial_admin with can_direct_withdraw)
router.post('/withdraw/direct', authenticate, requireSuperAdminOrDelegatedDirectWithdraw, criticalFinanceOpsLimiter, async (req, res) => {
  try {
    const { amount, bank_name, bank_code, account_number, account_name, password } = req.body;

    // Validate inputs
    if (!amount || !bank_name || !account_number || !account_name || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1000) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is ₦1,000' });
    }
    if (!/^\d{10}$/.test(String(account_number))) {
      return res.status(400).json({ success: false, message: 'Account number must be 10 digits' });
    }

    // Verify identity password
    const userRow = await db.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!userRow.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const passwordMatch = await bcrypt.compare(String(password), userRow.rows[0].password_hash);
    if (!passwordMatch) {
      return res.status(403).json({ success: false, message: 'Incorrect password' });
    }

    // Process via commission service (direct payout — no queue)
    const result = await commissionService.processAdminWithdrawal(
      req.user.id,
      parsedAmount,
      {
        bank_name: String(bank_name).trim(),
        bank_code: String(bank_code || '').trim(),
        account_number: String(account_number).trim(),
        account_name: String(account_name).trim(),
      },
      {
        directPayout: true,
        processedBy: req.user.id,
        adminNote: 'Direct withdrawal initiated by authorized admin',
      }
    );

    res.json({
      success: true,
      message: 'Withdrawal processed successfully',
      data: result,
    });
  } catch (err) {
    console.error('Super admin direct withdrawal error:', err);
    res.status(400).json({ success: false, message: 'Withdrawal failed. Please verify the details and try again.' });
  }
});

router.get('/users', authenticate, requireSuperAdmin, superCtrl.getAllUsers);
router.patch('/users/:id/ban', authenticate, requireSuperAdmin, superCtrl.banUser);
router.patch('/users/:id/unban', authenticate, requireSuperAdmin, superCtrl.unbanUser);
router.delete('/users/:id', authenticate, requireSuperAdmin, superCtrl.deleteUser);
router.patch('/users/:id/promote', authenticate, requireSuperAdmin, superCtrl.promoteToAdmin);

router.get('/properties', authenticate, requireSuperAdmin, superCtrl.getAllProperties);
router.patch('/properties/:id/unlist', authenticate, requireSuperAdmin, audit('unlist_property', 'property'), superCtrl.unlistProperty);
router.patch('/properties/:id/feature', authenticate, requireSuperAdmin, superCtrl.featureProperty);
router.patch('/properties/:id/unfeature', authenticate, requireSuperAdmin, superCtrl.unfeatureProperty);

router.patch('/verify/:userId', authenticate, requireSuperAdmin, superCtrl.verifyUser);
router.get('/verifications', authenticate, requireSuperAdmin, superCtrl.getIdentityVerifications);
router.patch('/verifications/:userId/approve', authenticate, requireSuperAdmin, superCtrl.approveIdentityVerification);
router.patch('/verifications/:userId/reject', authenticate, requireSuperAdmin, superCtrl.rejectIdentityVerification);
router.delete('/verifications/:userId', authenticate, requireSuperAdmin, superCtrl.deleteRejectedVerification);
router.get('/admins/performance', authenticate, requireSuperAdmin, superCtrl.getAdminPerformance);
router.post('/admins/:id/impersonate', authenticate, requireSuperAdmin, superCtrl.impersonateAdmin);
router.get('/admins/:adminId/state-users', authenticate, requireSuperAdmin, superCtrl.getAdminStateUsers);
router.patch('/admins/:id/jurisdiction', authenticate, requireSuperAdmin, superCtrl.updateAdminJurisdiction);

router.get('/logs', authenticate, requireSuperAdmin, superCtrl.getAuditLogs);
router.get('/admin-monitor', authenticate, requireSuperAdmin, superCtrl.getAdminMonitor);

router.get('/analytics', authenticate, requireSuperAdmin, superCtrl.getAnalytics);

router.get('/reports', authenticate, requireSuperAdmin, superCtrl.getReports);
router.patch('/reports/:id', authenticate, requireSuperAdmin, superCtrl.updateReportStatus);
router.patch('/reports/:reportId/resolve', authenticate, requireSuperAdmin, audit('resolve_report', 'report'), superCtrl.resolveReport);

router.get('/broadcasts', authenticate, requireSuperAdmin, superCtrl.getBroadcasts);
router.post('/broadcasts', authenticate, requireSuperAdmin, superCtrl.createBroadcast);

router.get('/ad-spaces', authenticate, requireSuperAdmin, adCtrl.adminListAds);
router.post('/ad-spaces/image', authenticate, requireSuperAdmin, adCtrl.uploadAdImageFile, adCtrl.uploadAdImage);
router.post('/ad-spaces/video', authenticate, requireSuperAdmin, adCtrl.uploadAdVideoFile, adCtrl.uploadAdVideo);
router.post('/ad-spaces', authenticate, requireSuperAdmin, adCtrl.createAd);
router.patch('/ad-spaces/:id', authenticate, requireSuperAdmin, adCtrl.updateAd);
router.delete('/ad-spaces/:id', authenticate, requireSuperAdmin, adCtrl.deleteAd);

router.get('/platform-ratings', authenticate, requireSuperAdmin, platformRatingCtrl.adminListRatings);
router.patch('/platform-ratings/settings', authenticate, requireSuperAdmin, platformRatingCtrl.adminUpdateSettings);
router.patch('/platform-ratings/:ratingId/moderate', authenticate, requireSuperAdmin, platformRatingCtrl.adminModerateRating);
router.post('/platform-ratings/rules', authenticate, requireSuperAdmin, platformRatingCtrl.adminCreateRule);
router.patch('/platform-ratings/rules/:ruleId', authenticate, requireSuperAdmin, platformRatingCtrl.adminUpdateRule);
router.delete('/platform-ratings/rules/:ruleId', authenticate, requireSuperAdmin, platformRatingCtrl.adminDeleteRule);

router.get('/platform-lawyers', authenticate, requireSuperAdmin, superCtrl.getPlatformLawyerManagementData);
router.get('/lawyer-activities', authenticate, requireSuperAdmin, superCtrl.getLawyerActivities);
router.post('/platform-lawyers/manual', authenticate, requireSuperAdmin, superCtrl.createManualPlatformLawyer);
router.post('/platform-lawyers/:lawyerId/resend-invite', authenticate, requireSuperAdmin, superCtrl.resendManualPlatformLawyerInvite);
router.patch('/platform-lawyers/:lawyerId', authenticate, requireSuperAdmin, superCtrl.updatePlatformLawyer);
router.delete('/platform-lawyers/:lawyerId', authenticate, requireSuperAdmin, superCtrl.deletePlatformLawyer);
router.post('/platform-lawyers/broadcast', authenticate, requireSuperAdmin, superCtrl.createPlatformLawyerRecruitmentBroadcast);
router.patch('/platform-lawyers/applications/:applicationId/approve', authenticate, requireSuperAdmin, superCtrl.approvePlatformLawyerApplication);
router.patch('/platform-lawyers/applications/:applicationId/reject', authenticate, requireSuperAdmin, superCtrl.rejectPlatformLawyerApplication);

router.post('/users/bulk', authenticate, requireSuperAdmin, superCtrl.bulkUserAction);
router.post('/properties/bulk', authenticate, requireSuperAdmin, superCtrl.bulkPropertyAction);

router.get('/flags', authenticate, requireSuperAdmin, superCtrl.getFeatureFlags);
router.patch('/flags/:key', authenticate, requireSuperAdmin, superCtrl.updateFeatureFlag);

router.get('/pricing-rules', authenticate, requireSuperAdmin, superCtrl.getPricingRules);
router.post('/pricing-rules', authenticate, requireSuperAdmin, superCtrl.createPricingRule);
router.patch('/pricing-rules/:ruleId', authenticate, requireSuperAdmin, superCtrl.updatePricingRule);
router.delete('/pricing-rules/:ruleId', authenticate, requireSuperAdmin, superCtrl.removePricingRule);

router.get(
  '/registration-access-rules',
  authenticate,
  requireSuperAdmin,
  superCtrl.getRegistrationAccessRules
);
router.post(
  '/registration-access-rules',
  authenticate,
  requireSuperAdmin,
  superCtrl.createRegistrationAccessRuleHandler
);
router.patch(
  '/registration-access-rules/:ruleId',
  authenticate,
  requireSuperAdmin,
  superCtrl.updateRegistrationAccessRuleHandler
);
router.delete(
  '/registration-access-rules/:ruleId',
  authenticate,
  requireSuperAdmin,
  superCtrl.removeRegistrationAccessRule
);

router.get('/fraud', authenticate, requireSuperAdmin, superCtrl.getFraudFlags);
router.patch('/fraud/:id/resolve', authenticate, requireSuperAdmin, superCtrl.resolveFraudFlag);

// Send verification reminder notification to a user
router.post('/users/:userId/verification-reminder', authenticate, requireSuperAdmin, superCtrl.sendUserVerificationReminder);

// ====================== PLATFORM AGENTS ======================

router.get('/platform-agents', authenticate, requireSuperAdmin, superCtrl.getPlatformAgentManagementData);
router.post('/platform-agents/manual', authenticate, requireSuperAdmin, superCtrl.createManualPlatformAgent);
router.patch('/platform-agents/:agentId', authenticate, requireSuperAdmin, superCtrl.updatePlatformAgent);
router.delete('/platform-agents/:agentId', authenticate, requireSuperAdmin, superCtrl.deletePlatformAgent);

module.exports = router;
