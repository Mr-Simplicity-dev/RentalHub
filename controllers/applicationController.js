// ====================== IMPORTS ======================
const pool = require("../config/middleware/database");
const { validationResult } = require("express-validator");
const {
  sendApplicationNotification,
  sendApplicationStatusUpdate
} = require("../config/utils/emailService");

// =====================================================
//                  TENANT ENDPOINTS
// =====================================================

// -----------------------------------------------------
// Submit Application
// -----------------------------------------------------
exports.submitApplication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { property_id, message, move_in_date } = req.body;

    // Check if property exists
    const propertyResult = await pool.query(
      `SELECT p.id, p.title, p.landlord_id, p.is_available,
              u.email AS landlord_email, 
              u.full_name AS landlord_name
       FROM properties p
       JOIN users u ON p.landlord_id = u.id
       WHERE p.id = $1`,
      [property_id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    const property = propertyResult.rows[0];

    if (!property.is_available) {
      return res.status(400).json({
        success: false,
        message: "Property is no longer available"
      });
    }

    // Check existing application
    const existingApplication = await pool.query(
      "SELECT id, status FROM applications WHERE property_id = $1 AND tenant_id = $2",
      [property_id, userId]
    );

    if (existingApplication.rows.length > 0) {
      const status = existingApplication.rows[0].status;

      return res
        .status(400)
        .json({
          success: false,
          message:
            status === "pending"
              ? "You already have a pending application for this property"
              : status === "approved"
              ? "Your application for this property was already approved"
              : "You already applied for this property"
        });
    }

    // Get tenant info
    const tenantResult = await pool.query(
      "SELECT email, full_name, phone FROM users WHERE id = $1",
      [userId]
    );

    const tenant = tenantResult.rows[0];

    // Create application
    const result = await pool.query(
      `INSERT INTO applications (property_id, tenant_id, message, move_in_date, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [property_id, userId, message || null, move_in_date || null]
    );

    const application = result.rows[0];

    // Notify landlord
    await sendApplicationNotification(
      property.landlord_email,
      property.landlord_name,
      tenant.full_name,
      property.title,
      application.id
    );

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: application
    });
  } catch (error) {
    console.error("Submit application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application",
      error: error.message
    });
  }
};

// -----------------------------------------------------
// Get Tenant Applications
// -----------------------------------------------------
exports.getMyApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE a.tenant_id = $1";
    const params = [userId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND a.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    const result = await pool.query(
      `SELECT 
         a.*,
         p.title AS property_title,
         p.rent_amount,
         p.payment_frequency,
         p.city,
         p.area,
         s.state_name,
         u.full_name AS landlord_name,
         u.phone AS landlord_phone,
         u.email AS landlord_email,
         (SELECT photo_url FROM property_photos 
          WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS property_photo
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       JOIN states s ON p.state_id = s.id
       JOIN users u ON p.landlord_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM applications a ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error("Get my applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications"
    });
  }
};

// -----------------------------------------------------
// Get Application by ID (Tenant & Landlord)
// -----------------------------------------------------
exports.getApplicationById = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user.id;
    const userType = req.user.user_type;

    let query;
    let params;

    if (userType === "tenant") {
      query = `
        SELECT 
          a.*,
          p.title AS property_title,
          p.rent_amount,
          p.payment_frequency,
          p.full_address,
          p.description,
          p.city,
          p.area,
          s.state_name,
          u.full_name AS landlord_name,
          u.phone AS landlord_phone,
          u.email AS landlord_email
        FROM applications a
        JOIN properties p ON a.property_id = p.id
        JOIN states s ON p.state_id = s.id
        JOIN users u ON p.landlord_id = u.id
        WHERE a.id = $1 AND a.tenant_id = $2
      `;
      params = [applicationId, userId];
    } else {
      query = `
        SELECT 
          a.*,
          p.title AS property_title,
          p.rent_amount,
          p.payment_frequency,
          u.full_name AS tenant_name,
          u.phone AS tenant_phone,
          u.email AS tenant_email,
          u.nin AS tenant_nin,
          u.identity_verified AS tenant_verified
        FROM applications a
        JOIN properties p ON a.property_id = p.id
        JOIN users u ON a.tenant_id = u.id
        WHERE a.id = $1 AND p.landlord_id = $2
      `;
      params = [applicationId, userId];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found or unauthorized"
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch application"
    });
  }
};

