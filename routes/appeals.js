const express = require('express');
const crypto = require('crypto');
const { body, param } = require('express-validator');
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const { createNotification } = require('../config/utils/notificationService');

const router = express.Router();

const APPEAL_TYPES = new Set(['property', 'verification']);
const APPEAL_STATUSES = new Set(['pending', 'under_review', 'upheld', 'dismissed']);
const FINAL_APPEAL_STATUSES = new Set(['upheld', 'dismissed']);
const STATE_APPEAL_REVIEW_ROLES = new Set(['state_admin']);
const SUPER_APPEAL_REVIEW_ROLES = new Set(['super_admin']);

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const stripTags = (value) => (
  value ? String(value).replace(/<[^>]*>/g, '') : value
);

const parsePositiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

const createAppealError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendAppealError = (req, res, error, logMessage, fallbackMessage) => {
  req.logger.error(logMessage, error);
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
};

const isSuperAppealReviewer = (user) =>
  SUPER_APPEAL_REVIEW_ROLES.has(normalizeText(user?.user_type || user?.userType));

const isStateAppealReviewer = (user) =>
  STATE_APPEAL_REVIEW_ROLES.has(normalizeText(user?.user_type || user?.userType));

const canReviewAppeal = (user) =>
  isSuperAppealReviewer(user) || isStateAppealReviewer(user);

const requireAppealReviewer = (req, res, next) => {
  if (canReviewAppeal(req.user)) return next();
  return res.status(403).json({
    success: false,
    message: 'Only state administrators and super administrators can review appeals',
  });
};

const getCurrentReviewerState = async (queryable, user) => {
  if (isSuperAppealReviewer(user)) return null;
  if (!isStateAppealReviewer(user)) {
    const error = new Error('Appeal reviewer access required');
    error.statusCode = 403;
    throw error;
  }

  const result = await queryable.query(
    `SELECT assigned_state
     FROM users
     WHERE id = $1
       AND user_type = 'state_admin'
       AND deleted_at IS NULL
     LIMIT 1`,
    [user.id]
  );
  const assignedState = String(result.rows[0]?.assigned_state || '').trim();
  if (!assignedState) {
    const error = new Error('State administrator account is missing assigned_state');
    error.statusCode = 403;
    throw error;
  }
  return assignedState;
};

const assertAppealJurisdiction = async (queryable, user, appealState) => {
  if (isSuperAppealReviewer(user)) return;
  const reviewerState = await getCurrentReviewerState(queryable, user);
  if (!appealState || normalizeText(reviewerState) !== normalizeText(appealState)) {
    const error = new Error('This appeal is outside your assigned state');
    error.statusCode = 403;
    throw error;
  }
};

const assertIndependentReviewer = (user, appeal) => {
  const reviewerId = Number(user?.id);
  if (
    reviewerId === Number(appeal?.appellant_id) ||
    reviewerId === Number(appeal?.original_decision_maker_id)
  ) {
    throw createAppealError(
      403,
      'This appeal must be handled by an independent administrator'
    );
  }
};

const appealDetailsQuery = ({ forUpdate = false } = {}) => `
  SELECT
    a.*,
    p.title AS property_title,
    p.status AS property_status,
    ps.state_name AS property_state,
    p.description AS property_description,
    p.rent_amount,
    p.property_type,
    p.bedrooms,
    p.bathrooms,
    p.city,
    p.area,
    p.lga_name,
    p.landlord_id,
    p.rejection_reason AS current_rejection_reason,
    appellant.full_name AS appellant_name,
    appellant.email AS appellant_email,
    appellant.phone AS appellant_phone,
    reviewer.full_name AS reviewer_name,
    original_admin.full_name AS original_admin_name,
    a.jurisdiction_state AS appeal_state
  FROM admin_appeals a
  LEFT JOIN properties p ON p.id = a.property_id
  LEFT JOIN states ps ON ps.id = p.state_id
  LEFT JOIN users target_user ON target_user.id = a.target_user_id
  LEFT JOIN states target_state ON target_state.id = target_user.preferred_state_id
  LEFT JOIN users appellant ON appellant.id = a.appellant_id
  LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
  LEFT JOIN users original_admin ON original_admin.id = a.original_decision_maker_id
  WHERE a.id = $1
  ${forUpdate ? 'FOR UPDATE OF a' : ''}
`;

