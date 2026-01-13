const db = require('../config/middleware/database');

// GET /api/admin/users
exports.getAllUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, full_name, email, phone, user_type,
              email_verified, phone_verified, identity_verified,
              created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ success: false, message: 'Failed to load users' });
  }
};

// GET /api/admin/verifications/pending
exports.getPendingVerifications = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, full_name, email, nin, passport_photo_url, user_type
       FROM users
       WHERE email_verified = TRUE
         AND phone_verified = TRUE
         AND identity_verified = FALSE
         AND passport_photo_url IS NOT NULL
       ORDER BY created_at ASC`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Pending verifications error:', err);
    res.status(500).json({ success: false, message: 'Failed to load verifications' });
  }
};

// POST /api/admin/verifications/:id/approve
exports.approveVerification = async (req, res) => {
  try {
    const userId = req.params.id;

    await db.query(
      'UPDATE users SET identity_verified = TRUE WHERE id = $1',
      [userId]
    );

    res.json({ success: true, message: 'User verified successfully' });
  } catch (err) {
    console.error('Approve verification error:', err);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
};

// POST /api/admin/verifications/:id/reject
exports.rejectVerification = async (req, res) => {
  try {
    const userId = req.params.id;

    await db.query(
      'UPDATE users SET passport_photo_url = NULL WHERE id = $1',
      [userId]
    );

    res.json({ success: true, message: 'Verification rejected' });
  } catch (err) {
    console.error('Reject verification error:', err);
    res.status(500).json({ success: false, message: 'Rejection failed' });
  }
};

// GET /api/admin/properties
exports.getAllProperties = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.id, p.title, p.rent_amount, p.status, p.created_at,
              u.full_name AS landlord_name,
              p.city, s.name AS state_name
       FROM properties p
       JOIN users u ON p.landlord_id = u.id
       LEFT JOIN states s ON p.state_id = s.id
       ORDER BY p.created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin properties error:', err);
    res.status(500).json({ success: false, message: 'Failed to load properties' });
  }
};

// GET /api/admin/applications
exports.getAllApplications = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.id, a.status, a.created_at,
              t.full_name AS tenant_name,
              l.full_name AS landlord_name,
              p.title AS property_title
       FROM applications a
       JOIN users t ON a.tenant_id = t.id
       JOIN properties p ON a.property_id = p.id
       JOIN users l ON p.landlord_id = l.id
       ORDER BY a.created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin applications error:', err);
    res.status(500).json({ success: false, message: 'Failed to load applications' });
  }
};
