const express = require('express');
const router = express.Router();
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const { body } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdmin');
const { isStateAdmin, isSuperAdmin } = require('../config/utils/roleScopes');
const { createNotification } = require('../config/utils/notificationService');

const STATUS_TRANSITIONS = {
  pending: ['under_review'],
  under_review: ['upheld', 'dismissed'],
  upheld: [],
  dismissed: [],
};

const canReviewAppeal = (user) =>
  isStateAdmin(user.user_type) || isSuperAdmin(user.user_type);

const canReviewForState = async (user, appealState) => {
  if (isSuperAdmin(user.user_type)) return true;
  if (!appealState) return false;
  const result = await db.query(
    'SELECT 1 FROM users WHERE id = $1 AND LOWER(TRIM(assigned_state)) = LOWER(TRIM($2)) AND deleted_at IS NULL',
    [user.id, appealState]
  );
  return result.rows.length > 0;
};

const stripTags = (v) => (v ? String(v).replace(/<[^>]*>/g, '') : v);

router.post('/appeals', authenticate, [
  body('appeal_type').isIn(['property', 'verification']),
  body('appeal_reason').trim().notEmpty().customSanitizer(stripTags).isLength({ max: 5000 }),
  body('additional_info').optional({ checkFalsy: true }).trim().customSanitizer(stripTags).isLength({ max: 10000 }),
  body('property_id').optional({ checkFalsy: true }).isInt(),
  body('target_user_id').optional({ checkFalsy: true }).isInt(),
  validateRequest,
], async (req, res) => {
  try {
    const { appeal_type, property_id, target_user_id, appeal_reason, additional_info } = req.body;

    if (appeal_type === 'property' && !property_id) {
      return res.status(400).json({ message: 'property_id is required for property appeals' });
    }
    if (appeal_type === 'verification' && !target_user_id) {
      return res.status(400).json({ message: 'target_user_id is required for verification appeals' });
    }

    const appellantId = req.user.id;

    if (appeal_type === 'property') {
      const property = await db.query(
        `SELECT p.id, p.status, p.rejection_reason, p.verified_by, p.landlord_id, p.state
         FROM properties p WHERE p.id = $1 AND p.deleted_at IS NULL`,
        [property_id]
      );
      if (!property.rows.length) {
        return res.status(404).json({ message: 'Property not found' });
      }
      if (property.rows[0].status !== 'rejected') {
        return res.status(400).json({ message: 'Only rejected properties can be appealed' });
      }
      if (Number(property.rows[0].landlord_id) !== Number(appellantId)) {
        return res.status(403).json({ message: 'You can only appeal your own property' });
      }

      const existing = await db.query(
        `SELECT id, status FROM admin_appeals
         WHERE appeal_type = 'property' AND property_id = $1 AND appellant_id = $2 AND status IN ('pending', 'under_review')`,
        [property_id, appellantId]
      );
      if (existing.rows.length) {
        return res.status(400).json({ message: 'You already have a pending appeal for this property' });
      }

      const result = await db.query(
        `INSERT INTO admin_appeals (appeal_type, property_id, appellant_id, original_decision_maker_id, original_rejection_reason, appeal_reason, additional_info)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [appeal_type, property_id, appellantId, property.rows[0].verified_by, property.rows[0].rejection_reason, appeal_reason, additional_info || null]
      );

      const adminUsers = await db.query(
        `SELECT id FROM users WHERE user_type = 'state_admin' AND LOWER(TRIM(assigned_state)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
        [property.rows[0].state]
      );
      for (const admin of adminUsers.rows) {
        await createNotification(admin.id, 'appeal', 'New Property Appeal',
          `A property owner has appealed a rejection for property #${property_id}.`,
          `/admin/appeals/${result.rows[0].id}`
        );
      }

      return res.status(201).json({ message: 'Appeal submitted', data: result.rows[0] });
    }

    if (appeal_type === 'verification') {
      const targetUser = await db.query(
        `SELECT id, identity_verification_status, identity_verified_by, assigned_state
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [target_user_id]
      );
      if (!targetUser.rows.length) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (Number(target_user_id) !== Number(appellantId)) {
        return res.status(403).json({ message: 'You can only appeal your own verification' });
      }
      const status = targetUser.rows[0].identity_verification_status;
      if (status !== 'rejected') {
        return res.status(400).json({ message: 'Only rejected verifications can be appealed' });
      }

      const existing = await db.query(
        `SELECT id, status FROM admin_appeals
         WHERE appeal_type = 'verification' AND target_user_id = $1 AND appellant_id = $2 AND status IN ('pending', 'under_review')`,
        [target_user_id, appellantId]
      );
      if (existing.rows.length) {
        return res.status(400).json({ message: 'You already have a pending appeal for this verification' });
      }

      const result = await db.query(
        `INSERT INTO admin_appeals (appeal_type, target_user_id, appellant_id, original_decision_maker_id, original_rejection_reason, appeal_reason, additional_info)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [appeal_type, target_user_id, appellantId, targetUser.rows[0].identity_verified_by, null, appeal_reason, additional_info || null]
      );

      const userState = targetUser.rows[0].assigned_state;
      if (userState) {
        const adminUsers = await db.query(
          `SELECT id FROM users WHERE user_type = 'state_admin' AND LOWER(TRIM(assigned_state)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
          [userState]
        );
        for (const admin of adminUsers.rows) {
          await createNotification(admin.id, 'appeal', 'New Verification Appeal',
            `A user has appealed a verification rejection.`,
            `/admin/appeals/${result.rows[0].id}`
          );
        }
      }

      return res.status(201).json({ message: 'Appeal submitted', data: result.rows[0] });
    }
  } catch (err) {
    req.logger.error('Submit appeal error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/appeals/my', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const result = await db.query(
      `SELECT a.*, p.title AS property_title, p.status AS property_status
       FROM admin_appeals a
       LEFT JOIN properties p ON p.id = a.property_id
       WHERE a.appellant_id = $1
       ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    const count = await db.query(
      'SELECT COUNT(*) AS total FROM admin_appeals WHERE appellant_id = $1',
      [req.user.id]
    );
    res.json({ data: result.rows, total: parseInt(count.rows[0].total) });
  } catch (err) {
    req.logger.error('Get my appeals error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/appeals', authenticate, async (req, res) => {
  try {
    if (!canReviewAppeal(req.user)) {
      return res.status(403).json({ message: 'Only state admins and super admins can view appeals' });
    }
    const { status, appeal_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let conditions = [];
    let params = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`a.status = $${paramIdx++}`);
      params.push(status);
    }
    if (appeal_type) {
      conditions.push(`a.appeal_type = $${paramIdx++}`);
      params.push(appeal_type);
    }
    if (!isSuperAdmin(req.user.user_type)) {
      conditions.push(
        `(a.property_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM properties p2 WHERE p2.id = a.property_id
          AND LOWER(TRIM(p2.state)) = LOWER(TRIM($${paramIdx}))
        ) OR a.target_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM users u2 WHERE u2.id = a.target_user_id
          AND LOWER(TRIM(u2.assigned_state)) = LOWER(TRIM($${paramIdx}))
        ))`
      );
      params.push(req.user.assigned_state);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await db.query(
      `SELECT a.*,
              p.title AS property_title, p.status AS property_status, p.state AS property_state,
              appellant.full_name AS appellant_name, appellant.email AS appellant_email,
              reviewer.full_name AS reviewer_name
       FROM admin_appeals a
       LEFT JOIN properties p ON p.id = a.property_id
       LEFT JOIN users appellant ON appellant.id = a.appellant_id
       LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
       ${where}
       ORDER BY a.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );
    const count = await db.query(
      `SELECT COUNT(*) AS total FROM admin_appeals a ${where}`,
      params
    );
    res.json({ data: result.rows, total: parseInt(count.rows[0].total) });
  } catch (err) {
    req.logger.error('Get appeals error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/appeals/:id', authenticate, async (req, res) => {
  try {
    if (!canReviewAppeal(req.user)) {
      return res.status(403).json({ message: 'Only state admins and super admins can view appeals' });
    }
    const result = await db.query(
      `SELECT a.*,
              p.title AS property_title, p.status AS property_status, p.state AS property_state,
              p.description AS property_description, p.rent_amount, p.property_type,
              p.bedrooms, p.bathrooms, p.city, p.area, p.lga_name,
              p.rejection_reason AS current_rejection_reason,
              appellant.full_name AS appellant_name, appellant.email AS appellant_email,
              appellant.phone AS appellant_phone,
              reviewer.full_name AS reviewer_name,
              original_admin.full_name AS original_admin_name
       FROM admin_appeals a
       LEFT JOIN properties p ON p.id = a.property_id
       LEFT JOIN users appellant ON appellant.id = a.appellant_id
       LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
       LEFT JOIN users original_admin ON original_admin.id = a.original_decision_maker_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Appeal not found' });
    }
    const appeal = result.rows[0];
    if (!isSuperAdmin(req.user.user_type) && appeal.property_state) {
      const stateMatch = await canReviewForState(req.user, appeal.property_state);
      if (!stateMatch) {
        return res.status(403).json({ message: 'This appeal is outside your jurisdiction' });
      }
    }
    res.json({ data: appeal });
  } catch (err) {
    req.logger.error('Get appeal error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/admin/appeals/:id/review', authenticate, async (req, res) => {
  try {
    if (!canReviewAppeal(req.user)) {
      return res.status(403).json({ message: 'Only state admins and super admins can review appeals' });
    }
    const { status: newStatus, review_note } = req.body;
    if (!newStatus || !['upheld', 'dismissed'].includes(newStatus)) {
      return res.status(400).json({ message: 'Status must be upheld or dismissed' });
    }

    const appeal = await db.query(
      `SELECT a.*, p.state AS property_state, p.landlord_id, p.rejection_reason
       FROM admin_appeals a
       LEFT JOIN properties p ON p.id = a.property_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!appeal.rows.length) {
      return res.status(404).json({ message: 'Appeal not found' });
    }
    const a = appeal.rows[0];
    if (!['pending', 'under_review'].includes(a.status)) {
      return res.status(400).json({ message: 'Appeal has already been resolved' });
    }
    if (!isSuperAdmin(req.user.user_type) && a.property_state) {
      const stateMatch = await canReviewForState(req.user, a.property_state);
      if (!stateMatch) {
        return res.status(403).json({ message: 'This appeal is outside your jurisdiction' });
      }
    }

    const result = await db.query(
      `UPDATE admin_appeals
       SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [newStatus, review_note || null, req.user.id, req.params.id]
    );

    if (newStatus === 'upheld') {
      if (a.appeal_type === 'property' && a.property_id) {
        await db.query(
          `UPDATE properties
           SET is_verified = TRUE, status = 'available', verified_by = $1, verified_at = NOW(), rejection_reason = NULL
           WHERE id = $2 AND deleted_at IS NULL`,
          [req.user.id, a.property_id]
        );
        await db.query(
          `INSERT INTO property_operations (property_id, actor_id, actor_name, event_type, note, metadata)
           VALUES ($1, $2, $3, 'appeal_upheld', $4, $5)`,
          [a.property_id, req.user.id, req.user.full_name || 'Admin',
           'Property reinstated via appeal', JSON.stringify({ appeal_id: a.id })]
        );
      } else if (a.appeal_type === 'verification' && a.target_user_id) {
        await db.query(
          `UPDATE users
           SET identity_verified = TRUE, identity_verification_status = 'verified',
               identity_verified_by = $1, identity_verified_at = NOW(), updated_at = NOW()
           WHERE id = $2 AND deleted_at IS NULL`,
          [req.user.id, a.target_user_id]
        );
        await db.query(
          `INSERT INTO identity_verification_operations (user_id, actor_id, actor_name, event_type, note, metadata)
           VALUES ($1, $2, $3, 'appeal_upheld', $4, $5)`,
          [a.target_user_id, req.user.id, req.user.full_name || 'Admin',
           'Verification reinstated via appeal', JSON.stringify({ appeal_id: a.id })]
        );
      }
    }

    await createNotification(a.appellant_id, 'appeal',
      newStatus === 'upheld' ? 'Appeal Upheld' : 'Appeal Dismissed',
      newStatus === 'upheld'
        ? `Your appeal for ${a.appeal_type === 'property' ? 'property #' + a.property_id : 'identity verification'} has been upheld and resolved.`
        : `Your appeal for ${a.appeal_type === 'property' ? 'property #' + a.property_id : 'identity verification'} has been dismissed. Reason: ${review_note || 'No additional reason provided.'}`,
      a.appeal_type === 'property' ? `/properties/${a.property_id}` : '/verification-status'
    );

    res.json({ message: 'Appeal reviewed', data: result.rows[0] });
  } catch (err) {
    req.logger.error('Review appeal error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/admin/appeals/:id/status', authenticate, async (req, res) => {
  try {
    if (!canReviewAppeal(req.user)) {
      return res.status(403).json({ message: 'Only state admins and super admins can update appeals' });
    }
    const { status: newStatus } = req.body;
    if (!newStatus || !STATUS_TRANSITIONS['pending']?.includes(newStatus)) {
      return res.status(400).json({ message: 'Invalid status transition' });
    }
    const result = await db.query(
      `UPDATE admin_appeals SET status = $1, updated_at = NOW() WHERE id = $2 AND status = 'pending' RETURNING *`,
      [newStatus, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(400).json({ message: 'Appeal not found or cannot transition from current status' });
    }
    res.json({ message: 'Appeal status updated', data: result.rows[0] });
  } catch (err) {
    req.logger.error('Update appeal status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
