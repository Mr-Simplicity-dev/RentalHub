const db = require('../config/middleware/database');

exports.grantLawyerAccess = async (req, res) => {
  try {
    const { property_id, lawyer_id, client_user_id } = req.body;

    const result = await db.query(
      `INSERT INTO legal_authorizations
       (property_id, client_user_id, lawyer_user_id, granted_by)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [property_id, client_user_id, lawyer_id, req.user.id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Grant lawyer access error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to grant lawyer access'
    });
  }
};