const sendAppealNotification = async ({
  logger,
  userId,
  title,
  message,
  link,
}) => {
  try {
    await createNotification(userId, 'appeal', title, message, link);
  } catch (error) {
    logger?.error?.('Appeal notification error:', error);
  }
};

const notifyAppealReviewers = async ({
  logger,
  state,
  title,
  message,
  link,
}) => {
  try {
    const admins = await db.query(
      `SELECT id
       FROM users
       WHERE deleted_at IS NULL
         AND (
           user_type = 'super_admin'
           OR (
             $1::text IS NOT NULL
             AND user_type = 'state_admin'
             AND LOWER(TRIM(assigned_state)) = LOWER(TRIM($1))
           )
         )`,
      [state || null]
    );
    await Promise.all(
      admins.rows.map((admin) =>
        sendAppealNotification({
          logger,
          userId: admin.id,
          title,
          message,
          link,
        })
      )
    );
  } catch (error) {
    logger?.error?.('Appeal reviewer notification error:', error);
  }
};

const appendAppealAudit = async (
  client,
  { actorId, action, targetId, metadata = {} }
) => {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('rentalhub_audit_log_chain'))`
  );
  const previousResult = await client.query(
    `SELECT current_hash
     FROM audit_logs
     ORDER BY id DESC
     LIMIT 1`
  );
  const previousHash = previousResult.rows[0]?.current_hash || 'GENESIS';
  const inserted = await client.query(
    `INSERT INTO audit_logs (
       actor_id,
       action,
       target_type,
       target_id,
       metadata,
       previous_hash,
       current_hash
     )
     VALUES ($1, $2, 'admin_appeal', $3, $4::jsonb, $5, NULL)
     RETURNING id, actor_id, action, target_type, target_id, created_at`,
    [
      actorId,
      action,
      targetId,
      JSON.stringify(metadata || {}),
      previousHash,
    ]
  );
  const entry = inserted.rows[0];
  const dataString =
    entry.actor_id +
    entry.action +
    entry.target_type +
    entry.target_id +
    entry.created_at.toISOString() +
    previousHash;
  const currentHash = crypto.createHash('sha256').update(dataString).digest('hex');
  await client.query(
    `UPDATE audit_logs
     SET current_hash = $1
     WHERE id = $2`,
    [currentHash, entry.id]
  );
};

const lockAndAssertAppealTarget = async (client, user, appeal) => {
  let result;
  if (appeal.appeal_type === 'property' && appeal.property_id) {
    result = await client.query(
      `SELECT
         p.id,
         p.status,
         p.is_verified,
         p.deleted_at,
         s.state_name AS target_state
       FROM properties p
       LEFT JOIN states s ON s.id = p.state_id
       WHERE p.id = $1
       FOR UPDATE OF p`,
      [appeal.property_id]
    );
    const target = result.rows[0];
    if (!target || target.deleted_at) {
      throw createAppealError(409, 'The appealed property is no longer available');
    }
    if (normalizeText(target.status) !== 'rejected' || target.is_verified === true) {
      throw createAppealError(
        409,
        'The property decision changed after this appeal was submitted'
      );
    }
    if (
      !isSuperAppealReviewer(user) &&
      normalizeText(target.target_state) !== normalizeText(appeal.appeal_state)
    ) {
      throw createAppealError(
        409,
        'The property jurisdiction changed; super administrator review is required'
      );
    }
    return target;
  }

  if (appeal.appeal_type === 'verification' && appeal.target_user_id) {
    result = await client.query(
      `SELECT
         u.id,
         u.identity_verification_status,
         u.identity_verified,
         u.deleted_at,
         COALESCE(s.state_name, u.assigned_state) AS target_state
       FROM users u
       LEFT JOIN states s ON s.id = u.preferred_state_id
       WHERE u.id = $1
       FOR UPDATE OF u`,
      [appeal.target_user_id]
    );
    const target = result.rows[0];
    if (!target || target.deleted_at) {
      throw createAppealError(409, 'The appealed user account is no longer available');
    }
    if (
      normalizeText(target.identity_verification_status) !== 'rejected' ||
      target.identity_verified === true
    ) {
      throw createAppealError(
        409,
        'The verification decision changed after this appeal was submitted'
      );
    }
    if (
      !isSuperAppealReviewer(user) &&
      normalizeText(target.target_state) !== normalizeText(appeal.appeal_state)
    ) {
      throw createAppealError(
        409,
        'The user jurisdiction changed; super administrator review is required'
      );
    }
    return target;
  }

  throw createAppealError(409, 'Appeal target no longer exists');
};

router.post(
  '/appeals',
  authenticate,
  [
    body('appeal_type').isIn([...APPEAL_TYPES]),
    body('appeal_reason')
      .trim()
      .customSanitizer(stripTags)
      .trim()
      .isLength({ min: 1, max: 5000 }),
    body('additional_info')
      .optional({ checkFalsy: true })
      .trim()
      .customSanitizer(stripTags)
      .isLength({ max: 10000 }),
    body('property_id').optional({ checkFalsy: true }).isInt({ min: 1 }),
    body('target_user_id').optional({ checkFalsy: true }).isInt({ min: 1 }),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const {
        appeal_type,
        property_id,
        target_user_id,
        appeal_reason,
        additional_info,
      } = req.body;
      const appellantId = Number(req.user.id);

      if (appeal_type === 'property') {
        if (!property_id) {
          return res.status(400).json({
            success: false,
            message: 'property_id is required for property appeals',
          });
        }

        const propertyResult = await db.query(
          `SELECT
             p.id,
             p.status,
             p.rejection_reason,
             p.verified_by,
             p.landlord_id,
             s.state_name AS property_state
           FROM properties p
           LEFT JOIN states s ON s.id = p.state_id
           WHERE p.id = $1
             AND p.deleted_at IS NULL`,
          [property_id]
        );
        const property = propertyResult.rows[0];
        if (!property) {
          return res.status(404).json({ success: false, message: 'Property not found' });
        }
        if (property.status !== 'rejected') {
          return res.status(400).json({
            success: false,
            message: 'Only rejected properties can be appealed',
          });
        }
        if (Number(property.landlord_id) !== appellantId) {
          return res.status(403).json({
            success: false,
            message: 'You can only appeal your own property',
          });
        }

        const existing = await db.query(
          `SELECT id
           FROM admin_appeals
           WHERE appeal_type = 'property'
             AND property_id = $1
             AND appellant_id = $2
             AND status IN ('pending', 'under_review')
           LIMIT 1`,
          [property_id, appellantId]
        );
        if (existing.rows.length) {
          return res.status(409).json({
            success: false,
            message: 'You already have an active appeal for this property',
          });
        }

        const result = await db.query(
          `INSERT INTO admin_appeals (
             appeal_type,
             property_id,
             appellant_id,
             original_decision_maker_id,
             original_rejection_reason,
             appeal_reason,
             additional_info
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            appeal_type,
            property_id,
            appellantId,
            property.verified_by,
            property.rejection_reason,
            appeal_reason,
            additional_info || null,
          ]
        );
        const appeal = result.rows[0];

        if (property.property_state) {
          const admins = await db.query(
            `SELECT id
             FROM users
             WHERE user_type = 'state_admin'
               AND LOWER(TRIM(assigned_state)) = LOWER(TRIM($1))
               AND deleted_at IS NULL`,
            [property.property_state]
          );
          await Promise.all(
            admins.rows.map((admin) =>
              sendAppealNotification({
                logger: req.logger,
                userId: admin.id,
                title: 'New Property Appeal',
                message: `A property owner appealed the rejection of property #${property_id}.`,
                link: `/admin/appeals/${appeal.id}`,
              })
            )
          );
        }

        return res.status(201).json({
          success: true,
          message: 'Appeal submitted',
          data: appeal,
        });
      }

      if (!target_user_id) {
        return res.status(400).json({
          success: false,
          message: 'target_user_id is required for verification appeals',
        });
      }
      if (Number(target_user_id) !== appellantId) {
        return res.status(403).json({
          success: false,
          message: 'You can only appeal your own verification',
        });
      }

      const targetResult = await db.query(
        `SELECT
           u.id,
           u.identity_verification_status,
           u.identity_verified_by,
           COALESCE(s.state_name, u.assigned_state) AS user_state
         FROM users u
         LEFT JOIN states s ON s.id = u.preferred_state_id
         WHERE u.id = $1
           AND u.deleted_at IS NULL`,
        [target_user_id]
      );
      const targetUser = targetResult.rows[0];
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      if (targetUser.identity_verification_status !== 'rejected') {
        return res.status(400).json({
          success: false,
          message: 'Only rejected verifications can be appealed',
        });
      }

      const existing = await db.query(
        `SELECT id
         FROM admin_appeals
         WHERE appeal_type = 'verification'
           AND target_user_id = $1
           AND appellant_id = $2
           AND status IN ('pending', 'under_review')
         LIMIT 1`,
        [target_user_id, appellantId]
      );
      if (existing.rows.length) {
        return res.status(409).json({
          success: false,
          message: 'You already have an active verification appeal',
        });
      }

      const result = await db.query(
        `INSERT INTO admin_appeals (
           appeal_type,
           target_user_id,
           appellant_id,
           original_decision_maker_id,
           original_rejection_reason,
           appeal_reason,
           additional_info
         )
         VALUES ($1, $2, $3, $4, NULL, $5, $6)
         RETURNING *`,
        [
          appeal_type,
          target_user_id,
          appellantId,
          targetUser.identity_verified_by,
          appeal_reason,
          additional_info || null,
        ]
      );
      const appeal = result.rows[0];

      if (targetUser.user_state) {
        const admins = await db.query(
          `SELECT id
           FROM users
           WHERE user_type = 'state_admin'
             AND LOWER(TRIM(assigned_state)) = LOWER(TRIM($1))
             AND deleted_at IS NULL`,
          [targetUser.user_state]
        );
        await Promise.all(
          admins.rows.map((admin) =>
            sendAppealNotification({
              logger: req.logger,
              userId: admin.id,
              title: 'New Verification Appeal',
              message: 'A user appealed an identity-verification rejection.',
              link: `/admin/appeals/${appeal.id}`,
            })
          )
        );
      }

      return res.status(201).json({
        success: true,
        message: 'Appeal submitted',
        data: appeal,
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'An active appeal already exists for this decision',
        });
      }
      req.logger.error('Submit appeal error:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

router.get('/appeals/my', authenticate, async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;
    const [result, count] = await Promise.all([
      db.query(
        `SELECT a.*, p.title AS property_title, p.status AS property_status
         FROM admin_appeals a
         LEFT JOIN properties p ON p.id = a.property_id
         WHERE a.appellant_id = $1
         ORDER BY a.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
      db.query(
        'SELECT COUNT(*) AS total FROM admin_appeals WHERE appellant_id = $1',
        [req.user.id]
      ),
    ]);
    return res.json({
      success: true,
      data: result.rows,
      total: Number(count.rows[0]?.total || 0),
      pagination: { page, limit },
    });
  } catch (error) {
    req.logger.error('Get my appeals error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/admin/appeals', authenticate, requireAppealReviewer, async (req, res) => {
  try {
    const status = normalizeText(req.query.status);
    const appealType = normalizeText(req.query.appeal_type);
    if (status && !APPEAL_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid appeal status' });
    }
    if (appealType && !APPEAL_TYPES.has(appealType)) {
      return res.status(400).json({ success: false, message: 'Invalid appeal type' });
    }

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (appealType) {
      params.push(appealType);
      conditions.push(`a.appeal_type = $${params.length}`);
    }

    const reviewerState = await getCurrentReviewerState(db, req.user);
    if (reviewerState) {
      params.push(reviewerState);
      const stateParam = params.length;
      conditions.push(`(
        (
          a.property_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM properties scoped_property
            JOIN states scoped_property_state
              ON scoped_property_state.id = scoped_property.state_id
            WHERE scoped_property.id = a.property_id
              AND LOWER(TRIM(scoped_property_state.state_name)) =
                  LOWER(TRIM($${stateParam}))
          )
        )
        OR
        (
          a.target_user_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM users scoped_user
            LEFT JOIN states scoped_user_state
              ON scoped_user_state.id = scoped_user.preferred_state_id
            WHERE scoped_user.id = a.target_user_id
              AND LOWER(TRIM(COALESCE(
                scoped_user_state.state_name,
                scoped_user.assigned_state
              ))) = LOWER(TRIM($${stateParam}))
          )
        )
      )`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataParams = [...params, limit, offset];
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const [result, count] = await Promise.all([
      db.query(
        `SELECT
           a.*,
           p.title AS property_title,
           p.status AS property_status,
           ps.state_name AS property_state,
           appellant.full_name AS appellant_name,
           appellant.email AS appellant_email,
           reviewer.full_name AS reviewer_name,
           COALESCE(ps.state_name, target_state.state_name, target_user.assigned_state) AS appeal_state
         FROM admin_appeals a
         LEFT JOIN properties p ON p.id = a.property_id
         LEFT JOIN states ps ON ps.id = p.state_id
         LEFT JOIN users target_user ON target_user.id = a.target_user_id
         LEFT JOIN states target_state ON target_state.id = target_user.preferred_state_id
         LEFT JOIN users appellant ON appellant.id = a.appellant_id
         LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        dataParams
      ),
      db.query(`SELECT COUNT(*) AS total FROM admin_appeals a ${whereClause}`, params),
    ]);

    return res.json({
      success: true,
      data: result.rows,
      total: Number(count.rows[0]?.total || 0),
      pagination: { page, limit },
    });
  } catch (error) {
    req.logger.error('Get appeals error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
});

