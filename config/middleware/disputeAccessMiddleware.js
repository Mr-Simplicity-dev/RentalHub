const db = require('./database');

exports.canAccessDispute = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { disputeId } = req.params;

    if (req.user.user_type === 'lawyer') {
      const lawyerAccess = await db.query(
        `SELECT d.id
         FROM disputes d
         JOIN legal_authorizations la
           ON la.status = 'active'
          AND la.lawyer_user_id = $2
          AND (
            la.property_id = d.property_id
            OR (
              la.property_id IS NULL
              AND la.client_user_id IN (d.opened_by, d.against_user)
            )
          )
         WHERE d.id = $1
         LIMIT 1`,
        [disputeId, userId]
      );

      if (lawyerAccess.rows.length > 0) {
        return next();
      }
    }

    const result = await db.query(
      `SELECT id FROM disputes
       WHERE id = $1
       AND (opened_by = $2 OR against_user = $2)`,
      [disputeId, userId]
    );

    if (result.rows.length === 0 && req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this dispute'
      });
    }

    next();
  } catch (error) {
    console.error('Dispute access error:', error);
    res.status(500).json({
      success: false,
      message: 'Permission check failed'
    });
  }
};
