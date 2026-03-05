const db = require('../config/middleware/database');


/* ---------------------------------------------------
   Grant Lawyer Access to a Property
--------------------------------------------------- */

exports.grantLawyerAccess = async (req, res) => {
  try {

    const { property_id, lawyer_id, client_user_id } = req.body;

    if (!property_id || !lawyer_id || !client_user_id) {
      return res.status(400).json({
        success: false,
        message: "property_id, lawyer_id and client_user_id are required"
      });
    }

    const result = await db.query(
      `INSERT INTO legal_authorizations
       (property_id, client_user_id, lawyer_user_id, granted_by)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [property_id, client_user_id, lawyer_id, req.user?.id]
    );

    return res.status(201).json({
      success: true,
      message: "Lawyer access granted successfully",
      data: result.rows[0]
    });

  } catch (error) {

    console.error("Grant lawyer access error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to grant lawyer access"
    });

  }
};



/* ---------------------------------------------------
   Get Properties Lawyer Has Access To
--------------------------------------------------- */

exports.getAuthorizedProperties = async (req, res) => {

  try {

    const lawyerId = req.user?.id;

    if (!lawyerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

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
      [lawyerId]
    );

    return res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {

    console.error("Get authorized properties error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch authorized properties"
    });

  }
};

/* ---------------------------------------------------
   Resolve Dispute (Lawyer)
--------------------------------------------------- */

exports.resolveDispute = async (req, res) => {

  try {

    const { disputeId } = req.params;
    const { resolution_note } = req.body;

    if (!disputeId) {
      return res.status(400).json({
        success: false,
        message: "Dispute ID is required"
      });
    }

    const result = await db.query(
      `UPDATE disputes
       SET status = 'resolved',
           resolution_note = $1,
           resolved_by = $2,
           resolved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [
        resolution_note || null,
        req.user?.id,
        disputeId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Dispute not found"
      });
    }

    return res.json({
      success: true,
      message: "Dispute resolved successfully",
      data: result.rows[0]
    });

  } catch (error) {

    console.error("Resolve dispute error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to resolve dispute"
    });

  }

};