const crypto = require('crypto');
const db = require('../middleware/database');
const { getFrontendUrl } = require('./frontendUrl');
const { statesMatch } = require('./stateScope');

const FRONTEND_URL = getFrontendUrl();
const AGENT_INVITE_EXPIRY_HOURS = 72;
const AGENT_INVITE_EXPIRY_MS = AGENT_INVITE_EXPIRY_HOURS * 60 * 60 * 1000;

let agentSystemSchemaReady = false;

const DEFAULT_AGENT_PERMISSIONS = {
  can_manage_properties: true,
  can_manage_damage_reports: true,
  can_manage_disputes: true,
  can_manage_legal: true,
  can_manage_finances: false,
};

const hashAgentInviteToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const normalizeAgentPermissions = (permissions = {}) => ({
  ...DEFAULT_AGENT_PERMISSIONS,
  ...Object.fromEntries(
    Object.entries(permissions || {}).map(([key, value]) => [key, value === true])
  ),
});

const ensureAgentSystemSchema = async () => {
  if (agentSystemSchemaReady) return;

  await db.query(`
    DO $$
    DECLARE
      existing_check_name TEXT;
    BEGIN
      SELECT c.conname
      INTO existing_check_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'users'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%user_type%';

      IF existing_check_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', existing_check_name);
      END IF;
    END $$;

    ALTER TABLE users
      ADD CONSTRAINT users_user_type_check
      CHECK (
        user_type IN (
          'tenant',
          'landlord',
          'lawyer',
          'admin',
          'state_admin',
          'state_financial_admin',
          'super_admin',
          'financial_admin',
          'super_financial_admin',
          'agent'
        )
      );

    CREATE TABLE IF NOT EXISTS landlord_agents (
      id SERIAL PRIMARY KEY,
      landlord_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      can_manage_properties BOOLEAN NOT NULL DEFAULT TRUE,
      can_manage_damage_reports BOOLEAN NOT NULL DEFAULT TRUE,
      can_manage_disputes BOOLEAN NOT NULL DEFAULT TRUE,
      can_manage_legal BOOLEAN NOT NULL DEFAULT TRUE,
      can_manage_finances BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP,
      UNIQUE (landlord_user_id, agent_user_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_landlord_agents_active_landlord
      ON landlord_agents(landlord_user_id)
      WHERE status = 'active';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_landlord_agents_active_agent
      ON landlord_agents(agent_user_id)
      WHERE status = 'active';

    CREATE TABLE IF NOT EXISTS agent_invites (
      id SERIAL PRIMARY KEY,
      landlord_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      agent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      agent_full_name VARCHAR(255),
      agent_email VARCHAR(255) NOT NULL,
      agent_phone VARCHAR(20),
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      accepted_at TIMESTAMP,
      last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resent_count INTEGER NOT NULL DEFAULT 0,
      can_manage_properties BOOLEAN NOT NULL DEFAULT TRUE,
      can_manage_damage_reports BOOLEAN NOT NULL DEFAULT TRUE,
      can_manage_disputes BOOLEAN NOT NULL DEFAULT TRUE,
      can_manage_legal BOOLEAN NOT NULL DEFAULT TRUE,
      can_manage_finances BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_agent_invites_landlord
      ON agent_invites(landlord_user_id);

    CREATE INDEX IF NOT EXISTS idx_agent_invites_email
      ON agent_invites(agent_email);

    CREATE INDEX IF NOT EXISTS idx_agent_invites_status
      ON agent_invites(status, expires_at);
  `);

  agentSystemSchemaReady = true;
};

const getActiveAgentAssignmentByAgentId = async (agentUserId) => {
  await ensureAgentSystemSchema();

  const result = await db.query(
    `SELECT
       la.*,
       landlord.full_name AS landlord_name,
       landlord.email AS landlord_email,
       landlord.phone AS landlord_phone
     FROM landlord_agents la
     JOIN users landlord ON landlord.id = la.landlord_user_id
     WHERE la.agent_user_id = $1
       AND la.status = 'active'
     LIMIT 1`,
    [agentUserId]
  );

  return result.rows[0] || null;
};

const getActiveAgentAssignmentByLandlordId = async (landlordUserId) => {
  await ensureAgentSystemSchema();

  const result = await db.query(
    `SELECT
       la.*,
       agent.full_name AS agent_name,
       agent.email AS agent_email,
       agent.phone AS agent_phone
     FROM landlord_agents la
     JOIN users agent ON agent.id = la.agent_user_id
     WHERE la.landlord_user_id = $1
       AND la.status = 'active'
     LIMIT 1`,
    [landlordUserId]
  );

  return result.rows[0] || null;
};

