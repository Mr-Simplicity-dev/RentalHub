const express = require("express");
const router = express.Router();
const pool = require("../config/middleware/database");
const { authenticate, isTenant, isLandlord } = require("../config/middleware/auth");

// =====================================================
//                 TENANT DASHBOARD STATS
// =====================================================

router.get("/tenant/stats", authenticate, isTenant, async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM saved_properties WHERE tenant_id = $1) AS saved_properties_count,
        (SELECT COUNT(*) FROM applications WHERE tenant_id = $1) AS total_applications,
        (SELECT COUNT(*) FROM applications WHERE tenant_id = $1 AND status = 'pending') AS pending_applications,
        (SELECT COUNT(*) FROM applications WHERE tenant_id = $1 AND status = 'approved') AS approved_applications,
        (SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE) AS unread_messages,
        (SELECT subscription_expires_at FROM users WHERE id = $1) AS subscription_expires_at,
        (SELECT subscription_active FROM users WHERE id = $1) AS subscription_active`,
      [userId]
    );

    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch tenant statistics",
    });
  }
});

// =====================================================
//                LANDLORD DASHBOARD STATS
// =====================================================

router.get("/landlord/stats", authenticate, isLandlord, async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM properties WHERE landlord_id = $1) AS total_properties,
        (SELECT COUNT(*) FROM properties WHERE landlord_id = $1 AND is_available = TRUE) AS available_properties,
        (SELECT COUNT(*) FROM properties WHERE landlord_id = $1 AND featured = TRUE) AS featured_properties,
        (SELECT COUNT(*) FROM applications a JOIN properties p ON a.property_id = p.id WHERE p.landlord_id = $1) AS total_applications,
        (SELECT COUNT(*) FROM applications a JOIN properties p ON a.property_id = p.id WHERE p.landlord_id = $1 AND a.status = 'pending') AS pending_applications,
        (SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE) AS unread_messages,
        (SELECT SUM(amount) FROM payments WHERE user_id = $1 AND payment_type = 'landlord_listing' AND payment_status = 'completed') AS total_spent,
        (SELECT COUNT(*) FROM reviews r JOIN properties p ON r.property_id = p.id WHERE p.landlord_id = $1) AS total_reviews,
        (SELECT AVG(r.rating) FROM reviews r JOIN properties p ON r.property_id = p.id WHERE p.landlord_id = $1) AS avg_rating`,
      [userId]
    );

    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch landlord statistics",
    });
  }
});

// =====================================================
//            TENANT RECENT ACTIVITIES
// =====================================================

router.get("/tenant/recent-activities", authenticate, isTenant, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const activities = await pool.query(
      `(
        SELECT 
          'application' AS type,
          a.id,
          a.status,
          a.created_at AS activity_date,
          p.title AS property_title,
          p.id AS property_id
        FROM applications a
        JOIN properties p ON a.property_id = p.id
        WHERE a.tenant_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2
      )
      UNION ALL
      (
        SELECT 
          'message' AS type,
          m.id,
          CASE WHEN m.is_read THEN 'read' ELSE 'unread' END AS status,
          m.created_at AS activity_date,
          COALESCE(p.title, 'General Message') AS property_title,
          m.property_id
        FROM messages m
        LEFT JOIN properties p ON m.property_id = p.id
        WHERE m.receiver_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2
      )
      ORDER BY activity_date DESC
      LIMIT $2`,
      [userId, limit]
    );

    res.json({ success: true, data: activities.rows });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent activities",
    });
  }
});

// =====================================================
//           LANDLORD RECENT ACTIVITIES
// =====================================================

router.get("/landlord/recent-activities", authenticate, isLandlord, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const activities = await pool.query(
      `(
        SELECT 
          'application' AS type,
          a.id,
          a.status,
          a.created_at AS activity_date,
          p.title AS property_title,
          p.id AS property_id,
          u.full_name AS user_name
        FROM applications a
        JOIN properties p ON a.property_id = p.id
        JOIN users u ON a.tenant_id = u.id
        WHERE p.landlord_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2
      )
      UNION ALL
      (
        SELECT 
          'message' AS type,
          m.id,
          CASE WHEN m.is_read THEN 'read' ELSE 'unread' END AS status,
          m.created_at AS activity_date,
          COALESCE(p.title, 'General Message') AS property_title,
          m.property_id,
          u.full_name AS user_name
        FROM messages m
        LEFT JOIN properties p ON m.property_id = p.id
        JOIN users u ON m.sender_id = u.id
        WHERE m.receiver_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2
      )
      UNION ALL
      (
        SELECT 
          'review' AS type,
          r.id,
          r.rating::text AS status,
          r.created_at AS activity_date,
          p.title AS property_title,
          p.id AS property_id,
          u.full_name AS user_name
        FROM reviews r
        JOIN properties p ON r.property_id = p.id
        JOIN users u ON r.tenant_id = u.id
        WHERE p.landlord_id = $1
        ORDER BY r.created_at DESC
        LIMIT $2
      )
      ORDER BY activity_date DESC
      LIMIT $2`,
      [userId, limit]
    );

    res.json({ success: true, data: activities.rows });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent activities",
    });
  }
});

// =====================================================
//                ADMIN DASHBOARD STATS
// =====================================================

router.get("/admin/stats", authenticate, async (req, res) => {
  try {
    const checkAdmin = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!checkAdmin.rows[0] || !checkAdmin.rows[0].is_admin) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE user_type = 'tenant') AS total_tenants,
        (SELECT COUNT(*) FROM users WHERE user_type = 'landlord') AS total_landlords,
        (SELECT COUNT(*) FROM users WHERE identity_verified = TRUE) AS verified_users,
        (SELECT COUNT(*) FROM users WHERE subscription_active = TRUE) AS active_subscriptions,
        (SELECT COUNT(*) FROM properties) AS total_properties,
        (SELECT COUNT(*) FROM properties WHERE is_available = TRUE) AS available_properties,
        (SELECT COUNT(*) FROM properties WHERE is_verified = FALSE) AS pending_verification,
        (SELECT COUNT(*) FROM applications) AS total_applications,
        (SELECT COUNT(*) FROM applications WHERE status = 'pending') AS pending_applications,
        (SELECT SUM(amount) FROM payments WHERE payment_status = 'completed') AS total_revenue,
        (SELECT SUM(amount) FROM payments WHERE payment_type = 'tenant_subscription' AND payment_status = 'completed') AS subscription_revenue,
        (SELECT SUM(amount) FROM payments WHERE payment_type = 'landlord_listing' AND payment_status = 'completed') AS listing_revenue,
        (SELECT COUNT(*) FROM reviews) AS total_reviews,
        (SELECT AVG(rating) FROM reviews) AS avg_rating
    `);

    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin statistics",
    });
  }
});

module.exports = router;