router.get(
  '/admin/appeals/:id',
  authenticate,
  requireAppealReviewer,
  [param('id').isInt({ min: 1 })],
  validateRequest,
  async (req, res) => {
    try {
      const result = await db.query(appealDetailsQuery(), [req.params.id]);
      const appeal = result.rows[0];
      if (!appeal) {
        return res.status(404).json({ success: false, message: 'Appeal not found' });
      }
      await assertAppealJurisdiction(db, req.user, appeal.appeal_state);
      return res.json({ success: true, data: appeal });
    } catch (error) {
      req.logger.error('Get appeal error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Server error',
      });
    }
  }
);

router.post(
  '/admin/appeals/:id/review',
  authenticate,
  requireAppealReviewer,
  [
    param('id').isInt({ min: 1 }),
    body('status').isIn([...FINAL_APPEAL_STATUSES]),
    body('review_note').isString().trim().isLength({ min: 1, max: 5000 }),
  ],
  validateRequest,
  async (req, res) => {
    let client;
    let committed = false;
    let notification = null;
    try {
      client = await db.connect();
      await client.query('BEGIN');
      const appealResult = await client.query(
        appealDetailsQuery({ forUpdate: true }),
        [req.params.id]
      );
      const appeal = appealResult.rows[0];
      if (!appeal) {
        const error = new Error('Appeal not found');
        error.statusCode = 404;
        throw error;
      }
      if (!['pending', 'under_review'].includes(appeal.status)) {
        const error = new Error('Appeal has already been resolved');
        error.statusCode = 409;
        throw error;
      }
      await assertAppealJurisdiction(client, req.user, appeal.appeal_state);

      const result = await client.query(
        `UPDATE admin_appeals
         SET status = $1,
             review_note = $2,
             reviewed_by = $3,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = $4
           AND status IN ('pending', 'under_review')
         RETURNING *`,
        [req.body.status, req.body.review_note, req.user.id, req.params.id]
      );
      if (!result.rows.length) {
        const error = new Error('Appeal was changed by another reviewer');
        error.statusCode = 409;
        throw error;
      }

      if (req.body.status === 'upheld') {
        if (appeal.appeal_type === 'property' && appeal.property_id) {
          await client.query(
            `UPDATE properties
             SET is_verified = TRUE,
                 status = 'available',
                 verified_by = $1,
                 verified_at = NOW(),
                 rejection_reason = NULL
             WHERE id = $2
               AND deleted_at IS NULL`,
            [req.user.id, appeal.property_id]
          );
          await client.query(
            `INSERT INTO property_operations (
               property_id,
               actor_id,
               actor_name,
               event_type,
               note,
               metadata
             )
             VALUES ($1, $2, $3, 'appeal_upheld', $4, $5::jsonb)`,
            [
              appeal.property_id,
              req.user.id,
              req.user.full_name || req.user.email || 'Administrator',
              req.body.review_note,
              JSON.stringify({ appeal_id: appeal.id }),
            ]
          );
        } else if (appeal.appeal_type === 'verification' && appeal.target_user_id) {
          await client.query(
            `UPDATE users
             SET identity_verified = TRUE,
                 identity_verification_status = 'verified',
                 identity_verified_by = $1,
                 identity_verified_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2
               AND deleted_at IS NULL`,
            [req.user.id, appeal.target_user_id]
          );
          await client.query(
            `INSERT INTO identity_verification_operations (
               user_id,
               actor_id,
               actor_name,
               event_type,
               note,
               metadata
             )
             VALUES ($1, $2, $3, 'appeal_upheld', $4, $5::jsonb)`,
            [
              appeal.target_user_id,
              req.user.id,
              req.user.full_name || req.user.email || 'Administrator',
              req.body.review_note,
              JSON.stringify({ appeal_id: appeal.id }),
            ]
          );
        } else {
          const error = new Error('Appeal target no longer exists');
          error.statusCode = 409;
          throw error;
        }
      }

      await client.query(
        `INSERT INTO audit_logs (
           actor_id,
           action,
           target_type,
           target_id,
           metadata
         )
         VALUES ($1, $2, 'admin_appeal', $3, $4::jsonb)`,
        [
          req.user.id,
          `Appeal ${req.body.status}`,
          appeal.id,
          JSON.stringify({
            appeal_type: appeal.appeal_type,
            review_note: req.body.review_note,
          }),
        ]
      );

      await client.query('COMMIT');
      committed = true;
      notification = {
        userId: appeal.appellant_id,
        title: req.body.status === 'upheld' ? 'Appeal Upheld' : 'Appeal Dismissed',
        message:
          req.body.status === 'upheld'
            ? `Your ${appeal.appeal_type} appeal was upheld and resolved.`
            : `Your ${appeal.appeal_type} appeal was dismissed. ${req.body.review_note}`,
        link:
          appeal.appeal_type === 'property' && appeal.property_id
            ? `/properties/${appeal.property_id}`
            : '/verification-status',
      };

      await sendAppealNotification({ logger: req.logger, ...notification });
      return res.json({
        success: true,
        message: 'Appeal reviewed',
        data: result.rows[0],
      });
    } catch (error) {
      if (client && !committed) {
        await client.query('ROLLBACK').catch(() => {});
      }
      req.logger.error('Review appeal error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Server error',
      });
    } finally {
      client?.release();
    }
  }
);

