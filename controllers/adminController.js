const db = require('../config/middleware/database');
const { sendEmail } = require('../config/utils/mailer');
const { notifyAlertsForProperty } = require('../config/utils/propertyAlertService');

let verificationAuditSchemaReady = false;

const ensureVerificationAuditSchema = async () => {
  if (verificationAuditSchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS identity_verified_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMP;

    CREATE INDEX IF NOT EXISTS idx_users_identity_verified_by
      ON users(identity_verified_by);
  `);

  verificationAuditSchemaReady = true;
};

// GET /api/admin/stats
exports.getStats = async (req, res) => {
  try {
    const totalUsers = await db.query(
      `SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`
    );
    const totalProperties = await db.query(
      `SELECT COUNT(*) FROM properties`
    );
    const applications = await db.query(
      `SELECT COUNT(*) FROM applications`
    );
    const pendingVerifications = await db.query(
      `SELECT COUNT(*) FROM users
       WHERE deleted_at IS NULL
         AND identity_verified = FALSE
         AND user_type IN ('tenant', 'landlord')`
    );

    res.json({
      success: true,
      data: {
        totalUsers: Number(totalUsers.rows[0].count),
        totalProperties: Number(totalProperties.rows[0].count),
        applications: Number(applications.rows[0].count),
        pendingVerifications: Number(pendingVerifications.rows[0].count),
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load admin stats'
    });
  }
};

// GET /api/admin/users
// GET /api/admin/users?search=&role=&page=&limit=
exports.getAllUsers = async (req, res) => {
  try {
    const {
      search = '',
      state = '',
      role = 'all',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;

    const where = [];
    const params = [];
    let i = 1;

    // Base condition
    where.push(`u.deleted_at IS NULL`);
    if (req.user?.user_type === 'admin') {
      where.push(`u.user_type <> 'super_admin'`);
    }

    // Role filter
    if (role && role !== 'all') {
      where.push(`u.user_type = $${i++}`);
      params.push(role);
    }

    // Search filter (name, email, phone)
    if (search) {
      where.push(`(
        u.full_name ILIKE $${i} OR
        u.email ILIKE $${i} OR
        u.phone ILIKE $${i} OR
        ls.state ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    // State filter (landlord's latest property state)
    if (state) {
      where.push(`ls.state ILIKE $${i++}`);
      params.push(`%${state}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const fromClause = `
      FROM users u
      LEFT JOIN LATERAL (
        SELECT p.state
        FROM properties p
        WHERE p.landlord_id = u.id
        ORDER BY p.created_at DESC
        LIMIT 1
      ) ls ON TRUE
    `;

    // Total count
    const countQuery = `
      SELECT COUNT(*) 
      ${fromClause}
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    // Data query
    const dataQuery = `
      SELECT u.id, u.full_name, u.email, u.phone, u.user_type,
             u.email_verified, u.phone_verified, u.identity_verified,
             u.created_at, ls.state
      ${fromClause}
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const dataParams = [...params, pageSize, offset];
    const result = await db.query(dataQuery, dataParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load users',
    });
  }
};


// GET /api/admin/verifications/pending
exports.getPendingVerifications = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const {
      search = '',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;

    const where = [
      `deleted_at IS NULL`,
      `email_verified = TRUE`,
      `phone_verified = TRUE`,
      `identity_verified = FALSE`,
      `passport_photo_url IS NOT NULL`,
      `(nin IS NOT NULL OR international_passport_number IS NOT NULL)`,
      `user_type IN ('tenant', 'landlord')`,
    ];

    const params = [];
    let i = 1;

    if (search) {
      where.push(`(
        full_name ILIKE $${i} OR
        email ILIKE $${i} OR
        nin ILIKE $${i} OR
        international_passport_number ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*)
      FROM users
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    const dataQuery = `
      SELECT id, full_name, email, nin, identity_document_type,
             international_passport_number, nationality,
             passport_photo_url, user_type, created_at
      FROM users
      ${whereClause}
      ORDER BY created_at ASC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const result = await db.query(dataQuery, [...params, pageSize, offset]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Pending verifications error:', err);
    res.status(500).json({ success: false, message: 'Failed to load verifications' });
  }
};


// POST /api/admin/verifications/:id/approve
exports.approveVerification = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const userId = req.params.id;
    const adminId = req.user.id;

    const result = await db.query(
      `UPDATE users
       SET identity_verified = TRUE,
           identity_verified_by = $2,
           identity_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type IN ('tenant', 'landlord')
         AND passport_photo_url IS NOT NULL
         AND (nin IS NOT NULL OR international_passport_number IS NOT NULL)
       RETURNING id`,
      [userId, adminId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not eligible for admin verification',
      });
    }

    res.json({ success: true, message: 'User verified successfully' });
  } catch (err) {
    console.error('Approve verification error:', err);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
};

// POST /api/admin/verifications/:id/reject
exports.rejectVerification = async (req, res) => {
  try {
    await ensureVerificationAuditSchema();

    const userId = req.params.id;

    const result = await db.query(
      `UPDATE users
       SET passport_photo_url = NULL,
           identity_verified = FALSE,
           identity_verified_by = NULL,
           identity_verified_at = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND user_type IN ('tenant', 'landlord')
       RETURNING id`,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not eligible for admin rejection',
      });
    }

    res.json({ success: true, message: 'Verification rejected' });
  } catch (err) {
    console.error('Reject verification error:', err);
    res.status(500).json({ success: false, message: 'Rejection failed' });
  }
};

// GET /api/admin/properties
exports.getAllProperties = async (req, res) => {
  try {
    const {
      search = '',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;

    const where = [];
    const params = [];
    let i = 1;

    if (search) {
      where.push(`(
        p.title ILIKE $${i} OR
        u.full_name ILIKE $${i} OR
        p.city ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    const dataQuery = `
      SELECT 
        p.id,
        p.title,
        p.rent_amount,
        p.status,
        p.created_at,
        p.city,
        p.state,
        u.full_name AS landlord_name
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const result = await db.query(dataQuery, [...params, pageSize, offset]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Admin properties error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load properties',
    });
  }
};

// GET /api/admin/properties/pending
exports.getPendingProperties = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        p.*, 
        u.full_name AS landlord_name,
        u.email AS landlord_email
      FROM properties p
      LEFT JOIN users u ON p.landlord_id = u.id
      WHERE p.is_verified = FALSE
        AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error('Pending properties error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load pending properties',
    });
  }
};

// PATCH /api/admin/properties/:id/approve
exports.approveProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

          const result = await db.query(
        `
        UPDATE properties
        SET is_verified = TRUE,
            status = 'available',
            verified_by = $2,
            verified_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id, title, landlord_id, property_type, state_id, city, area, rent_amount, bedrooms, bathrooms
        `,
        [id, adminId]
      );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const property = result.rows[0];

    // 🔔 Notify landlord by email
    const landlordResult = await db.query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [property.landlord_id]
    );

    if (landlordResult.rows.length) {
      const landlord = landlordResult.rows[0];

      try {
        await sendEmail({
        to: landlord.email,
        subject: 'Your property has been approved 🎉',
        html: `
          <p>Hello ${landlord.full_name},</p>
          <p>Your property <strong>${property.title}</strong> has been approved and is now live.</p>
          <p>You can manage it from your dashboard.</p>
        `,
        });
      } catch (mailError) {
        console.error('Failed to send approval email:', mailError.message);
      }
    }

    notifyAlertsForProperty(property).catch((err) => {
      console.error('Tenant alert notification failed:', err);
    });

    res.json({
      success: true,
      message: 'Property approved successfully',
      data: property,
    });
  } catch (err) {
    console.error('Approve property error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to approve property',
    });
  }
};


// PATCH /api/admin/properties/:id/reject
exports.rejectProperty = async (req, res) => {
  try {
    const { id } = req.params;

        const result = await db.query(
      `
      UPDATE properties
      SET status = 'rejected',
    is_verified = FALSE,
    rejection_reason = $2
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id, title, landlord_id
      `,
      [id]
    );


    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const property = result.rows[0];

const landlord = await db.query(
  'SELECT email, full_name FROM users WHERE id = $1',
  [property.landlord_id]
);

    if (landlord.rows.length) {
      await sendEmail({
        to: landlord.rows[0].email,
        subject: 'Your property needs changes',
        html: `
          <p>Hello ${landlord.rows[0].full_name},</p>
          <p>Your property <b>${property.title}</b> was not approved.</p>
          <p>Please review it and resubmit.</p>
        `,
      });
    }


    res.json({
      success: true,
      message: 'Property rejected successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Reject property error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reject property',
    });
  }
};


// GET /api/admin/applications
exports.getAllApplications = async (req, res) => {
  try {
    const {
      search = '',
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Number(limit) || 20, 100);
    const offset = (currentPage - 1) * pageSize;

    const where = [];
    const params = [];
    let i = 1;

    if (search) {
      where.push(`(
        t.full_name ILIKE $${i} OR
        p.title ILIKE $${i} OR
        l.full_name ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)
      FROM applications a
      JOIN users t ON a.tenant_id = t.id
      JOIN properties p ON a.property_id = p.id
      LEFT JOIN users l ON p.user_id = l.id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = Number(countResult.rows[0].count);

    const dataQuery = `
      SELECT 
        a.id,
        a.status,
        a.created_at,
        t.full_name AS tenant_name,
        p.title AS property_title,
        l.full_name AS landlord_name
      FROM applications a
      JOIN users t ON a.tenant_id = t.id
      JOIN properties p ON a.property_id = p.id
      LEFT JOIN users l ON p.user_id = l.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const result = await db.query(dataQuery, [...params, pageSize, offset]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Admin applications error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load applications',
    });
  }
};

// DELETE (soft) /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    const currentUserId = req.user.userId || req.user.id;
    if (Number(id) === Number(currentUserId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }

    const targetResult = await db.query(
      'SELECT user_type FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (!targetResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const targetType = targetResult.rows[0].user_type;
    if (req.user?.user_type === 'admin' && targetType === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin cannot delete super admin accounts',
      });
    }

    await db.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    res.json({
      success: true,
      message: 'User disabled successfully',
    });
  } catch (err) {
    console.error('Soft delete user error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to disable user',
    });
  }
};


// GET /api/admin/users/:id
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdminRequester = req.user?.user_type === 'admin';

    const result = await db.query(
      `SELECT id, full_name, email, phone, user_type,
              email_verified, phone_verified, identity_verified,
              created_at
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
         ${isAdminRequester ? `AND user_type <> 'super_admin'` : ''}`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load user' });
  }
};

// GET /api/admin/properties/:id
exports.getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT p.*, u.full_name AS landlord_name, u.email AS landlord_email
       FROM properties p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load property' });
  }
};

// GET /api/admin/applications/:id
exports.getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT 
         a.id, a.status, a.created_at,
         t.full_name AS tenant_name, t.email AS tenant_email,
         p.title AS property_title,
         l.full_name AS landlord_name
       FROM applications a
       JOIN users t ON a.tenant_id = t.id
       JOIN properties p ON a.property_id = p.id
       LEFT JOIN users l ON p.user_id = l.id
       WHERE a.id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load application' });
  }
};

// POST /api/admin/applications/:id/approve
exports.approveApplication = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE applications
       SET status = 'approved', updated_at = NOW()
       WHERE id = $1
       RETURNING id, status`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    res.json({
      success: true,
      message: 'Application approved',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Approve application error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to approve application',
    });
  }
};

// POST /api/admin/applications/:id/reject
exports.rejectApplication = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE applications
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1
       RETURNING id, status`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    res.json({
      success: true,
      message: 'Application rejected',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Reject application error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reject application',
    });
  }
};
