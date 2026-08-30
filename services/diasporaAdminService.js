/**
 * Diaspora registration admin review queue.
 *
 * Phase 3: gives super/financial admins visibility over diaspora accounts —
 * their target state, funding card country/brand, the Nigerian-funded review
 * flag (set when a diaspora registration was paid with a Nigerian-issued
 * card and diaspora_require_foreign_card was off), and dismissal tracking.
 */

const db = require('../config/middleware/database');

const DIASPORA_ADMIN_ROLES = [
  'super_admin',
  'super_financial_admin',
  'financial_admin',
  'state_financial_admin',
  'lga_financial_admin',
  'super_support_admin',
];

const ensureSchema = async () => {
  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS diaspora_review_dismissed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS diaspora_review_notes TEXT
  `);
};

exports.getDiasporaAdminOverview = async (req, res) => {
  try {
    await ensureSchema();

    const statsResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE u.diaspora_country IS NOT NULL) AS total_diaspora,
         COUNT(*) FILTER (
           WHERE u.diaspora_country IS NOT NULL
             AND COALESCE(u.billing_country, '') = 'NG'
             AND u.diaspora_review_dismissed_at IS NULL
         ) AS nigerian_funded_pending,
         COUNT(*) FILTER (
           WHERE u.diaspora_country IS NOT NULL
             AND COALESCE(u.billing_country, '') = 'NG'
         ) AS nigerian_funded_total
       FROM users u
       WHERE u.deleted_at IS NULL`
    );

    const usersResult = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone,
              u.diaspora_country,
              u.billing_country,
              u.card_brand,
              u.identity_verified,
              u.identity_verification_status,
              u.diaspora_review_dismissed_at,
              u.diaspora_review_notes,
              u.created_at,
              s.state_name AS preferred_state_name
       FROM users u
       LEFT JOIN states s ON s.id = u.preferred_state_id
       WHERE u.deleted_at IS NULL
         AND u.diaspora_country IS NOT NULL
       ORDER BY u.created_at DESC
       LIMIT 500`
    );

    const rows = usersResult.rows.map((row) => ({
      ...row,
      review_flag: String(row.billing_country || '').toUpperCase() === 'NG' && !row.diaspora_review_dismissed_at,
      reviewed: row.diaspora_review_dismissed_at ? true : false,
    }));

    return res.json({
      success: true,
      data: {
        stats: statsResult.rows[0] || {
          total_diaspora: 0,
          nigerian_funded_pending: 0,
          nigerian_funded_total: 0,
        },
        users: rows,
      },
    });
  } catch (error) {
    req.logger.error('Diaspora admin overview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load diaspora overview' });
  }
};

exports.dismissDiasporaReviewFlag = async (req, res) => {
  try {
    await ensureSchema();

    const { userId } = req.params;
    const notes = String(req.body?.notes || '').trim().slice(0, 2000);

    const result = await db.query(
      `UPDATE users
       SET diaspora_review_dismissed_at = CURRENT_TIMESTAMP,
           diaspora_review_notes = $1
       WHERE id = $2
         AND diaspora_country IS NOT NULL
       RETURNING id, full_name, diaspora_review_dismissed_at, diaspora_review_notes`,
      [notes || null, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Diaspora user not found' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    req.logger.error('Dismiss diaspora flag error:', error);
    return res.status(500).json({ success: false, message: 'Failed to dismiss review flag' });
  }
};

exports.requireDiasporaAdmin = (req, res, next) => {
  if (!DIASPORA_ADMIN_ROLES.includes(req.user?.user_type)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};
