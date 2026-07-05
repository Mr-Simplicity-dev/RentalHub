const db = require('../config/middleware/database');

const STATE_ADMIN_ROLES = new Set(['state_admin', 'state_financial_admin']);
const LGA_ADMIN_ROLES = new Set(['admin', 'lga_admin']);
const isLgaAdminRole = (role) => LGA_ADMIN_ROLES.has(String(role || '').trim().toLowerCase());
let inspectionOperationsSchemaReady = false;

const getActorName = (user) =>
  user?.full_name || user?.name || user?.email || user?.username || `User ${user?.id || ''}`.trim();

const ensureInspectionOperationsSchema = async () => {
  if (inspectionOperationsSchemaReady) return;

  await db.query(`
    ALTER TABLE property_inspection_requests
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
      ADD COLUMN IF NOT EXISTS inspection_report_url TEXT,
      ADD COLUMN IF NOT EXISTS inspection_proof_urls JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS inspection_findings JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS admin_note TEXT
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS property_inspection_operations (
      id SERIAL PRIMARY KEY,
      inspection_id INTEGER NOT NULL REFERENCES property_inspection_requests(id) ON DELETE CASCADE,
      admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      proof_url TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_property_inspection_operations_request
    ON property_inspection_operations(inspection_id, created_at DESC)
  `);

  inspectionOperationsSchemaReady = true;
};

const createInspectionOperation = async ({
  inspectionId,
  adminId,
  actorName,
  eventType,
  note,
  proofUrl,
  metadata = {}
}) => {
  await ensureInspectionOperationsSchema();
  await db.query(
    `INSERT INTO property_inspection_operations (
      inspection_id, admin_id, actor_name, event_type, note, proof_url, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      inspectionId,
      adminId || null,
      actorName || null,
      eventType,
      note || null,
      proofUrl || null,
      JSON.stringify(metadata || {})
    ]
  );
};

const getRequesterStateScope = async (user) => {
  const result = await db.query(
    `SELECT assigned_state FROM users WHERE id = $1 LIMIT 1`,
    [user.id]
  );
  return String(result.rows?.[0]?.assigned_state || '').trim() || null;
};

const getRequesterScope = async (user) => {
  const role = user?.user_type || user?.userType;
  if (isLgaAdminRole(role)) {
    const result = await db.query(
      `SELECT assigned_state, assigned_city FROM users WHERE id = $1 LIMIT 1`,
      [user.id]
    );
    const row = result.rows[0] || {};
    return {
      assignedState: String(row.assigned_state || '').trim() || null,
      assignedCity: String(row.assigned_city || '').trim() || null,
    };
  }
  const assignedState = await getRequesterStateScope(user);
  return { assignedState, assignedCity: null };
};

exports.getInspections = async (req, res) => {
  try {
    await ensureInspectionOperationsSchema();
    const { assignedState, assignedCity } = await getRequesterScope(req.user);

    if (STATE_ADMIN_ROLES.has(req.user?.user_type) && !assignedState) {
      return res.status(403).json({
        success: false,
        message: 'State admin account is missing assigned_state',
      });
    }

    if (isLgaAdminRole(req.user?.user_type) && (!assignedState || !assignedCity)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is missing assigned state or local government',
      });
    }

    const status = req.query.status || '';
    const search = String(req.query.search || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    let paramIndex = 0;

    if (assignedState) {
      paramIndex++;
      conditions.push(`LOWER(TRIM(s.state_name)) = LOWER(TRIM($${paramIndex}))`);
      params.push(assignedState);
      if (assignedCity) {
        paramIndex++;
        conditions.push(`LOWER(TRIM(COALESCE(p.lga_name, ''))) = LOWER(TRIM($${paramIndex}))`);
        params.push(assignedCity);
      }
    }

    if (status) {
      paramIndex++;
      conditions.push(`pir.status = $${paramIndex}`);
      params.push(status);
    }

    if (search) {
      paramIndex++;
      conditions.push(`(
        p.title ILIKE $${paramIndex}
        OR u.full_name ILIKE $${paramIndex}
        OR u.email ILIKE $${paramIndex}
        OR p.full_address ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*)
       FROM property_inspection_requests pir
       JOIN properties p ON p.id = pir.property_id
       JOIN states s ON s.id = p.state_id
       JOIN users u ON u.id = pir.tenant_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await db.query(
      `SELECT
         pir.id,
         pir.tenant_id,
         pir.property_id,
         pir.application_id,
         pir.payment_id,
         pir.amount,
         pir.status,
         pir.tenant_note,
         pir.inspection_summary,
         pir.started_at,
         pir.cancelled_at,
         pir.cancellation_reason,
         pir.inspection_report_url,
         pir.inspection_proof_urls,
         pir.inspection_findings,
         pir.admin_note,
         pir.assigned_admin_id,
         pir.requested_at,
         pir.paid_at,
         pir.completed_at,
         pir.updated_at,
         p.title AS property_title,
         p.full_address,
         p.city,
         p.area,
         p.lga_name,
         p.rent_amount,
         p.payment_frequency,
         s.state_name,
         u.full_name AS tenant_name,
         u.email AS tenant_email,
         u.phone AS tenant_phone,
         a_admin.full_name AS assigned_admin_name,
         pay.transaction_reference,
         pay.payment_status
       FROM property_inspection_requests pir
       JOIN properties p ON p.id = pir.property_id
       JOIN states s ON s.id = p.state_id
       JOIN users u ON u.id = pir.tenant_id
       LEFT JOIN users a_admin ON a_admin.id = pir.assigned_admin_id
       LEFT JOIN payments pay ON pay.id = pir.payment_id
       ${whereClause}
       ORDER BY pir.requested_at DESC
       LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    req.logger.error('Admin get inspections error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load inspection requests',
    });
  }
};

exports.getInspectionById = async (req, res) => {
  try {
    await ensureInspectionOperationsSchema();
    const { id } = req.params;

    const result = await db.query(
      `SELECT
         pir.id,
         pir.tenant_id,
         pir.property_id,
         pir.application_id,
         pir.payment_id,
         pir.amount,
         pir.status,
         pir.tenant_note,
         pir.inspection_summary,
         pir.started_at,
         pir.cancelled_at,
         pir.cancellation_reason,
         pir.inspection_report_url,
         pir.inspection_proof_urls,
         pir.inspection_findings,
         pir.admin_note,
         pir.assigned_admin_id,
         pir.requested_at,
         pir.paid_at,
         pir.completed_at,
         pir.updated_at,
         p.title AS property_title,
         p.full_address,
         p.city,
         p.area,
         p.lga_name,
         p.rent_amount,
         p.payment_frequency,
         p.description AS property_description,
         s.state_name,
         u.full_name AS tenant_name,
         u.email AS tenant_email,
         u.phone AS tenant_phone,
         a_admin.full_name AS assigned_admin_name,
         a_admin.email AS assigned_admin_email,
         pay.transaction_reference,
         pay.payment_status,
         pay.amount AS payment_amount,
         pay.completed_at AS payment_completed_at
       FROM property_inspection_requests pir
       JOIN properties p ON p.id = pir.property_id
       JOIN states s ON s.id = p.state_id
       JOIN users u ON u.id = pir.tenant_id
       LEFT JOIN users a_admin ON a_admin.id = pir.assigned_admin_id
       LEFT JOIN payments pay ON pay.id = pir.payment_id
       WHERE pir.id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Inspection request not found',
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    req.logger.error('Admin get inspection by id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load inspection request',
    });
  }
};

