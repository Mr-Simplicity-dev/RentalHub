const db = require('../../config/middleware/database');
const { logAction } = require('./schemaHelpers');

// ================= REPORTS =================

const ensureReportOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS report_operations (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      previous_status VARCHAR(50),
      new_status VARCHAR(50),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_report_operations_report
      ON report_operations(report_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_report_operations_created
      ON report_operations(created_at DESC)
  `);
};

const createReportOperation = async ({
  reportId,
  actor,
  eventType,
  note,
  previousStatus,
  newStatus,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO report_operations (
       report_id, actor_id, actor_name, event_type, note, previous_status, new_status, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      reportId,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      previousStatus || null,
      newStatus || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

// GET /api/super/reports
const getReports = async (req, res) => {
  try {
    await ensureReportOperationSchema();

    const { rows } = await db.query(
      `SELECT r.*, u.full_name AS reporter_name,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, previous_status, new_status, metadata, created_at
           FROM report_operations
           WHERE report_id = r.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       ORDER BY r.created_at DESC`
    );

    res.json({ success: true, reports: rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load reports' });
  }
};

// PATCH /api/super/reports/:id
const updateReportStatus = async (req, res) => {
  const { id } = req.params;
  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = String(req.body?.note || req.body?.reason || '').trim();

  try {
    await ensureReportOperationSchema();

    if (!['pending', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid report status' });
    }

    if ((status === 'resolved' || status === 'dismissed') && !note) {
      return res.status(400).json({ message: 'An investigation note is required' });
    }

    const existing = await db.query(`SELECT * FROM reports WHERE id = $1`, [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const previousStatus = existing.rows[0].status;

    await db.query(`UPDATE reports SET status = $1 WHERE id = $2`, [status, id]);

    await createReportOperation({
      reportId: Number(id),
      actor: req.user,
      eventType: status === 'resolved' ? 'report_resolved' : status === 'dismissed' ? 'report_dismissed' : 'report_reopened',
      note,
      previousStatus,
      newStatus: status,
      metadata: {
        target_type: existing.rows[0].target_type,
        target_id: existing.rows[0].target_id,
      },
    });

    await logAction(req.user.id, `REPORT_${status.toUpperCase()}`, 'report', id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update report' });
  }
};

// PATCH /api/super/reports/:reportId/resolve
const resolveReport = async (req, res) => {
  const { reportId } = req.params;
  const note = String(req.body?.note || req.body?.reason || '').trim();

  try {
    await ensureReportOperationSchema();

    if (!note) {
      return res.status(400).json({ message: 'An investigation note is required' });
    }

    const existing = await db.query(`SELECT * FROM reports WHERE id = $1`, [reportId]);
    if (!existing.rows.length) {
      return res.status(404).json({ message: 'Report not found' });
    }

    await db.query(`UPDATE reports SET status = 'resolved' WHERE id = $1`, [reportId]);

    await createReportOperation({
      reportId: Number(reportId),
      actor: req.user,
      eventType: 'report_resolved',
      note,
      previousStatus: existing.rows[0].status,
      newStatus: 'resolved',
      metadata: {
        target_type: existing.rows[0].target_type,
        target_id: existing.rows[0].target_id,
      },
    });

    await logAction(req.user.id, 'RESOLVE_REPORT', 'report', reportId);
    res.json({ success: true, message: 'Report resolved' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to resolve report' });
  }
};


module.exports = {
  ensureReportOperationSchema,
  createReportOperation,
  getReports,
  updateReportStatus,
  resolveReport,
};

