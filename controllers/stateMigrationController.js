const db = require('../config/middleware/database');
const { statesMatch } = require('../config/utils/stateScope');

const STATE_SUPPORT_ROLE = 'state_support_admin';
const SUPER_SUPPORT_ROLE = 'super_support_admin';
const SUPPORT_REVIEW_ROLES = [STATE_SUPPORT_ROLE, SUPER_SUPPORT_ROLE];
const MIGRATION_USER_TYPES = ['agent', 'lawyer'];
const STAGE_VALUES = ['outgoing', 'incoming', 'all'];

let stateMigrationSchemaReady = false;

const ensureStateMigrationSchema = async () => {
  if (stateMigrationSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS role_state_migration_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_type VARCHAR(20) NOT NULL,
      from_state VARCHAR(100) NOT NULL,
      to_state VARCHAR(100) NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      outgoing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      incoming_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      outgoing_reviewed_at TIMESTAMP,
      outgoing_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      outgoing_review_note TEXT,
      incoming_reviewed_at TIMESTAMP,
      incoming_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      incoming_review_note TEXT,
      super_review_status VARCHAR(20),
      super_reviewed_at TIMESTAMP,
      super_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      super_review_note TEXT,
      migration_applied_at TIMESTAMP,
      requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      review_note TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT role_state_migration_user_type_check CHECK (user_type IN ('agent', 'lawyer')),
      CONSTRAINT role_state_migration_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
      CONSTRAINT role_state_migration_outgoing_status_check CHECK (outgoing_status IN ('pending', 'approved', 'rejected')),
      CONSTRAINT role_state_migration_incoming_status_check CHECK (incoming_status IN ('pending', 'approved', 'rejected')),
      CONSTRAINT role_state_migration_super_status_check CHECK (super_review_status IS NULL OR super_review_status IN ('approved', 'rejected'))
    );

    ALTER TABLE role_state_migration_requests
      ADD COLUMN IF NOT EXISTS outgoing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS incoming_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS outgoing_reviewed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS outgoing_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS outgoing_review_note TEXT,
      ADD COLUMN IF NOT EXISTS incoming_reviewed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS incoming_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS incoming_review_note TEXT,
      ADD COLUMN IF NOT EXISTS super_review_status VARCHAR(20),
      ADD COLUMN IF NOT EXISTS super_reviewed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS super_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS super_review_note TEXT,
      ADD COLUMN IF NOT EXISTS migration_applied_at TIMESTAMP;

    ALTER TABLE role_state_migration_requests
      DROP CONSTRAINT IF EXISTS role_state_migration_status_check;

    ALTER TABLE role_state_migration_requests
      ADD CONSTRAINT role_state_migration_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

    ALTER TABLE role_state_migration_requests
      DROP CONSTRAINT IF EXISTS role_state_migration_outgoing_status_check;

    ALTER TABLE role_state_migration_requests
      ADD CONSTRAINT role_state_migration_outgoing_status_check CHECK (outgoing_status IN ('pending', 'approved', 'rejected'));

    ALTER TABLE role_state_migration_requests
      DROP CONSTRAINT IF EXISTS role_state_migration_incoming_status_check;

    ALTER TABLE role_state_migration_requests
      ADD CONSTRAINT role_state_migration_incoming_status_check CHECK (incoming_status IN ('pending', 'approved', 'rejected'));

    ALTER TABLE role_state_migration_requests
      DROP CONSTRAINT IF EXISTS role_state_migration_super_status_check;

    ALTER TABLE role_state_migration_requests
      ADD CONSTRAINT role_state_migration_super_status_check
      CHECK (super_review_status IS NULL OR super_review_status IN ('approved', 'rejected'));

    UPDATE role_state_migration_requests
    SET
      outgoing_status = CASE
        WHEN status = 'approved' THEN 'approved'
        WHEN status = 'rejected' THEN COALESCE(NULLIF(outgoing_status, 'pending'), 'rejected')
        ELSE outgoing_status
      END,
      incoming_status = CASE
        WHEN status = 'approved' THEN 'approved'
        WHEN status = 'rejected' THEN COALESCE(NULLIF(incoming_status, 'pending'), 'rejected')
        ELSE incoming_status
      END
    WHERE status IN ('approved', 'rejected');

    CREATE TABLE IF NOT EXISTS role_state_migration_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES role_state_migration_requests(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role VARCHAR(30),
      action VARCHAR(40) NOT NULL,
      direction VARCHAR(20),
      decision VARCHAR(20),
      note TEXT,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_role_state_migration_one_pending
      ON role_state_migration_requests(user_id)
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS idx_role_state_migration_user
      ON role_state_migration_requests(user_id, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_role_state_migration_status
      ON role_state_migration_requests(status, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_role_state_migration_from_state
      ON role_state_migration_requests(from_state, status, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_role_state_migration_to_state
      ON role_state_migration_requests(to_state, status, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_role_state_migration_audit_request
      ON role_state_migration_audit_logs(request_id, created_at DESC);
  `);

  stateMigrationSchemaReady = true;
};

const normalizeStateInput = (value) => String(value || '').trim();

const isStateSupport = (role) => role === STATE_SUPPORT_ROLE;
const isSuperSupport = (role) => role === SUPER_SUPPORT_ROLE;

const getReviewerProfile = async (userId) => {
  const result = await db.query(
    `SELECT id, user_type, assigned_state
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
};

const assertSupportReviewer = (reviewer) => {
  if (!reviewer || !SUPPORT_REVIEW_ROLES.includes(reviewer.user_type)) {
    return {
      allowed: false,
      status: 403,
      message: 'Support admin access required',
    };
  }

  if (isStateSupport(reviewer.user_type) && !normalizeStateInput(reviewer.assigned_state)) {
    return {
      allowed: false,
      status: 400,
      message: 'State support admin account is missing assigned_state',
    };
  }

  return { allowed: true };
};

const logAuditEvent = async ({
  client,
  requestId,
  actorId,
  actorRole,
  action,
  direction = null,
  decision = null,
  note = null,
  metadata = null,
}) => {
  await client.query(
    `INSERT INTO role_state_migration_audit_logs (
       request_id,
       actor_id,
       actor_role,
       action,
       direction,
       decision,
       note,
       metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [requestId, actorId, actorRole, action, direction, decision, note, metadata]
  );
};

const applyApprovedMigration = async ({ client, requestRow, actorId, actorRole }) => {
  if (requestRow.migration_applied_at) {
    return;
  }

  await client.query(
    `UPDATE users
     SET assigned_state = $1,
         assigned_city = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [requestRow.to_state, requestRow.user_id]
  );

  if (requestRow.user_type === 'agent') {
    await client.query(
      `UPDATE landlord_agents
       SET status = 'inactive',
           updated_at = CURRENT_TIMESTAMP
       WHERE agent_user_id = $1
         AND status = 'active'`,
      [requestRow.user_id]
    );
  }

  await client.query(
    `UPDATE role_state_migration_requests
     SET migration_applied_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [requestRow.id]
  );

  await logAuditEvent({
    client,
    requestId: requestRow.id,
    actorId,
    actorRole,
    action: 'migration_applied',
    metadata: {
      user_id: requestRow.user_id,
      user_type: requestRow.user_type,
      from_state: requestRow.from_state,
      to_state: requestRow.to_state,
    },
  });
};

const getAllowedDirectionsForReviewer = (reviewer, requestRow) => {
  const result = {
    outgoing: false,
    incoming: false,
  };

  if (isSuperSupport(reviewer.user_type)) {
    result.outgoing = true;
    result.incoming = true;
    return result;
  }

  const reviewerState = normalizeStateInput(reviewer.assigned_state);

  if (!reviewerState) {
    return result;
  }

  result.outgoing = statesMatch(reviewerState, requestRow.from_state);
  result.incoming = statesMatch(reviewerState, requestRow.to_state);
  return result;
};

const enrichQueueRow = (row, reviewer) => {
  const state = normalizeStateInput(reviewer.assigned_state);
  const allowedDirections = getAllowedDirectionsForReviewer(reviewer, row);

  return {
    ...row,
    reviewer_scope_state: isSuperSupport(reviewer.user_type) ? null : state,
    can_review_outgoing:
      allowedDirections.outgoing && row.status === 'pending' && row.outgoing_status === 'pending',
    can_review_incoming:
      allowedDirections.incoming && row.status === 'pending' && row.incoming_status === 'pending',
  };
};

exports.createMyMigrationRequest = async (req, res) => {
  try {
    await ensureStateMigrationSchema();

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const meResult = await db.query(
      `SELECT id, user_type, assigned_state
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    const me = meResult.rows[0];
    if (!me) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!MIGRATION_USER_TYPES.includes(me.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Only agent and lawyer accounts can request state migration',
      });
    }

    const fromState = normalizeStateInput(me.assigned_state);
    if (!fromState) {
      return res.status(400).json({
        success: false,
        message: 'Your current assigned_state is not set. Contact admin.',
      });
    }

    const toState = normalizeStateInput(req.body?.to_state);
    const reason = String(req.body?.reason || '').trim();

    if (!toState || !reason) {
      return res.status(400).json({
        success: false,
        message: 'to_state and reason are required',
      });
    }

    if (statesMatch(fromState, toState)) {
      return res.status(400).json({
        success: false,
        message: 'Target state must be different from your current state',
      });
    }

    const pendingCheck = await db.query(
      `SELECT id
       FROM role_state_migration_requests
       WHERE user_id = $1
         AND status = 'pending'
       LIMIT 1`,
      [userId]
    );

    if (pendingCheck.rows.length) {
      return res.status(409).json({
        success: false,
        message: 'You already have a pending migration request',
      });
    }

    const insertResult = await db.query(
      `INSERT INTO role_state_migration_requests (
         user_id,
         user_type,
         from_state,
         to_state,
         reason,
         status,
         outgoing_status,
         incoming_status
       ) VALUES ($1, $2, $3, $4, $5, 'pending', 'pending', 'pending')
       RETURNING *`,
      [userId, me.user_type, fromState, toState, reason]
    );

    return res.status(201).json({
      success: true,
      message: 'Migration request submitted successfully',
      data: insertResult.rows[0],
    });
  } catch (error) {
    console.error('Create migration request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit migration request',
    });
  }
};

exports.getMyMigrationRequests = async (req, res) => {
  try {
    await ensureStateMigrationSchema();

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await db.query(
      `SELECT *
       FROM role_state_migration_requests
       WHERE user_id = $1
       ORDER BY requested_at DESC`,
      [userId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get my migration requests error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch migration requests',
    });
  }
};

exports.listSupportQueue = async (req, res) => {
  try {
    await ensureStateMigrationSchema();

    const reviewer = await getReviewerProfile(req.user?.id);
    const reviewCheck = assertSupportReviewer(reviewer);
    if (!reviewCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: reviewCheck.message,
      });
    }

    const status = normalizeStateInput(req.query?.status);
    const stage = normalizeStateInput(req.query?.stage || 'all').toLowerCase();

    if (stage && !STAGE_VALUES.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: 'stage must be one of outgoing|incoming|all',
      });
    }

    const where = [];
    const params = [];

    if (status) {
      where.push(`r.status = $${params.length + 1}`);
      params.push(status);
    }

    if (isStateSupport(reviewer.user_type)) {
      const scopeState = normalizeStateInput(reviewer.assigned_state);
      if (stage === 'outgoing') {
        where.push(`LOWER(TRIM(r.from_state)) = LOWER(TRIM($${params.length + 1}))`);
        params.push(scopeState);
      } else if (stage === 'incoming') {
        where.push(`LOWER(TRIM(r.to_state)) = LOWER(TRIM($${params.length + 1}))`);
        params.push(scopeState);
      } else {
        where.push(`(
          LOWER(TRIM(r.from_state)) = LOWER(TRIM($${params.length + 1}))
          OR LOWER(TRIM(r.to_state)) = LOWER(TRIM($${params.length + 1}))
        )`);
        params.push(scopeState);
      }
    }

    const result = await db.query(
      `SELECT
         r.*,
         u.full_name AS user_name,
         u.email AS user_email,
         reviewer.full_name AS reviewed_by_name,
         outgoing_reviewer.full_name AS outgoing_reviewed_by_name,
         incoming_reviewer.full_name AS incoming_reviewed_by_name,
         super_reviewer.full_name AS super_reviewed_by_name
       FROM role_state_migration_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       LEFT JOIN users outgoing_reviewer ON outgoing_reviewer.id = r.outgoing_reviewed_by
       LEFT JOIN users incoming_reviewer ON incoming_reviewer.id = r.incoming_reviewed_by
       LEFT JOIN users super_reviewer ON super_reviewer.id = r.super_reviewed_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.requested_at DESC`,
      params
    );

    const queue = result.rows.map((row) => enrichQueueRow(row, reviewer));

    return res.json({
      success: true,
      data: queue,
      meta: {
        role: reviewer.user_type,
        assigned_state: reviewer.assigned_state || null,
        stage,
      },
    });
  } catch (error) {
    console.error('List support migration queue error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch migration requests',
    });
  }
};

