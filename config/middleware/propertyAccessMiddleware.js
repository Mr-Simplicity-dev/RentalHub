const logger = require('../utils/logger');
const db = require('./database');

// Verifies the requester is connected to the property as its landlord/owner,
// or as a tenant with an approved application. Previously this queried
// owner_id/tenant_id columns that no code path writes, which made the check
// always fail (or worse, trust stale data).
exports.canAccessProperty = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { propertyId } = req.params;

    const result = await db.query(
      `SELECT id FROM properties
       WHERE id = $1
         AND deleted_at IS NULL
         AND (
           landlord_id = $2
           OR user_id = $2
           OR EXISTS (
             SELECT 1 FROM applications a
             WHERE a.property_id = properties.id
               AND a.tenant_id = $2
               AND a.status = 'approved'
           )
         )
       LIMIT 1`,
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
    logger.error('Property access error:', error);
    res.status(500).json({
      success: false,
      message: 'Permission check failed'
    });
  }
};