router.patch(
  '/admin/appeals/:id/status',
  authenticate,
  requireAppealReviewer,
  [
    param('id').isInt({ min: 1 }),
    body('status').equals('under_review'),
  ],
  validateRequest,
  async (req, res) => {
    let client;
    try {
      client = await db.connect();
      await client.query('BEGIN');
      const appealResult = await client.query(
        appealDetailsQuery({ forUpdate: true }),
        [req.params.id]
      );
      const appeal = appealResult.rows[0];
      if (!appeal) {
        const error = new Error('Appeal not found');
        error.statusCode = 404;
        throw error;
      }
      if (appeal.status !== 'pending') {
        const error = new Error('Appeal cannot transition from its current status');
        error.statusCode = 409;
        throw error;
      }
      await assertAppealJurisdiction(client, req.user, appeal.appeal_state);

      const result = await client.query(
        `UPDATE admin_appeals
         SET status = 'under_review',
             updated_at = NOW()
         WHERE id = $1
           AND status = 'pending'
         RETURNING *`,
        [req.params.id]
      );
      if (!result.rows.length) {
        const error = new Error('Appeal was changed by another reviewer');
        error.statusCode = 409;
        throw error;
      }

      await client.query(
        `INSERT INTO audit_logs (
           actor_id,
           action,
           target_type,
           target_id,
           metadata
         )
         VALUES ($1, 'Appeal marked under review', 'admin_appeal', $2, $3::jsonb)`,
        [
          req.user.id,
          appeal.id,
          JSON.stringify({ appeal_type: appeal.appeal_type }),
        ]
      );

      await client.query('COMMIT');
      return res.json({
        success: true,
        message: 'Appeal status updated',
        data: result.rows[0],
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {});
      }
      req.logger.error('Update appeal status error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Server error',
      });
    } finally {
      client?.release();
    }
  }
);

router._appealScopeForTest = {
  canReviewAppeal,
  parsePositiveInteger,
};

module.exports = router;
