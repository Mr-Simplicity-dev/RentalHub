const db = require('../config/middleware/database');

const logger = require('../config/utils/logger');

let schemaReady = false;

const ensureSchema = async () => {
  if (schemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS support_activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name VARCHAR(255),
      user_type VARCHAR(50),
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(50),
      entity_id INTEGER,
      metadata JSONB DEFAULT '{}'::jsonb,
      state VARCHAR(100),
      lga VARCHAR(100),
      ip_address VARCHAR(45),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  schemaReady = true;
};

exports.log = async ({ userId, userName, userType, action, entityType, entityId, metadata, state, lga, ip }) => {
  try {
    await ensureSchema();
    await db.query(
      `INSERT INTO support_activity_logs
        (user_id, user_name, user_type, action, entity_type, entity_id, metadata, state, lga, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
      [
        userId || null,
        userName || null,
        userType || null,
        action,
        entityType || null,
        entityId || null,
        JSON.stringify(metadata || {}),
        state || null,
        lga || null,
        ip || null,
      ]
    );
  } catch (err) {
    logger.error('Activity log failed:', err.message);
  }
};

exports.getLogs = async ({ userId, action, entityType, entityId, state, lga, userType, limit = 50, offset = 0 }) => {
  try {
    await ensureSchema();
    const conditions = [];
    const params = [];

    if (userId) { params.push(userId); conditions.push(`user_id = $${params.length}`); }
    if (action) { params.push(action); conditions.push(`action = $${params.length}`); }
    if (entityType) { params.push(entityType); conditions.push(`entity_type = $${params.length}`); }
    if (entityId) { params.push(entityId); conditions.push(`entity_id = $${params.length}`); }
    if (state) { params.push(state); conditions.push(`state = $${params.length}`); }
    if (lga) { params.push(lga); conditions.push(`lga = $${params.length}`); }
    if (userType) { params.push(userType); conditions.push(`user_type = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    params.push(offset);

    const result = await db.query(
      `SELECT * FROM support_activity_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return result.rows;
  } catch (err) {
    logger.error('Activity log query failed:', err.message);
    return [];
  }
};

exports.getLogsByRole = async ({ user, limit = 50, offset = 0 }) => {
  try {
    await ensureSchema();
    const role = String(user?.user_type || '').toLowerCase();
    const conditions = [];
    const params = [];

    if (role === 'super_admin') {
    } else if (role === 'super_support_admin') {
      conditions.push(`user_type != 'super_admin'`);
    } else if (role === 'state_support_admin' && user.assigned_state) {
      params.push(user.assigned_state);
      conditions.push(`state = $${params.length}`);
    } else if (role === 'lga_support_admin' && user.assigned_state) {
      params.push(user.assigned_state);
      const stateParam = `$${params.length}`;
      params.push(user.assigned_city || '');
      const lgaParam = `$${params.length}`;
      conditions.push(`(state = ${stateParam} AND lga = ${lgaParam})`);
    } else {
      params.push(user.id);
      conditions.push(`user_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    params.push(offset);

    const result = await db.query(
      `SELECT * FROM support_activity_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return result.rows;
  } catch (err) {
    logger.error('Activity log role query failed:', err.message);
    return [];
  }
};
