 const express = require('express'); const router = express.Router(); const pool = require('../config/middleware/database'); const { authenticate, isTenant, isLandlord } = require('../middleware/auth');

// Tenant Dashboard Stats router.get('/tenant/stats', authenticate, isTenant, async (req, res) => { try { const userId = req.user.id;

const stats = await pool.query(
  `SELECT 
     (SELECT COUNT(*) FROM saved_properties WHERE tenant_id = $1) as saved_properties_count,
     (SELECT COUNT(*) FROM applications WHERE tenant_id = $1) as total_applications,
     (SELECT COUNT(*) FROM applications WHERE tenant_id = $1 AND status = 'pending') as pending_applications,
     (SELECT COUNT(*) FROM applications WHERE tenant_id = $1 AND status = 'approved') as approved_applications,
     (SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE) as unread_messages,
     (SELECT subscription_expires_at FROM users WHERE id = $1) as subscription_expires_at,
     (SELECT subscription_active FROM users WHERE id = $1) as subscription_active`,
  [userId]
);

res.json({
  success: true,
  data: stats.rows[0]
});

} catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch tenant statistics' }); } });

// Landlord Dashboard Stats router.get('/landlord/stats', authenticate, isLandlord, async (req, res) => { try { const userId = req.user.id;

const stats = await pool.query(
  `SELECT 
     (SELECT COUNT(*) FROM properties WHERE landlord_id = $1) as total_properties,
     (SELECT COUNT(*) FROM properties WHERE landlord_id = $1 AND is_available = TRUE) as available
_properties,
         (SELECT COUNT(*) FROM properties WHERE landlord_id = $1 AND featured = TRUE) as featured_properties,
         (SELECT COUNT(*) FROM applications a JOIN properties p ON a.property_id = p.id WHERE p.landlord_id = $1) as total_applications,
         (SELECT COUNT(*) FROM applications a JOIN properties p ON a.property_id = p.id WHERE p.landlord_id = $1 AND a.status = 'pending') as pending_applications,
         (SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE) as unread_messages,
         (SELECT SUM(amount) FROM payments WHERE user_id = $1 AND payment_type = 'landlord_listing' AND payment_status = 'completed') as total_spent,
         (SELECT COUNT(*) FROM reviews r JOIN properties p ON r.property_id = p.id WHERE p.landlord_id = $1) as total_reviews,
         (SELECT AVG(r.rating) FROM reviews r JOIN properties p ON r.property_id = p.id WHERE p.landlord_id = $1) as avg_rating`,
      [userId]
    );

    res.json({
      success: true,
      data: stats.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch landlord statistics'
    });
  }
});

// Recent activities for tenant
router.get('/tenant/recent-activities', authenticate, isTenant, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const activities = await pool.query(
      `(
        SELECT 
          'application' as type,
          a.id,
          a.status,
          a.created_at as activity_date,
          p.title as property_title,
          p.id as property_id
        FROM applications a
        JOIN properties p ON a.property_id = p.id
        WHERE a.tenant_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2
      )
      UNION ALL
      (
        SELECT 
          'message' as type,
          m.id,
          CASE WHEN m.is_read THEN 'read' ELSE 'unread' END as status,
          m.created_at as activity_date,
          COALESCE(p.title, 'General Message') as property_title,
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

    res.json({
      success: true,
      data: activities.rows
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities'
    });
  }
});

// Recent activities for landlord
router.get('/landlord/recent-activities', authenticate, isLandlord, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const activities = await pool.query(
      `(
        SELECT 
          'application' as type,
          a.id,
          a.status,
          a.created_at as activity_date,
          p.title as property_title,
          p.id as property_id,
          u.full_name as user_name
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
          'message' as type,
          m.id,
          CASE WHEN m.is_read THEN 'read' ELSE 'unread' END as status,
          m.created_at as activity_date,
          COALESCE(p.title, 'General Message') as property_title,
          m.property_id,
          u.full_name as user_name
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
          'review' as type,
          r.id,
          r.rating::text as status,
          r.created_at as activity_date,
          p.title as property_title,
          p.id as property_id,
          u.full_name as user_name
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

    res.json({
      success: true,
      data: activities.rows
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities'
    });
  }
});

// Admin Dashboard Stats
router.get('/admin/stats', authenticate, async (req, res) => {
  try {
    // Check if user is admin
    const adminCheck = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!adminCheck.rows[0]?.is_admin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE user_type = 'tenant') as total_tenants,
        (SELECT COUNT(*) FROM users WHERE user_type = 'landlord') as total_landlords,
        (SELECT COUNT(*) FROM users WHERE identity_verified = TRUE) as verified_users,
        (SELECT COUNT(*) FROM users WHERE subscription_active = TRUE) as active_subscriptions,
        (SELECT COUNT(*) FROM properties) as total_properties,
        (SELECT COUNT(*) FROM properties WHERE is_available = TRUE) as available_properties,
        (SELECT COUNT(*) FROM properties WHERE is_verified = FALSE) as pending_verification,
        (SELECT COUNT(*) FROM applications) as total_applications,
        (SELECT COUNT(*) FROM applications WHERE status = 'pending') as pending_applications,
        (SELECT SUM(amount) FROM payments WHERE payment_status = 'completed') as total_revenue,
        (SELECT SUM(amount) FROM payments WHERE payment_type = 'tenant_subscription' AND payment_status = 'completed') as subscription_revenue,
        (SELECT SUM(amount) FROM payments WHERE payment_type = 'landlord_listing' AND payment_status = 'completed') as listing_revenue,
        (SELECT COUNT(*) FROM reviews) as total_reviews,
        (SELECT AVG(rating) FROM reviews) as avg_rating
    `);

    res.json({
      success: true,
      data: stats.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin statistics'
    });
  }
});

module.exports = router;