// -----------------------------------------------------
// Withdraw Application (Tenant)
// -----------------------------------------------------
exports.withdrawApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE applications 
       SET status = 'withdrawn',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING *`,
      [applicationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Application not found, unauthorized, or cannot be withdrawn"
      });
    }

    res.json({
      success: true,
      message: "Application withdrawn successfully",
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to withdraw application"
    });
  }
};

// =====================================================
//                  LANDLORD ENDPOINTS
// =====================================================

// -----------------------------------------------------
// Get Received Applications
// -----------------------------------------------------
exports.getReceivedApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE p.landlord_id = $1";
    const params = [userId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND a.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    const result = await pool.query(
      `SELECT 
         a.*,
         p.id AS property_id,
         p.title AS property_title,
         p.city,
         p.area,
         u.full_name AS tenant_name,
         u.phone AS tenant_phone,
         u.email AS tenant_email,
         u.identity_verified AS tenant_verified
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       JOIN users u ON a.tenant_id = u.id
       ${whereClause}
       ORDER BY 
         CASE a.status 
           WHEN 'pending' THEN 1 
           WHEN 'approved' THEN 2 
           WHEN 'rejected' THEN 3 
           WHEN 'withdrawn' THEN 4 
         END,
         a.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error("Get received applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications"
    });
  }
};

// -----------------------------------------------------
// Get Applications for Specific Property
// -----------------------------------------------------
exports.getPropertyApplications = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const propertyCheck = await pool.query(
      "SELECT id FROM properties WHERE id = $1 AND landlord_id = $2",
      [propertyId, userId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found or unauthorized"
      });
    }

    const result = await pool.query(
      `SELECT 
         a.*,
         u.full_name AS tenant_name,
         u.phone AS tenant_phone,
         u.email AS tenant_email,
         u.identity_verified AS tenant_verified
       FROM applications a
       JOIN users u ON a.tenant_id = u.id
       WHERE a.property_id = $1
       ORDER BY 
         CASE a.status 
           WHEN 'pending' THEN 1 
           WHEN 'approved' THEN 2 
           WHEN 'rejected' THEN 3 
           WHEN 'withdrawn' THEN 4 
         END,
         a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [propertyId, limit, offset]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM applications WHERE property_id = $1",
      [propertyId]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch property applications"
    });
  }
};

// -----------------------------------------------------
// Approve Application
// -----------------------------------------------------
exports.approveApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user.id;

    const appResult = await pool.query(
      `SELECT 
         a.*, p.landlord_id, p.title AS property_title,
         u.email AS tenant_email,
         u.full_name AS tenant_name
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       JOIN users u ON a.tenant_id = u.id
       WHERE a.id = $1`,
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found"
      });
    }

    const application = appResult.rows[0];

    if (application.landlord_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (application.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Application is already ${application.status}`
      });
    }

    const result = await pool.query(
      `UPDATE applications 
       SET status = 'approved',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [applicationId]
    );

    await sendApplicationStatusUpdate(
      application.tenant_email,
      application.tenant_name,
      application.property_title,
      "approved"
    );

    res.json({
      success: true,
      message: "Application approved successfully",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Approve application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve application"
    });
  }
};

// -----------------------------------------------------
// Reject Application
// -----------------------------------------------------
exports.rejectApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const appResult = await pool.query(
      `SELECT a.*, p.landlord_id, p.title AS property_title,
              u.email AS tenant_email,
              u.full_name AS tenant_name
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       JOIN users u ON a.tenant_id = u.id
       WHERE a.id = $1`,
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found"
      });
    }

    const application = appResult.rows[0];

    if (application.landlord_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (application.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Application is already ${application.status}`
      });
    }

    const result = await pool.query(
      `UPDATE applications 
       SET status = 'rejected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [applicationId]
    );

    await sendApplicationStatusUpdate(
      application.tenant_email,
      application.tenant_name,
      application.property_title,
      "rejected",
      reason
    );

    res.json({
      success: true,
      message: "Application rejected",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Reject application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject application"
    });
  }
};

// -----------------------------------------------------
// Application Statistics (Landlord)
// -----------------------------------------------------
exports.getApplicationStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE a.status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE a.status = 'approved') AS approved_count,
         COUNT(*) FILTER (WHERE a.status = 'rejected') AS rejected_count,
         COUNT(*) FILTER (WHERE a.status = 'withdrawn') AS withdrawn_count,
         COUNT(*) AS total_applications
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       WHERE p.landlord_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      data: stats.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch application statistics"
    });
  }
};

// =====================================================
// EXPORT ALL
// =====================================================
module.exports = exports;
