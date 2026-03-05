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

// controllers/legalController.js

exports.getAuthorizedProperties = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT p.*
       FROM properties p
       WHERE EXISTS (
         SELECT 1
         FROM legal_authorizations la
         WHERE la.lawyer_user_id = $1
           AND la.status = 'active'
           AND la.property_id = p.id
       )
       OR EXISTS (
         SELECT 1
         FROM legal_authorizations la
         JOIN disputes d ON d.property_id = p.id
         WHERE la.lawyer_user_id = $1
           AND la.status = 'active'
           AND la.property_id IS NULL
           AND la.client_user_id IN (d.opened_by, d.against_user)
       )
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};
