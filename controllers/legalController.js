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
      `SELECT DISTINCT ON (p.id)
         p.*,
         client.full_name AS client_name,
         client.email AS client_email,
         granter.full_name AS assigned_by_name,
         granter.email AS assigned_by_email
       FROM properties p
       JOIN legal_authorizations la
         ON (
           la.property_id = p.id
           OR (
             la.property_id IS NULL
             AND EXISTS (
               SELECT 1
               FROM disputes d
               WHERE d.property_id = p.id
                 AND la.client_user_id IN (d.opened_by, d.against_user)
             )
           )
         )
       LEFT JOIN users client ON client.id = la.client_user_id
       LEFT JOIN users granter ON granter.id = la.granted_by
       WHERE la.lawyer_user_id = $1
         AND la.status = 'active'
       ORDER BY p.id, p.created_at DESC, la.id DESC`,
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

/* ---------------------------------------------------
   Legal Audit Logs
--------------------------------------------------- */

exports.getLegalAuditLogs = async (req, res) => {
  try {
    const { disputeId = null, limit = 50 } = req.query;
    const params = [];
    const where = [];

    if (disputeId) {
      params.push(disputeId);
      where.push(`l.target_type = 'dispute' AND l.target_id = $${params.length}`);
    } else {
      where.push(`(
        l.target_type = 'dispute'
        OR l.action ILIKE '%lawyer%'
        OR l.action ILIKE '%legal%'
      )`);
    }

    params.push(Math.min(Number(limit) || 50, 200));

    const result = await db.query(
      `SELECT
         l.*,
         u.full_name AS actor_name,
         u.email AS actor_email,
         u.user_type AS actor_role
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.id DESC
       LIMIT $${params.length}`,
      params
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get legal audit logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch legal audit logs',
    });
  }
};
