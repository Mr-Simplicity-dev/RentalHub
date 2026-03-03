const db = require('../config/middleware/database');

exports.canAccessProperty = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { propertyId } = req.params;

    const result = await db.query(
      `SELECT id FROM properties
       WHERE id = $1
       AND (owner_id = $2 OR tenant_id = $2)`,
      [propertyId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this property'
      });
    }

    next();
  } catch (error) {
    console.error('Property access error:', error);
    res.status(500).json({
      success: false,
      message: 'Permission check failed'
    });
  }
};