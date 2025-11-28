const express = require('express'); const router = express.Router(); const pool = require('../config/middleware/database'); const { authenticate } = require('../middleware/auth');

// Middleware to check if user is admin (add admin field to users table) const isAdmin = async (req, res, next) => { // Check if user is admin const result = await pool.query( 'SELECT is_admin FROM users WHERE id = $1', [req.user.id] );

if (!result.rows[0]?.is_admin) { return res.status(403).json({ success: false, message: 'Admin access required' }); } next(); };

// Get all pending verifications router.get('/pending-verifications', authenticate, isAdmin, async (req, res) => { try { const result = await pool.query( SELECT id, user_type, email, phone, full_name, nin, passport_photo_url, email_verified, phone_verified, created_at FROM users WHERE email_verified = TRUE AND phone_verified = TRUE AND passport_photo_url IS NOT NULL AND identity_verified = FALSE ORDER BY created_at DESC );

res.json({
  success: true,
 data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending verifications'
    });
  }
});

// Approve user verification
router.post('/approve-verification/:userId', authenticate, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { nin_verified } = req.body; // Admin confirms NIN is valid

    await pool.query(
      `UPDATE users 
       SET identity_verified = TRUE, 
           nin_verified = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [nin_verified || true, userId]
    );

    res.json({
      success: true,
      message: 'User verification approved'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to approve verification'
    });
  }
});

// Reject user verification
router.post('/reject-verification/:userId', authenticate, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // You can store rejection reason in a separate table or send email
    await pool.query(
      `UPDATE users 
       SET identity_verified = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );

    // TODO: Send email to user with rejection reason

    res.json({
      success: true,
      message: 'User verification rejected',
      reason
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reject verification'
    });
  }
});

// Get all users
router.get('/users', authenticate, isAdmin, async (req, res) => {
  try {
    const { user_type, verified, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (user_type) {
      query += ` AND user_type = $${paramCount}`;
      params.push(user_type);
      paramCount++;
    }

    if (verified !== undefined) {
      query += ` AND identity_verified = $${paramCount}`;
      params.push(verified === 'true');
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM users');

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
      message: 'Failed to fetch users'
    });
  }
});

module.exports = router;