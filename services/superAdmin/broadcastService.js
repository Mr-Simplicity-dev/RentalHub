const db = require('../../config/middleware/database');
const { logAction } = require('./schemaHelpers');

// ================= BROADCAST =================

const ensureBroadcastOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS broadcast_operations (
      id SERIAL PRIMARY KEY,
      broadcast_id INTEGER REFERENCES broadcasts(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_broadcast_operations_broadcast
      ON broadcast_operations(broadcast_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_broadcast_operations_created
      ON broadcast_operations(created_at DESC)
  `);
};

const createBroadcastOperation = async ({
  broadcastId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO broadcast_operations (
       broadcast_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      broadcastId,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const getBroadcasts = async (req, res) => {
  try {
    await ensureBroadcastOperationSchema();

    const { rows } = await db.query(
      `SELECT b.*, u.full_name AS sender_name,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM broadcasts b
       LEFT JOIN users u ON u.id = b.sender_id
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM broadcast_operations
           WHERE broadcast_id = b.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       ORDER BY b.created_at DESC`
    );

    res.json({ success: true, broadcasts: rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load broadcasts' });
  }
};

const createBroadcast = async (req, res) => {
  const { title, message, target_role } = req.body;
  const approvalNote = String(req.body?.approval_note || req.body?.note || req.body?.reason || '').trim();

  try {
    await ensureBroadcastOperationSchema();

    if (!String(title || '').trim()) {
      return res.status(400).json({ message: 'Broadcast title is required' });
    }

    if (!String(message || '').trim()) {
      return res.status(400).json({ message: 'Broadcast message is required' });
    }

    if (!approvalNote) {
      return res.status(400).json({ message: 'A broadcast approval note is required' });
    }

    const result = await db.query(
      `INSERT INTO broadcasts (sender_id, target_role, title, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sender_id, target_role, title, message, created_at`,
      [req.user.id, target_role || null, String(title).trim(), String(message).trim()]
    );

    await createBroadcastOperation({
      broadcastId: result.rows[0].id,
      actor: req.user,
      eventType: 'broadcast_sent',
      note: approvalNote,
      metadata: {
        target_role: result.rows[0].target_role,
        title: result.rows[0].title,
      },
    });

    await logAction(req.user.id, 'CREATE_BROADCAST', 'broadcast', result.rows[0].id);

    res.json({ success: true, broadcast: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send broadcast' });
  }
};


module.exports = {
  ensureBroadcastOperationSchema,
  createBroadcastOperation,
  getBroadcasts,
  createBroadcast,
};