exports.reviewMigrationByDirection = async (req, res) => {
  let client;
  try {
    await ensureStateMigrationSchema();

    const reviewer = await getReviewerProfile(req.user?.id);
    const reviewCheck = assertSupportReviewer(reviewer);
    if (!reviewCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: reviewCheck.message,
      });
    }

    const requestId = Number(req.params?.requestId);
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const direction = String(req.body?.direction || '').trim().toLowerCase();
    const reviewNote = String(req.body?.review_note || '').trim() || null;

    if (!requestId || !['approved', 'rejected'].includes(decision) || !['outgoing', 'incoming'].includes(direction)) {
      return res.status(400).json({
        success: false,
        message: 'Valid requestId, direction (outgoing|incoming), and decision (approved|rejected) are required',
      });
    }

    client = await db.connect();
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT *
       FROM role_state_migration_requests
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [requestId]
    );

    const requestRow = requestResult.rows[0];
    if (!requestRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Migration request not found' });
    }

    if (requestRow.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Request already ${requestRow.status}`,
      });
    }

    const directionPermissions = getAllowedDirectionsForReviewer(reviewer, requestRow);
    const canReviewDirection = direction === 'outgoing'
      ? directionPermissions.outgoing
      : directionPermissions.incoming;

    if (!canReviewDirection) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: direction === 'outgoing'
          ? 'You can only review outgoing requests from your assigned state'
          : 'You can only review incoming requests to your assigned state',
      });
    }

    if (direction === 'outgoing' && requestRow.outgoing_status !== 'pending' && !isSuperSupport(reviewer.user_type)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Outgoing review already ${requestRow.outgoing_status}`,
      });
    }

    if (direction === 'incoming' && requestRow.incoming_status !== 'pending' && !isSuperSupport(reviewer.user_type)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Incoming review already ${requestRow.incoming_status}`,
      });
    }

    const updateResult = direction === 'outgoing'
      ? await client.query(
          `UPDATE role_state_migration_requests
           SET outgoing_status = $1,
               outgoing_reviewed_at = CURRENT_TIMESTAMP,
               outgoing_reviewed_by = $2,
               outgoing_review_note = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4
           RETURNING *`,
          [decision, reviewer.id, reviewNote, requestId]
        )
      : await client.query(
          `UPDATE role_state_migration_requests
           SET incoming_status = $1,
               incoming_reviewed_at = CURRENT_TIMESTAMP,
               incoming_reviewed_by = $2,
               incoming_review_note = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4
           RETURNING *`,
          [decision, reviewer.id, reviewNote, requestId]
        );

    let updated = updateResult.rows[0];

    await logAuditEvent({
      client,
      requestId,
      actorId: reviewer.id,
      actorRole: reviewer.user_type,
      action: 'support_review',
      direction,
      decision,
      note: reviewNote,
      metadata: {
        from_state: requestRow.from_state,
        to_state: requestRow.to_state,
      },
    });

    if (decision === 'rejected') {
      const finalResult = await client.query(
        `UPDATE role_state_migration_requests
         SET status = 'rejected',
             reviewed_at = CURRENT_TIMESTAMP,
             reviewed_by = $1,
             review_note = COALESCE($2, review_note),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [reviewer.id, reviewNote, requestId]
      );
      updated = finalResult.rows[0];
    } else if (updated.outgoing_status === 'approved' && updated.incoming_status === 'approved') {
      const finalResult = await client.query(
        `UPDATE role_state_migration_requests
         SET status = 'approved',
             reviewed_at = CURRENT_TIMESTAMP,
             reviewed_by = $1,
             review_note = COALESCE($2, review_note),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [reviewer.id, reviewNote, requestId]
      );
      updated = finalResult.rows[0];

      await applyApprovedMigration({
        client,
        requestRow: updated,
        actorId: reviewer.id,
        actorRole: reviewer.user_type,
      });
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `${direction} review ${decision}`,
      data: updated,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {}
    }
    console.error('Directional support review error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to review migration request',
    });
  } finally {
    if (client) client.release();
  }
};

exports.superSupportFinalReview = async (req, res) => {
  let client;
  try {
    await ensureStateMigrationSchema();

    const reviewer = await getReviewerProfile(req.user?.id);
    if (!reviewer || !isSuperSupport(reviewer.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Super support admin access required',
      });
    }

    const requestId = Number(req.params?.requestId);
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const reviewNote = String(req.body?.review_note || '').trim() || null;

    if (!requestId || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Valid requestId and decision (approved|rejected) are required',
      });
    }

    client = await db.connect();
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT *
       FROM role_state_migration_requests
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [requestId]
    );

    const requestRow = requestResult.rows[0];
    if (!requestRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Migration request not found' });
    }

    if (requestRow.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Request already ${requestRow.status}`,
      });
    }

    const superReviewResult = await client.query(
      `UPDATE role_state_migration_requests
       SET super_review_status = $1,
           super_reviewed_at = CURRENT_TIMESTAMP,
           super_reviewed_by = $2,
           super_review_note = $3,
           status = $1,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $2,
           review_note = COALESCE($3, review_note),
           outgoing_status = CASE WHEN $1 = 'approved' AND outgoing_status = 'pending' THEN 'approved' ELSE outgoing_status END,
           incoming_status = CASE WHEN $1 = 'approved' AND incoming_status = 'pending' THEN 'approved' ELSE incoming_status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [decision, reviewer.id, reviewNote, requestId]
    );

    const updated = superReviewResult.rows[0];

    await logAuditEvent({
      client,
      requestId,
      actorId: reviewer.id,
      actorRole: reviewer.user_type,
      action: 'super_support_review',
      decision,
      note: reviewNote,
      metadata: {
        from_state: requestRow.from_state,
        to_state: requestRow.to_state,
        outgoing_status_before: requestRow.outgoing_status,
        incoming_status_before: requestRow.incoming_status,
      },
    });

    if (decision === 'approved') {
      await applyApprovedMigration({
        client,
        requestRow: updated,
        actorId: reviewer.id,
        actorRole: reviewer.user_type,
      });
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Super support decision ${decision}`,
      data: updated,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {}
    }
    console.error('Super support migration review error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to review migration request',
    });
  } finally {
    if (client) client.release();
  }
};