const getPendingAgentInviteByLandlordId = async (landlordUserId) => {
  await ensureAgentSystemSchema();

  const result = await db.query(
    `SELECT *
     FROM agent_invites
     WHERE landlord_user_id = $1
       AND status = 'pending'
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY id DESC
     LIMIT 1`,
    [landlordUserId]
  );

  return result.rows[0] || null;
};

const getPropertyManagerContext = async ({
  user,
  propertyId = null,
  requiredPermission = 'can_manage_properties',
}) => {
  await ensureAgentSystemSchema();

  if (!user?.id) {
    return { authorized: false, message: 'Unauthorized' };
  }

  if (user.user_type === 'landlord') {
    if (propertyId) {
      const propertyCheck = await db.query(
        `SELECT id, landlord_id, title
         FROM properties
         WHERE id = $1
           AND landlord_id = $2
         LIMIT 1`,
        [propertyId, user.id]
      );

      if (!propertyCheck.rows.length) {
        return { authorized: false, message: 'Property not found or unauthorized' };
      }

      return {
        authorized: true,
        landlordUserId: user.id,
        actingUserId: user.id,
        isAgent: false,
        property: propertyCheck.rows[0],
      };
    }

    return {
      authorized: true,
      landlordUserId: user.id,
      actingUserId: user.id,
      isAgent: false,
    };
  }

  if (user.user_type !== 'agent') {
    return { authorized: false, message: 'Access denied' };
  }

  const assignment = await getActiveAgentAssignmentByAgentId(user.id);

  if (!assignment) {
    return {
      authorized: false,
      message: 'You do not have an active landlord assignment',
    };
  }

  if (requiredPermission && assignment[requiredPermission] !== true) {
    return {
      authorized: false,
      message: 'You do not have permission to manage this landlord task',
    };
  }

  const agentStateResult = await db.query(
    `SELECT assigned_state
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [user.id]
  );

  const agentAssignedState = agentStateResult.rows[0]?.assigned_state || null;
  if (!agentAssignedState) {
    return {
      authorized: false,
      message: 'Agent assigned_state is not configured. Request state migration or contact admin.',
    };
  }

  if (propertyId) {
    const propertyCheck = await db.query(
      `SELECT id, landlord_id, title, state
       FROM properties
       WHERE id = $1
         AND landlord_id = $2
       LIMIT 1`,
      [propertyId, assignment.landlord_user_id]
    );

    if (!propertyCheck.rows.length) {
      return { authorized: false, message: 'Property not found or unauthorized' };
    }

    if (!statesMatch(agentAssignedState, propertyCheck.rows[0].state)) {
      return {
        authorized: false,
        message: 'Agent state lock violation: this property is outside your assigned state',
      };
    }

    return {
      authorized: true,
      landlordUserId: assignment.landlord_user_id,
      actingUserId: user.id,
      isAgent: true,
      assignment,
      assigned_state: agentAssignedState,
      property: propertyCheck.rows[0],
    };
  }

  return {
    authorized: true,
    landlordUserId: assignment.landlord_user_id,
    actingUserId: user.id,
    isAgent: true,
    assignment,
    assigned_state: agentAssignedState,
  };
};

const inviteAgentForLandlord = async ({
  landlordUserId,
  assignedByUserId,
  landlordName,
  agentFullName,
  agentEmail,
  agentPhone,
  permissions,
  sendAgentInviteEmail,
  sendAgentAssignmentNoticeEmail,
}) => {
  await ensureAgentSystemSchema();

  const cleanEmail = String(agentEmail || '').trim().toLowerCase();
  const cleanFullName = String(agentFullName || '').trim();
  const cleanPhone = String(agentPhone || '').replace(/\s+/g, '');
  const permissionSet = normalizeAgentPermissions(permissions);

  if (!cleanEmail || !cleanFullName || !cleanPhone) {
    const error = new Error('Agent full name, email, and phone are required');
    error.statusCode = 400;
    throw error;
  }

  const activeAssignment = await getActiveAgentAssignmentByLandlordId(landlordUserId);
  if (activeAssignment) {
    const error = new Error('This landlord already has an active agent assigned');
    error.statusCode = 400;
    throw error;
  }

  const pendingInvite = await getPendingAgentInviteByLandlordId(landlordUserId);
  if (pendingInvite) {
    const error = new Error('This landlord already has a pending agent invite');
    error.statusCode = 400;
    throw error;
  }

  const existingUserResult = await db.query(
    `SELECT id, user_type, full_name, email, assigned_state
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [cleanEmail]
  );

  if (existingUserResult.rows.length) {
    const existingUser = existingUserResult.rows[0];

    if (existingUser.user_type !== 'agent') {
      const error = new Error('Agent email already belongs to a non-agent account');
      error.statusCode = 409;
      throw error;
    }

    if (!existingUser.assigned_state) {
      const error = new Error('Agent assigned_state is not configured');
      error.statusCode = 400;
      throw error;
    }

    const landlordStatesResult = await db.query(
      `SELECT DISTINCT state
       FROM properties
       WHERE landlord_id = $1
         AND state IS NOT NULL`,
      [landlordUserId]
    );

    const landlordStates = landlordStatesResult.rows.map((row) => row.state).filter(Boolean);
    if (landlordStates.length) {
      const hasMatch = landlordStates.some((state) => statesMatch(state, existingUser.assigned_state));
      if (!hasMatch) {
        const error = new Error(
          `State lock violation: agent is assigned to ${existingUser.assigned_state} but landlord properties are in ${landlordStates.join(', ')}`
        );
        error.statusCode = 400;
        throw error;
      }
    }

    const assignmentResult = await db.query(
      `INSERT INTO landlord_agents (
         landlord_user_id,
         agent_user_id,
         assigned_by_user_id,
         status,
         can_manage_properties,
         can_manage_damage_reports,
         can_manage_disputes,
         can_manage_legal,
         can_manage_finances
       )
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)
       ON CONFLICT (landlord_user_id, agent_user_id)
       DO UPDATE SET
         assigned_by_user_id = EXCLUDED.assigned_by_user_id,
         status = 'active',
         can_manage_properties = EXCLUDED.can_manage_properties,
         can_manage_damage_reports = EXCLUDED.can_manage_damage_reports,
         can_manage_disputes = EXCLUDED.can_manage_disputes,
         can_manage_legal = EXCLUDED.can_manage_legal,
         can_manage_finances = EXCLUDED.can_manage_finances,
         revoked_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        landlordUserId,
        existingUser.id,
        assignedByUserId || landlordUserId,
        permissionSet.can_manage_properties,
        permissionSet.can_manage_damage_reports,
        permissionSet.can_manage_disputes,
        permissionSet.can_manage_legal,
        permissionSet.can_manage_finances,
      ]
    );

    if (typeof sendAgentAssignmentNoticeEmail === 'function') {
      await sendAgentAssignmentNoticeEmail({
        email: cleanEmail,
        landlordName,
        inviterName: landlordName,
        dashboardUrl: `${FRONTEND_URL}/agent/dashboard`,
      });
    }

    return {
      mode: 'existing_agent_assigned',
      assignment: assignmentResult.rows[0],
      agent_user_id: existingUser.id,
      agent_email: cleanEmail,
      agent_full_name: existingUser.full_name || cleanFullName,
    };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashAgentInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + AGENT_INVITE_EXPIRY_MS);

  const inviteResult = await db.query(
    `INSERT INTO agent_invites (
       landlord_user_id,
       assigned_by_user_id,
       agent_full_name,
       agent_email,
       agent_phone,
       token_hash,
       expires_at,
       can_manage_properties,
       can_manage_damage_reports,
       can_manage_disputes,
       can_manage_legal,
       can_manage_finances
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, agent_email, agent_full_name, agent_phone, expires_at`,
    [
      landlordUserId,
      assignedByUserId || landlordUserId,
      cleanFullName,
      cleanEmail,
      cleanPhone,
      tokenHash,
      expiresAt,
      permissionSet.can_manage_properties,
      permissionSet.can_manage_damage_reports,
      permissionSet.can_manage_disputes,
      permissionSet.can_manage_legal,
      permissionSet.can_manage_finances,
    ]
  );

  const inviteUrl = `${FRONTEND_URL}/agent/accept-invite?token=${rawToken}`;

  if (typeof sendAgentInviteEmail === 'function') {
    await sendAgentInviteEmail({
      email: cleanEmail,
      landlordName,
      agentName: cleanFullName,
      inviteUrl,
      expiresInHours: AGENT_INVITE_EXPIRY_HOURS,
    });
  }

  return {
    mode: 'invite_sent',
    invite: inviteResult.rows[0],
    agent_email: cleanEmail,
    agent_full_name: cleanFullName,
  };
};

module.exports = {
  AGENT_INVITE_EXPIRY_HOURS,
  DEFAULT_AGENT_PERMISSIONS,
  ensureAgentSystemSchema,
  getActiveAgentAssignmentByAgentId,
  getActiveAgentAssignmentByLandlordId,
  getPendingAgentInviteByLandlordId,
  getPropertyManagerContext,
  hashAgentInviteToken,
  inviteAgentForLandlord,
  normalizeAgentPermissions,
};
