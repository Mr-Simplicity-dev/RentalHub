const db = require('./database');

exports.canLawyerAccessProperty = async (req, res, next) => {
  try {
    const lawyerId = req.user.id;
    const { propertyId } = req.params;

    if (req.user.user_type !== 'lawyer') {
      return res.status(403).json({
        success: false,
        message: 'Only lawyers can access this endpoint'
      });
    }

    const result = await db.query(
      `SELECT 1
       FROM legal_authorizations la
       WHERE la.lawyer_user_id = $2
         AND la.status = 'active'
         AND (
           la.property_id = $1
           OR (
             la.property_id IS NULL
             AND EXISTS (
               SELECT 1
               FROM disputes d
               WHERE d.property_id = $1
                 AND la.client_user_id IN (d.opened_by, d.against_user)
             )
           )
         )
       LIMIT 1`,
      [propertyId, lawyerId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No legal authorization found'
      });
    }

    next();
  } catch (error) {
    console.error('Legal access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Legal access validation failed'
    });
  }
};
