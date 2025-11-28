const pool = require('../config/middleware/database'); const { validationResult } = require('express-validator'); const { sendApplicationNotification, sendApplicationStatusUpdate } = require('../utils/emailService');

// ============ TENANT ENDPOINTS ============

// Submit application exports.submitApplication = async (req, res) => { try { const errors = validationResult(req); if (!errors.isEmpty()) { return res.status(400).json({ success: false, errors: errors.array() }); }

const userId = req.user.id;
const { property_id, message, move_in_date } = req.body;

// Check if property exists and is available
const propertyResult = await pool.query(
  `SELECT p.id, p.title, p.landlord_id, p.is_available,
          u.email as landlord_email, u.full_name as landlord_name
   FROM properties p
   JOIN users u ON p.landlord_id = u.id
   WHERE p.id = $1`,
  [property_id]
);

if (propertyResult.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Property not found'
  });
}

const property = propertyResult.rows[0];

if (!property.is_available) {
  return res.status(400).json({
    success: false,
    message: 'Property is no longer available'
  });
}

// Check if user already applied
const existingApplication = await pool.query(
  'SELECT id, status FROM applications WHERE property_id = $1 AND tenant_id = $2',
  [property_id, userId]
);

if (existingApplication.rows.length > 0) {
  const status = existingApplication.rows[0].status;
  if (status === 'pending') {
    return res.status(400).json({
      success: false,
      message: 'You already have a pending application for this property'
    });
  } else if (status === 'approved') {
    return res.status(400).json({
      success: false,
      message: 'Your application for this property was already approved'
    });
  }
}

// Get tenant info
const tenantResult = await pool.query(
  'SELECT email, full_name, phone FROM users WHERE id = $1',
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

// Send notification to landlord
await sendApplicationNotification(
  property.landlord_email,
  property.landlord_name,
  tenant.full_name,
  property.title,
  application.id
);

res.status(201).json({
  success: true,
  message: 'Application submitted successfully',
  data: application
});
} catch (error) { console.error('Submit application error:', error); res.status(500).json({ success: false, message: 'Failed to submit application', error: error.message }); } };

// Get tenant's applications exports.getMyApplications = async (req, res) => { try { const userId = req.user.id; const { status, page = 1, limit = 20 } = req.query; const offset = (page - 1) * limit;

let whereClause = 'WHERE a.tenant_id = $1';
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
     p.title as property_title,
     p.rent_amount,
     p.payment_frequency,
     p.city,
     p.area,
     s.state_name,
     u.full_name as landlord_name,
     u.phone as landlord_phone,
     u.email as landlord_email,
     (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as property_photo
   FROM applications a
   JOIN properties p ON a.property_id = p.id
   JOIN states s ON p.state_id = s.id
   JOIN users u ON p.landlord_id = u.id
   ${whereClause}
   ORDER BY a.created_at DESC
   LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
  [...params, limit, offset]
);

// Get total count
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
} catch (error) { console.error('Get my applications error:', error); res.status(500).json({ success: false, message: 'Failed to fetch applications' }); } };

// Get application by ID exports.getApplicationById = async (req, res) => { try { const { applicationId } = req.params; const userId = req.user.id; const userType = req.user.user_type;

let query;
let params;

