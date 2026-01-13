const express = require("express");
const router = express.Router();
const pool = require("../config/middleware/database");
const { authenticate } = require("../config/middleware/auth");
const express = require('express');

const adminController = require('../controllers/adminController');
const { authenticate } = require('../config/middleware/auth');
const { requireAdmin } = require('../config/middleware/requireAdmin');

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// Users
router.get('/users', adminController.getAllUsers);

// Verifications
router.get('/verifications/pending', adminController.getPendingVerifications);
router.post('/verifications/:id/approve', adminController.approveVerification);
router.post('/verifications/:id/reject', adminController.rejectVerification);

// Properties
router.get('/properties', adminController.getAllProperties);

// Applications
router.get('/applications', adminController.getAllApplications);



// =====================================================
//            ADMIN ACCESS MIDDLEWARE
// =====================================================

const isAdmin = async (req, res, next) => {
  try {
    const result = await db.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!result.rows[0] || !result.rows[0].is_admin) {
      return res.status(403).json({
        success: false,
        message: "Admin access required"
      });
    }

    next();
  } catch (error) {
    console.error("Admin check error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// =====================================================
//            GET PENDING VERIFICATIONS
// =====================================================

router.get("/pending-verifications", authenticate, isAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        id, user_type, email, phone, full_name, nin, passport_photo_url, 
        email_verified, phone_verified, created_at
       FROM users
       WHERE email_verified = TRUE
         AND phone_verified = TRUE
         AND passport_photo_url IS NOT NULL
         AND identity_verified = FALSE
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error("Fetch pending verifications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending verifications"
    });
  }
});

// =====================================================
//            APPROVE USER VERIFICATION
// =====================================================

router.post("/approve-verification/:userId", authenticate, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { nin_verified } = req.body;

    await db.query(
      `UPDATE users 
       SET identity_verified = TRUE,
           nin_verified = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [nin_verified || true, userId]
    );

    res.json({
      success: true,
      message: "User verification approved"
    });
  } catch (error) {
    console.error("Approve verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve verification"
    });
  }
});

// =====================================================
//            REJECT USER VERIFICATION
// =====================================================

router.post("/reject-verification/:userId", authenticate, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    await db.query(
      `UPDATE users 
       SET identity_verified = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );

    // TODO: send email notice to user
    res.json({
      success: true,
      message: "User verification rejected",
      reason
    });
  } catch (error) {
    console.error("Reject verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject verification"
    });
  }
});

// =====================================================
//                 GET ALL USERS
// =====================================================

router.get("/users", authenticate, isAdmin, async (req, res) => {
  try {
    const { user_type, verified, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `SELECT * FROM users WHERE 1=1`;
    const params = [];
    let paramCount = 1;

    if (user_type) {
      query += ` AND user_type = $${paramCount}`;
      params.push(user_type);
      paramCount++;
    }

    if (verified !== undefined) {
      query += ` AND identity_verified = $${paramCount}`;
      params.push(verified === "true");
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    const countResult = await db.query("SELECT COUNT(*) FROM users");

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
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users"
    });
  }
});

module.exports = router;