exports.assignInspection = async (req, res) => {
  try {
    await ensureInspectionOperationsSchema();
    const { id } = req.params;
    const adminId = req.user.id;

    const inspection = await db.query(
      `SELECT * FROM property_inspection_requests WHERE id = $1`,
      [id]
    );

    if (!inspection.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Inspection request not found',
      });
    }

    const insp = inspection.rows[0];

    if (!['paid', 'assigned'].includes(insp.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign inspection with status '${insp.status}'`,
      });
    }

    if (insp.status === 'assigned' && insp.assigned_admin_id !== adminId) {
      return res.status(409).json({
        success: false,
        message: 'This inspection is already assigned to another admin',
      });
    }

    await db.query(
      `UPDATE property_inspection_requests
       SET assigned_admin_id = $1,
           status = CASE WHEN status = 'paid' THEN 'assigned' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [adminId, id]
    );

    await createInspectionOperation({
      inspectionId: id,
      adminId,
      actorName: getActorName(req.user),
      eventType: 'assigned',
      note: 'Inspection assigned to admin',
      metadata: { previous_status: insp.status, new_status: 'assigned' }
    });

    return res.json({
      success: true,
      message: 'Inspection assigned successfully',
      data: { id, assigned_admin_id: adminId, status: 'assigned' },
    });
  } catch (error) {
    req.logger.error('Admin assign inspection error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign inspection',
    });
  }
};

exports.startInspection = async (req, res) => {
  try {
    await ensureInspectionOperationsSchema();
    const { id } = req.params;
    const adminId = req.user.id;
    const note = String(req.body?.admin_note || req.body?.note || '').trim();

    const inspection = await db.query(
      `SELECT * FROM property_inspection_requests WHERE id = $1`,
      [id]
    );

    if (!inspection.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Inspection request not found',
      });
    }

    const insp = inspection.rows[0];

    if (!['assigned', 'inspecting'].includes(insp.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot start inspection with status '${insp.status}'`,
      });
    }

    if (insp.assigned_admin_id !== adminId) {
      return res.status(403).json({
        success: false,
        message: 'You are not the assigned admin for this inspection',
      });
    }

    await db.query(
      `UPDATE property_inspection_requests
       SET status = 'inspecting',
           started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
           admin_note = COALESCE(NULLIF($1, ''), admin_note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [note, id]
    );

    await createInspectionOperation({
      inspectionId: id,
      adminId,
      actorName: getActorName(req.user),
      eventType: 'started',
      note: note || 'Inspection started',
      metadata: { previous_status: insp.status, new_status: 'inspecting' }
    });

    return res.json({
      success: true,
      message: 'Inspection started',
      data: { id, status: 'inspecting' },
    });
  } catch (error) {
    req.logger.error('Admin start inspection error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start inspection',
    });
  }
};