exports.getMigrationAuditLogs = async (req, res) => {
  try {
    await ensureStateMigrationSchema();

    const reviewer = await getReviewerProfile(req.user?.id);
    if (!reviewer || !isSuperSupport(reviewer.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Super support admin access required',
      });
    }

    const status = normalizeStateInput(req.query?.status);
    const fromState = normalizeStateInput(req.query?.from_state);
    const toState = normalizeStateInput(req.query?.to_state);

    const where = [];
    const params = [];

    if (status) {
      where.push(`r.status = $${params.length + 1}`);
      params.push(status);
    }

    if (fromState) {
      where.push(`LOWER(TRIM(r.from_state)) = LOWER(TRIM($${params.length + 1}))`);
      params.push(fromState);
    }

    if (toState) {
      where.push(`LOWER(TRIM(r.to_state)) = LOWER(TRIM($${params.length + 1}))`);
      params.push(toState);
    }

    const result = await db.query(
      `SELECT
         a.id,
         a.request_id,
         a.action,
         a.direction,
         a.decision,
         a.note,
         a.metadata,
         a.created_at,
         actor.full_name AS actor_name,
         actor.user_type AS actor_role,
         r.user_id,
         r.user_type,
         r.from_state,
         r.to_state,
         r.status,
         applicant.full_name AS applicant_name,
         applicant.email AS applicant_email
       FROM role_state_migration_audit_logs a
       JOIN role_state_migration_requests r ON r.id = a.request_id
       JOIN users applicant ON applicant.id = r.user_id
       LEFT JOIN users actor ON actor.id = a.actor_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC
       LIMIT 500`,
      params
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get migration audit logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch migration audit logs',
    });
  }
};
