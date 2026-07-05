const db = require('../../config/middleware/database');
const logger = require('../../config/utils/logger');
const { logAction } = require('./schemaHelpers');

// ================= PROPERTIES =================

const ensurePropertyOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS property_operations (
      id SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_property_operations_property
      ON property_operations(property_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_property_operations_created
      ON property_operations(created_at DESC)
  `);
};

const createPropertyOperation = async ({
  propertyId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO property_operations (
       property_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      propertyId,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

// GET /api/super/properties
const getAllProperties = async (req, res) => {
  try {
    await ensurePropertyOperationSchema();

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const countResult = await db.query('SELECT COUNT(*) AS total FROM properties');
    const total = parseInt(countResult.rows[0]?.total || 0, 10);

    const { rows } = await db.query(
      `SELECT p.*, u.full_name AS landlord_name,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM properties p
       LEFT JOIN users u ON u.id = p.landlord_id
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM property_operations
           WHERE property_id = p.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ success: true, properties: rows, total });
  } catch (err) {
    req.logger.error('getAllProperties error:', err);
    res.status(500).json({ message: 'Failed to load properties', error: err.message });
  }
};

// PATCH /api/super/properties/:id/unlist
const unlistProperty = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensurePropertyOperationSchema();

    if (!reason) {
      return res.status(400).json({ message: 'An unlist reason is required' });
    }

    const result = await db.query(
      `UPDATE properties
       SET is_available = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, landlord_id, user_id, is_available, featured`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Property not found' });
    }

    await db.query(
      'DELETE FROM saved_properties WHERE property_id = $1',
      [id]
    );

    await createPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_unlisted',
      note: reason,
      metadata: result.rows[0],
    });

    await logAction(req.user.id, 'UNLIST_PROPERTY', 'property', id);

    res.json({ success: true, message: 'Property unlisted' });
  } catch (err) {
    req.logger.error(err);
    res.status(500).json({ message: 'Failed to unlist property' });
  }
};

// PATCH /api/super/properties/:id/feature
const featureProperty = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensurePropertyOperationSchema();

    if (!reason) {
      return res.status(400).json({ message: 'A feature reason is required' });
    }

    const result = await db.query(
      `UPDATE properties
       SET featured = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, landlord_id, user_id, is_available, featured`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Property not found' });
    }

    await createPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_featured',
      note: reason,
      metadata: result.rows[0],
    });

    await logAction(req.user.id, 'FEATURE_PROPERTY', 'property', id);

    res.json({ success: true, message: 'Property marked as featured' });
  } catch (err) {
    req.logger.error(err);
    res.status(500).json({ message: 'Failed to feature property' });
  }
};

// PATCH /api/super/properties/:id/unfeature
const unfeatureProperty = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensurePropertyOperationSchema();

    if (!reason) {
      return res.status(400).json({ message: 'An unfeature reason is required' });
    }

    const result = await db.query(
      `UPDATE properties
       SET featured = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, landlord_id, user_id, is_available, featured`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Property not found' });
    }

    await createPropertyOperation({
      propertyId: Number(id),
      actor: req.user,
      eventType: 'property_unfeatured',
      note: reason,
      metadata: result.rows[0],
    });

    await logAction(req.user.id, 'UNFEATURE_PROPERTY', 'property', id);

    res.json({ success: true, message: 'Property removed from featured' });
  } catch (err) {
    req.logger.error(err);
    res.status(500).json({ message: 'Failed to unfeature property' });
  }
};


module.exports = {
  ensurePropertyOperationSchema,
  createPropertyOperation,
  getAllProperties,
  unlistProperty,
  featureProperty,
  unfeatureProperty,
};