exports.getInspectionOperations = async (req, res) => {
  try {
    await ensureInspectionOperationsSchema();
    const { id } = req.params;

    const inspection = await db.query(
      `SELECT id FROM property_inspection_requests WHERE id = $1`,
      [id]
    );

    if (!inspection.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Inspection request not found',
      });
    }

    const result = await db.query(
      `SELECT *
       FROM property_inspection_operations
       WHERE inspection_id = $1
       ORDER BY created_at DESC, id DESC`,
      [id]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    req.logger.error('Admin get inspection operations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load inspection history',
    });
  }
};

exports.completeInspection = async (req, res) => {
  try {
    await ensureInspectionOperationsSchema();
    const { id } = req.params;
    const adminId = req.user.id;
    const {
      inspection_summary,
      inspection_report_url = '',
      inspection_proof_urls = [],
      inspection_findings = {},
      admin_note = ''
    } = req.body;

    if (!inspection_summary || !String(inspection_summary).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Inspection summary is required',
      });
    }

    const inspection = await db.query(
      `SELECT * FROM property_inspection_requests WHERE id = $1`,
      [id]
    );

    if (!inspection.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Inspection request not found',
      });
    }

    const insp = inspection.rows[0];

    if (!['assigned', 'inspecting'].includes(insp.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot complete inspection with status '${insp.status}'`,
      });
    }

    if (insp.assigned_admin_id !== adminId) {
      return res.status(403).json({
        success: false,
        message: 'You are not the assigned admin for this inspection',
      });
    }

    await db.query(
      `UPDATE property_inspection_requests
       SET status = 'completed',
           inspection_summary = $1,
           inspection_report_url = $2,
           inspection_proof_urls = $3,
           inspection_findings = $4,
           admin_note = $5,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        String(inspection_summary).trim(),
        String(inspection_report_url || '').trim() || null,
        JSON.stringify(Array.isArray(inspection_proof_urls) ? inspection_proof_urls : []),
        JSON.stringify(inspection_findings && typeof inspection_findings === 'object' ? inspection_findings : {}),
        String(admin_note || '').trim() || null,
        id
      ]
    );

    await createInspectionOperation({
      inspectionId: id,
      adminId,
      actorName: getActorName(req.user),
      eventType: 'completed',
      note: String(admin_note || inspection_summary).trim(),
      proofUrl: String(inspection_report_url || '').trim() || null,
      metadata: {
        previous_status: insp.status,
        new_status: 'completed',
        proof_count: Array.isArray(inspection_proof_urls) ? inspection_proof_urls.length : 0,
        findings: inspection_findings || {}
      }
    });

    return res.json({
      success: true,
      message: 'Inspection completed successfully',
      data: { id, status: 'completed' },
    });
  } catch (error) {
    req.logger.error('Admin complete inspection error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete inspection',
    });
  }
};

exports.cancelInspection = async (req, res) => {
  try {
    await ensureInspectionOperationsSchema();
    const { id } = req.params;
    const adminId = req.user.id;
    const cancellationReason = String(req.body?.cancellation_reason || req.body?.admin_note || '').trim();

    if (!cancellationReason) {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required',
      });
    }

    const inspection = await db.query(
      `SELECT * FROM property_inspection_requests WHERE id = $1`,
      [id]
    );

    if (!inspection.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Inspection request not found',
      });
    }

    const insp = inspection.rows[0];

    if (['completed', 'cancelled'].includes(insp.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel inspection with status '${insp.status}'`,
      });
    }

    if (insp.assigned_admin_id && insp.assigned_admin_id !== adminId) {
      return res.status(403).json({
        success: false,
        message: 'You are not the assigned admin for this inspection',
      });
    }

    await db.query(
      `UPDATE property_inspection_requests
       SET status = 'cancelled',
           cancellation_reason = $2,
           admin_note = $2,
           cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id, cancellationReason]
    );

    await createInspectionOperation({
      inspectionId: id,
      adminId,
      actorName: getActorName(req.user),
      eventType: 'cancelled',
      note: cancellationReason,
      metadata: { previous_status: insp.status, new_status: 'cancelled' }
    });

    return res.json({
      success: true,
      message: 'Inspection cancelled',
      data: { id, status: 'cancelled' },
    });
  } catch (error) {
    req.logger.error('Admin cancel inspection error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel inspection',
    });
  }
};
