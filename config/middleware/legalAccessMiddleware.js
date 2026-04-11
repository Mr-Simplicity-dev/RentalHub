const db = require('./database');
const { statesMatch } = require('../utils/stateScope');

exports.canLawyerAccessProperty = async (req, res, next) => {
  try {
    const lawyerId = req.user.id;
    const { propertyId } = req.params;
    const allowedLawyerRoles = ['lawyer', 'state_lawyer', 'super_lawyer'];

    if (!allowedLawyerRoles.includes(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Only lawyers can access this endpoint'
      });
    }

    const result = await db.query(
      `SELECT p.state AS property_state,
              u.assigned_state AS lawyer_assigned_state
       FROM legal_authorizations la
       JOIN users u ON u.id = la.lawyer_user_id
       JOIN properties p ON p.id = $1
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

    const row = result.rows[0];
    if (!row.lawyer_assigned_state || !statesMatch(row.lawyer_assigned_state, row.property_state)) {
      return res.status(403).json({
        success: false,
        message: 'Lawyer state lock violation: property is outside your assigned state',
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
