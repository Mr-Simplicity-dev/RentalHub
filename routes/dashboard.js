const express = require("express");
const router = express.Router();
const db = require("../config/middleware/database");
const { authenticate, isTenant, isLandlord } = require("../config/middleware/auth");

let tenantDashboardSchemaReady = false;
let lawyerInviteDashboardSchemaReady = false;
let propertyLocationColumnsReady = false;
let tenancyWorkflowDashboardSchemaReady = false;

const ensureTenantDashboardSchema = async () => {
  if (tenantDashboardSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_property_unlocks (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      transaction_reference VARCHAR(120),
      unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, property_id)
    );
  `);

  tenantDashboardSchemaReady = true;
};

const ensureLawyerInviteDashboardSchema = async () => {
  if (lawyerInviteDashboardSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS lawyer_invites (
      id SERIAL PRIMARY KEY,
      client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lawyer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      lawyer_email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      accepted_at TIMESTAMP,
      last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resent_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lawyer_invites_client
      ON lawyer_invites(client_user_id);
  `);

  lawyerInviteDashboardSchemaReady = true;
};

const ensurePropertyLocationColumns = async () => {
  if (propertyLocationColumnsReady) return;

  await db.query(`
    ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
    ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
  `);

  propertyLocationColumnsReady = true;
};