if (userType === 'tenant') {
  query = `
    SELECT 
      a.*,
      p.title as property_title,
      p.rent_amount,
      p.payment_frequency,
      p.full_address,
      p.description,
      p.city,
      p.area,
      s.state_name,
      u.full_name as landlord_name,
      u.phone as landlord_phone,
      u.email as landlord_email
    FROM applications a
    JOIN properties p ON a.property_id = p.id
    JOIN states s ON p.state_id = s.id
    JOIN users u ON p.landlord_id = u.id
    WHERE a.id = $1 AND a.tenant_id = $2
  `;
  params = [applicationId, userId];
} else {
  // Landlord
  query = `
    SELECT 
      a.*,
      p.title as property_title,
      p.rent_amount,
      p.payment_frequency,
      u.full_name as tenant_name,
      u.phone as tenant_phone,
      u.email as tenant_email,
      u.nin as tenant_nin,
      u.identity_verified as tenant_verified
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
    message: 'Application not found or unauthorized'
  });
}

res.json({
  success: true,
  data: result.rows[0]
});
} catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch application' }); } };

// Withdraw application exports.withdrawApplication = async (req, res) => { try { const { applicationId } = req.params; const userId = req.user.id;

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
    message: 'Application not found, unauthorized, or cannot be withdrawn'
  });
}

res.json({
  success: true,
  message: 'Application withdrawn successfully',
  data: result.rows[0]
});
} catch (error) { res.status(500).json({ success: false, message: 'Failed to withdraw application' }); } };

// ============ LANDLORD ENDPOINTS ============

// Get received applications exports.getReceivedApplications = async (req, res) => { try { const userId = req.user.id; const { status, page = 1, limit = 20 } = req.query; const offset = (page - 1) * limit;

let whereClause = 'WHERE p.landlord_id = $1';
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
     p.id as property_id,
     p.title as property_title,
     p.city,
     p.area,
     u.full_name as tenant_name,
     u.phone as tenant_phone,
     u.email as tenant_email,
     u.identity_verified as tenant_verified
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

// Get total count
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
} catch (error) { console.error('Get received applications error:', error); res.status(500).json({ success: false, message: 'Failed to fetch applications' }); } };

// Get applications for specific property exports.getPropertyApplications = async (req, res) => { try { const { propertyId } = req.params; const userId = req.user.id; const { page = 1, limit = 20 } = req.query; const offset = (page - 1) * limit;

// Verify property belongs to landlord
const propertyCheck = await pool.query(
  'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
  [propertyId, userId]
);

if (propertyCheck.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Property not found or unauthorized'
  });
}

const result = await pool.query(
  `SELECT 
     a.*,
     u.full_name as tenant_name,
     u.phone as tenant_phone,
     u.email as tenant_email,
     u.identity_verified as tenant_verified
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

// Get total count
const countResult = await pool.query(
  'SELECT COUNT(*) FROM applications WHERE property_id = $1',
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
} catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch property applications' }); } };

// Approve application exports.approveApplication = async (req, res) => { try { const { applicationId } = req.params; const userId = req.user.id;

// Get application details
const appResult = await pool.query(
  `SELECT a.*, p.landlord_id, p.title as property_title,
          u.email as tenant_email, u.full_name as tenant_name
   FROM applications a
   JOIN properties p ON a.property_id = p.id
   JOIN users u ON a.tenant_id = u.id
   WHERE a.id = $1`,
  [applicationId]
);

if (appResult.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Application not found'
  });
}

const application = appResult.rows[0];

if (application.landlord_id !== userId) {
  return res.status(403).json({
    success: false,
    message: 'Unauthorized'
  });
}

if (application.status !== 'pending') {
  return res.status(400).json({
    success: false,
    message: `Application is already ${application.status}`
  });
}

// Update application status
const result = await pool.query(
  `UPDATE applications 
   SET status = 'approved',
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $1
   RETURNING *`,
  [applicationId]
);

// Send notification to tenant
await sendApplicationStatusUpdate(
  application.tenant_email,
  application.tenant_name,
  application.property_title,
  'approved'
);

res.json({
  success: true,
  message: 'Application approved successfully',
  data: result.rows[0]
});
} catch (error) { console.error('Approve application error:', error); res.status(500).json({ success: false, message: 'Failed to approve application' }); } };

// Reject application exports.rejectApplication = async (req, res) => { try { const { applicationId } = req.params; const userId = req.user.id; const { reason } = req.body;

// Get application details
const appResult = await pool.query(
  `SELECT a.*, p.landlord_id, p.title as property_title,
          u.email as tenant_email, u.full_name as tenant_name
   FROM applications a
   JOIN properties p ON a.property_id = p.id
   JOIN users u ON a.tenant_id = u.id
   WHERE a.id = $1`,
  [applicationId]
);

if (appResult.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Application not found'
  });
}

const application = appResult.rows[0];

if (application.landlord_id !== userId) {
  return res.status(403).json({
    success: false,
    message: 'Unauthorized'
  });
}

if (application.status !== 'pending') {
  return res.status(400).json({
    success: false,
    message: `Application is already ${application.status}`
  });
}

// Update application status
const result = await pool.query(
  `UPDATE applications 
   SET status = 'rejected',
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $1
   RETURNING *`,
  [applicationId]
);

// Send notification to tenant
await sendApplicationStatusUpdate(
  application.tenant_email,
  application.tenant_name,
  application.property_title,
  'rejected',
  reason
);

res.json({
  success: true,
  message: 'Application rejected',
  data: result.rows[0]
});
} catch (error) { console.error('Reject application error:', error); res.status(500).json({ success: false, message: 'Failed to reject application' }); } };

// Get application statistics
exports.getApplicationStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE a.status = 'pending') as pending_count,
         COUNT(*) FILTER (WHERE a.status = 'approved') as approved_count,
         COUNT(*) FILTER (WHERE a.status = 'rejected') as rejected_count,
         COUNT(*) FILTER (WHERE a.status = 'withdrawn') as withdrawn_count,
         COUNT(*) as total_applications
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
      message: 'Failed to fetch application statistics'
    });
  }
};

module.exports = exports;