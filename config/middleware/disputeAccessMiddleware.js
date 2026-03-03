const db = require('../config/middleware/database');

exports.canAccessDispute = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { disputeId } = req.params;

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