const ensureTenancyWorkflowDashboardSchema = async () => {
  if (tenancyWorkflowDashboardSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS refund_requests (
      id SERIAL PRIMARY KEY,
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      amount DECIMAL(12,2) NOT NULL,
      reason VARCHAR(100) NOT NULL,
      details TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP,
      refunded_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      landlord_note TEXT,
      refund_type VARCHAR(20) NOT NULL DEFAULT 'full',
      refund_months INTEGER,
      approved_amount NUMERIC(12,2)
    );

    CREATE TABLE IF NOT EXISTS tenancy_adjustment_requests (
      id SERIAL PRIMARY KEY,
      request_type VARCHAR(30) NOT NULL DEFAULT 'grace_period',
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      tenancy_expires_at TIMESTAMP,
      requested_duration_days INTEGER,
      requested_duration_months INTEGER,
      approved_duration_days INTEGER,
      approved_duration_months INTEGER,
      tenant_note TEXT,
      landlord_note TEXT,
      admin_note TEXT,
      feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      enabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      enabled_at TIMESTAMP,
      status VARCHAR(30) NOT NULL DEFAULT 'pending_admin_review',
      grace_ends_at TIMESTAMP,
      requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP,
      landlord_reviewed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE refund_requests
      ADD COLUMN IF NOT EXISTS request_category VARCHAR(40) NOT NULL DEFAULT 'standard_refund',
      ADD COLUMN IF NOT EXISTS refund_due_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS feature_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  tenancyWorkflowDashboardSchemaReady = true;
};

// =====================================================
//                 TENANT DASHBOARD STATS
// =====================================================

router.get("/tenant/stats", authenticate, isTenant, async (req, res) => {
  try {
    await ensureTenantDashboardSchema();
    await ensureLawyerInviteDashboardSchema();
    await ensureTenancyWorkflowDashboardSchema();
    const userId = req.user.id;

    const stats = await db.query(
      `SELECT 
        (
          SELECT COUNT(*)
          FROM saved_properties sp
          JOIN properties p ON sp.property_id = p.id
          WHERE sp.tenant_id = $1
            AND p.is_available = TRUE
            AND p.is_verified = TRUE
        ) AS saved_properties_count,
        (SELECT COUNT(*) FROM applications WHERE tenant_id = $1) AS total_applications,
        (SELECT COUNT(*) FROM tenant_property_unlocks WHERE tenant_id = $1) AS unlocked_properties_count,
        (SELECT COUNT(*) FROM refund_requests WHERE tenant_id = $1) AS refund_requests_count,
        (
          SELECT COUNT(*)
          FROM tenancy_adjustment_requests
          WHERE tenant_id = $1
            AND request_type = 'grace_period'
        ) AS grace_period_requests_count,
        (
          SELECT MIN(refund_due_at)
          FROM refund_requests
          WHERE tenant_id = $1
            AND request_category = 'early_exit_refund'
            AND status IN ('pending', 'approved')
            AND refund_due_at IS NOT NULL
        ) AS next_refund_due_at,
        (
          SELECT MIN(grace_ends_at)
          FROM tenancy_adjustment_requests
          WHERE tenant_id = $1
            AND request_type = 'grace_period'
            AND status = 'landlord_approved'
            AND grace_ends_at IS NOT NULL
        ) AS next_grace_ends_at,
        (SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE) AS unread_messages,
        (SELECT subscription_expires_at FROM users WHERE id = $1) AS subscription_expires_at,
        (
          SELECT lawyer_email
          FROM lawyer_invites
          WHERE client_user_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        ) AS lawyer_email,
        (CASE
          WHEN EXISTS(
            SELECT 1
            FROM lawyer_invites li
            WHERE li.client_user_id = $1
              AND li.status = 'accepted'
          ) THEN 'accepted'
          WHEN EXISTS(
            SELECT 1
            FROM lawyer_invites li
            WHERE li.client_user_id = $1
              AND li.status = 'pending'
              AND li.expires_at >= NOW()
          ) THEN 'pending'
          WHEN EXISTS(
            SELECT 1
            FROM lawyer_invites li
            WHERE li.client_user_id = $1
              AND li.status = 'pending'
              AND li.expires_at < NOW()
          ) THEN 'not_accepted'
          WHEN EXISTS(
            SELECT 1
            FROM lawyer_invites li
            WHERE li.client_user_id = $1
          ) THEN 'not_accepted'
          ELSE 'not_sent'
        END) AS lawyer_invite_status,
        (
          SELECT MAX(accepted_at)
          FROM lawyer_invites
          WHERE client_user_id = $1
        ) AS lawyer_invite_accepted_at,
        (
          SELECT MAX(expires_at)
          FROM lawyer_invites
          WHERE client_user_id = $1
        ) AS lawyer_invite_expires_at`,
      [userId]
    );

    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    console.error("Tenant dashboard stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tenant statistics",
    });
  }
});

// =====================================================
//       TENANT PAID PROPERTY LOCATIONS FOR MAPS
// =====================================================

router.get("/tenant/paid-property-locations", authenticate, isTenant, async (req, res) => {
  try {
    await ensureTenantDashboardSchema();
    await ensurePropertyLocationColumns();

    const userId = req.user.id;
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 50)
      : 6;

    const locations = await db.query(
      `WITH tenant_property_candidates AS (
        SELECT
          tu.property_id,
          tu.unlocked_at AS activity_at,
          'property_unlock'::text AS source_type,
          FALSE AS rent_paid,
          FALSE AS rent_pending
        FROM tenant_property_unlocks tu
        WHERE tu.tenant_id = $1

        UNION ALL

        SELECT
          sp.property_id,
          sp.created_at AS activity_at,
          'saved_property'::text AS source_type,
          FALSE AS rent_paid,
          FALSE AS rent_pending
        FROM saved_properties sp
        WHERE sp.tenant_id = $1

        UNION ALL

        SELECT
          p.property_id,
          COALESCE(p.completed_at, p.created_at) AS activity_at,
          p.payment_type AS source_type,
          p.payment_type = 'rent_payment' AND p.payment_status = 'completed' AS rent_paid,
          p.payment_type = 'rent_payment' AND p.payment_status = 'pending' AS rent_pending
        FROM payments p
        WHERE p.user_id = $1
          AND p.payment_type IN ('property_unlock', 'rent_payment')
          AND p.property_id IS NOT NULL
      ),
      ranked AS (
        SELECT
          property_id,
          MAX(activity_at) AS activity_at,
          BOOL_OR(rent_paid) AS rent_paid,
          BOOL_OR(rent_pending) AS rent_pending,
          BOOL_OR(source_type = 'property_unlock') AS has_property_unlock,
          BOOL_OR(source_type = 'saved_property') AS has_saved_property
        FROM tenant_property_candidates
        GROUP BY property_id
      )
      SELECT
        p.id AS property_id,
        p.title,
        p.full_address,
        p.city,
        p.area,
        p.latitude,
        p.longitude,
        s.state_name,
        r.activity_at,
        r.rent_paid,
        r.rent_pending,
        CASE
          WHEN r.rent_paid THEN 'rent_payment'
          WHEN r.rent_pending THEN 'rent_pending'
          WHEN r.has_property_unlock THEN 'property_unlock'
          WHEN r.has_saved_property THEN 'saved_property'
          ELSE 'property_access'
        END AS payment_type,
        (
          SELECT photo_url
          FROM property_photos
          WHERE property_id = p.id
          ORDER BY is_primary DESC, upload_order ASC, id ASC
          LIMIT 1
        ) AS primary_photo
      FROM ranked r
      JOIN properties p ON p.id = r.property_id
      LEFT JOIN states s ON p.state_id = s.id
      ORDER BY r.rent_paid DESC, r.activity_at DESC
      LIMIT $2`,
      [userId, limit]
    );

    res.json({
      success: true,
      data: locations.rows,
    });
  } catch (error) {
    console.error("Tenant paid property locations error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch paid property locations",
    });
  }
});

// =====================================================
//                LANDLORD DASHBOARD STATS
// =====================================================

router.get("/landlord/stats", authenticate, isLandlord, async (req, res) => {
  try {
    await ensureLawyerInviteDashboardSchema();
    await ensureTenancyWorkflowDashboardSchema();
    const userId = req.user.id;

    const stats = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM properties WHERE landlord_id = $1) AS total_properties,
        (SELECT COUNT(*) FROM properties WHERE landlord_id = $1 AND is_available = TRUE) AS available_properties,
        (SELECT COUNT(*) FROM properties WHERE landlord_id = $1 AND featured = TRUE) AS featured_properties,
        (SELECT COUNT(*) FROM applications a JOIN properties p ON a.property_id = p.id WHERE p.landlord_id = $1) AS total_applications,
        (SELECT COUNT(*) FROM applications a JOIN properties p ON a.property_id = p.id WHERE p.landlord_id = $1 AND a.status = 'pending') AS pending_applications,
        (
          SELECT COUNT(*)
          FROM refund_requests rr
          WHERE rr.landlord_id = $1
            AND rr.status = 'pending'
            AND (
              rr.request_category <> 'early_exit_refund'
              OR rr.feature_enabled = TRUE
            )
        ) AS pending_refunds_count,
        (
          SELECT COUNT(*)
          FROM tenancy_adjustment_requests tar
          WHERE tar.landlord_id = $1
            AND tar.request_type = 'grace_period'
            AND tar.status = 'enabled'
            AND tar.feature_enabled = TRUE
        ) AS pending_grace_period_count,
        (
          SELECT MIN(refund_due_at)
          FROM refund_requests rr
          WHERE rr.landlord_id = $1
            AND rr.request_category = 'early_exit_refund'
            AND rr.feature_enabled = TRUE
            AND rr.status IN ('pending', 'approved')
            AND rr.refund_due_at IS NOT NULL
        ) AS next_refund_due_at,
        (
          SELECT MIN(grace_ends_at)
          FROM tenancy_adjustment_requests tar
          WHERE tar.landlord_id = $1
            AND tar.request_type = 'grace_period'
            AND tar.status = 'landlord_approved'
            AND tar.grace_ends_at IS NOT NULL
        ) AS next_grace_ends_at,
        (SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE) AS unread_messages,
        (SELECT subscription_expires_at FROM users WHERE id = $1) AS subscription_expires_at,
        (SELECT SUM(amount) FROM payments WHERE user_id = $1 AND payment_type = 'landlord_listing' AND payment_status = 'completed') AS total_spent,
        (SELECT COUNT(*) FROM reviews r JOIN properties p ON r.property_id = p.id WHERE p.landlord_id = $1) AS total_reviews,
        (SELECT AVG(r.rating) FROM reviews r JOIN properties p ON r.property_id = p.id WHERE p.landlord_id = $1) AS avg_rating,
        (
          SELECT lawyer_email
          FROM lawyer_invites
          WHERE client_user_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        ) AS lawyer_email,
        (CASE
          WHEN EXISTS(
            SELECT 1
            FROM lawyer_invites li
            WHERE li.client_user_id = $1
              AND li.status = 'accepted'
          ) THEN 'accepted'
          WHEN EXISTS(
            SELECT 1
            FROM lawyer_invites li
            WHERE li.client_user_id = $1
              AND li.status = 'pending'
              AND li.expires_at >= NOW()
          ) THEN 'pending'
          WHEN EXISTS(
            SELECT 1
            FROM lawyer_invites li
            WHERE li.client_user_id = $1
              AND li.status = 'pending'
              AND li.expires_at < NOW()
          ) THEN 'not_accepted'
          WHEN EXISTS(
            SELECT 1
            FROM lawyer_invites li
            WHERE li.client_user_id = $1
          ) THEN 'not_accepted'
          ELSE 'not_sent'
        END) AS lawyer_invite_status,
        (
          SELECT MAX(accepted_at)
          FROM lawyer_invites
          WHERE client_user_id = $1
        ) AS lawyer_invite_accepted_at,
        (
          SELECT MAX(expires_at)
          FROM lawyer_invites
          WHERE client_user_id = $1
        ) AS lawyer_invite_expires_at`,
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
    await ensureTenantDashboardSchema();
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const activities = await db.query(
      `(
        SELECT
          'application' AS type,
          a.id,
          a.status,
          a.created_at AS activity_date,
          p.title AS property_title,
          p.id AS property_id,
          NULL::text AS user_name
        FROM applications a
        JOIN properties p ON a.property_id = p.id
        WHERE a.tenant_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2
      )
      UNION ALL
      (
        SELECT 
          'unlock' AS type,
          tu.id,
          'paid' AS status,
          tu.unlocked_at AS activity_date,
          p.title AS property_title,
          p.id AS property_id,
          NULL::text AS user_name
        FROM tenant_property_unlocks tu
        JOIN properties p ON tu.property_id = p.id
        WHERE tu.tenant_id = $1
        ORDER BY tu.unlocked_at DESC
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
        LEFT JOIN users u ON m.sender_id = u.id
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
    console.error("Tenant recent activities error:", error.message);
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

    const activities = await db.query(
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
    console.error("Landlord recent activities error:", error.message);
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
    const checkAdmin = await db.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!checkAdmin.rows[0] || !checkAdmin.rows[0].is_admin) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const stats = await db.query(`
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
        (SELECT SUM(amount) FROM payments WHERE payment_type IN ('tenant_subscription', 'tenant_multiple_property_subscription', 'landlord_subscription') AND payment_status = 'completed') AS subscription_revenue,
        (SELECT SUM(amount) FROM payments WHERE payment_type = 'landlord_listing' AND payment_status = 'completed') AS listing_revenue,
        (SELECT COUNT(*) FROM reviews) AS total_reviews,
        (SELECT AVG(rating) FROM reviews) AS avg_rating
    `);

    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    console.error("Admin dashboard stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin statistics",
    });
  }
});

module.exports = router;
