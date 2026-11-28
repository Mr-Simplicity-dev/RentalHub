const locations = require('../data/nigeriaLocations');
const { normalizeRole } = require('../config/utils/roleHierarchy');
const AdminAgentService = require('./adminAgentService');
const logger = require('../config/utils/logger');

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const findState = (value) => {
  const key = normalize(value);
  return locations.find((location) => [
    location.state,
    location.displayName,
    location.slug,
    ...(location.state === 'FCT' ? ['abuja', 'fct abuja', 'federal capital territory'] : []),
  ].some((name) => normalize(name) === key));
};

const findLga = (state, value) => {
  const key = normalize(value);
  return state?.lgas.find((name) => normalize(name) === key) || null;
};

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const isAgentEligibleForLocation = (agent, state, lga) => {
  const agentState = findState(agent.assigned_state);
  if (!agentState || agentState.state !== state.state) return false;
  const assignedLga = String(agent.assigned_lga || '').trim();
  return !assignedLga || findLga(state, assignedLga) === lga;
};

const assertStaffScope = (actor, request) => {
  const role = normalizeRole(actor?.user_type);
  if (role === 'super_admin' || actor?.user_type === 'admin') return;

  const requestState = findState(request.state_name);
  const actorState = findState(actor?.assigned_state);
  if (!requestState || !actorState || requestState.state !== actorState.state) {
    throw fail(403, 'This request is outside your assigned state.');
  }

  if (role === 'lga_admin') {
    const assignedLga = findLga(
      requestState,
      String(actor.assigned_lga || '').trim() || actor.assigned_city
    );
    if (!assignedLga || normalize(assignedLga) !== normalize(request.lga_name)) {
      throw fail(403, 'This request is outside your assigned local government area.');
    }
    return;
  }

  if (role !== 'state_admin') {
    throw fail(403, 'You are not authorized to manage listing-assistance requests.');
  }
};

const createListingAssistanceService = ({
  db,
  notify = async () => {},
  adminAgentService = AdminAgentService,
}) => {
  const notifySafely = async (...args) => {
    try {
      await notify(...args);
    } catch (error) {
      logger.error('Listing-assistance notification delivery failed:', error);
    }
  };

  const resolveLocation = async (stateId, lgaName) => {
    const result = await db.query('SELECT id, state_name FROM states WHERE id = $1 LIMIT 1', [stateId]);
    const stateRow = result.rows[0];
    if (!stateRow) throw fail(400, 'Choose a valid state.');
    const state = findState(stateRow.state_name);
    if (!state) throw fail(400, 'The selected state is not supported.');
    const lga = findLga(state, lgaName);
    if (!lga) throw fail(400, 'Choose a valid local government area for this state.');
    return { state, lga, stateId: stateRow.id };
  };

  const getEligibleAgents = async (request, executor = db) => {
    const state = findState(request.state_name);
    if (!state) return [];

    const result = await executor.query(
      `      SELECT pa.agent_user_id AS id, u.full_name,
              u.assigned_state,
              COALESCE(NULLIF(BTRIM(u.assigned_lga), ''), NULLIF(BTRIM(u.assigned_city), '')) AS assigned_lga
       FROM platform_agents pa
       JOIN users u ON u.id = pa.agent_user_id
       WHERE pa.is_active = TRUE
         AND u.user_type = 'agent'
         AND u.is_active IS DISTINCT FROM FALSE
         AND u.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM landlord_agents active_assignment
           WHERE active_assignment.agent_user_id = u.id
             AND active_assignment.status = 'active'
         )
         AND NOT EXISTS (
           SELECT 1 FROM landlord_agents prior_assignment
           WHERE prior_assignment.landlord_user_id = $1
             AND prior_assignment.agent_user_id = u.id
         )
       ORDER BY u.full_name ASC`,
      [request.landlord_user_id]
    );

    return result.rows.filter((agent) => isAgentEligibleForLocation(agent, state, request.lga_name));
  };

  const createRequest = async (landlordUserId, { stateId, lgaName, propertyId = null }) => {
    const location = await resolveLocation(stateId, lgaName);
    let property = null;
    if (propertyId !== null && propertyId !== undefined && propertyId !== '') {
      const propertyResult = await db.query(
        `SELECT p.id, p.state_id, p.lga_name, s.state_name
         FROM properties p
         JOIN states s ON s.id = p.state_id
         WHERE p.id = $1 AND p.landlord_id = $2
         LIMIT 1`,
        [propertyId, landlordUserId]
      );
      property = propertyResult.rows[0];
      if (!property) throw fail(400, 'Choose one of your properties.');
      const propertyState = findState(property.state_name);
      const propertyLga = findLga(propertyState, property.lga_name);
      if (
        !propertyState || propertyState.state !== location.state.state ||
        !propertyLga || normalize(propertyLga) !== normalize(location.lga)
      ) {
        throw fail(400, 'The selected property does not match the requested state and local government area.');
      }
    }

    const activeAssignment = await db.query(
      `SELECT id FROM landlord_agents
       WHERE landlord_user_id = $1 AND status = 'active'
       LIMIT 1`,
      [landlordUserId]
    );
    if (activeAssignment.rows.length) {
      throw fail(409, 'A property agent is already assigned to your account.');
    }

    const result = await db.query(
      `INSERT INTO landlord_listing_assistance_requests
         (landlord_user_id, property_id, state_id, state_name, lga_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [landlordUserId, property?.id || null, location.stateId, location.state.displayName, location.lga]
    );

    let request = result.rows[0];
    const created = Boolean(request);
    if (!request) {
      const existing = await db.query(
        `SELECT * FROM landlord_listing_assistance_requests
         WHERE landlord_user_id = $1 AND state_id = $2
           AND lower(lga_name) = lower($3)
           AND property_id IS NOT DISTINCT FROM $4
           AND status = 'awaiting_assignment'
         ORDER BY created_at DESC LIMIT 1`,
        [landlordUserId, location.stateId, location.lga, property?.id || null]
      );
      request = existing.rows[0];
      if (!request) throw fail(409, 'A request could not be created. Please try again.');
    }

    if (created) {
      const staff = await db.query(
        `SELECT id FROM users
         WHERE user_type IN ('admin', 'super_admin')
           AND is_active IS DISTINCT FROM FALSE AND deleted_at IS NULL`
      );
      await Promise.all(staff.rows.map((row) => notifySafely(
        row.id,
        'listing_assistance_request',
        'Landlord listing help requested',
        `A landlord requested free listing assistance in ${location.lga}, ${location.state.displayName}.`,
        '/admin/agents?tab=listing-assistance',
        `listing-assistance-request-${request.id}`
      )));
    }

    return { request, created };
  };

  const getLandlordStatus = async (landlordUserId) => {
    const [assignments, requests] = await Promise.all([
      db.query(
        `SELECT la.*, u.full_name AS agent_name
         FROM landlord_agents la
         JOIN users u ON u.id = la.agent_user_id
         WHERE la.landlord_user_id = $1 AND la.status = 'active'
         ORDER BY la.created_at DESC`,
        [landlordUserId]
      ),
      db.query(
        `SELECT r.*, p.title AS property_title
         FROM landlord_listing_assistance_requests r
         LEFT JOIN properties p ON p.id = r.property_id
         WHERE r.landlord_user_id = $1
         ORDER BY r.created_at DESC
         LIMIT 50`,
        [landlordUserId]
      ),
    ]);
    return { assignments: assignments.rows, requests: requests.rows };
  };

  const listStaffRequests = async (actor) => {
    const result = await db.query(
      `SELECT r.*, u.full_name AS landlord_name,
              p.title AS property_title
       FROM landlord_listing_assistance_requests r
       JOIN users u ON u.id = r.landlord_user_id
       LEFT JOIN properties p ON p.id = r.property_id
       WHERE r.status = 'awaiting_assignment'
       ORDER BY r.created_at ASC
       LIMIT 200`
    );
    const requests = result.rows.filter((request) => {
      try {
        assertStaffScope(actor, request);
        return true;
      } catch {
        return false;
      }
    });

    return Promise.all(requests.map(async (request) => ({
      ...request,
      eligible_agents: await getEligibleAgents(request),
    })));
  };

  const assignRequest = async (requestId, agentId, actor) => {
    const client = await db.connect();
    let assignment;
    let request;
    try {
      await client.query('BEGIN');
      const requestResult = await client.query(
        `SELECT * FROM landlord_listing_assistance_requests
         WHERE id = $1 FOR UPDATE`,
        [requestId]
      );
      request = requestResult.rows[0];
      if (!request) throw fail(404, 'Listing-assistance request not found.');
      assertStaffScope(actor, request);
      if (request.status !== 'awaiting_assignment') {
        throw fail(409, 'This request has already been assigned or closed.');
      }

      const eligibleAgents = await getEligibleAgents(request, client);
      const agent = eligibleAgents.find((candidate) => Number(candidate.id) === Number(agentId));
      if (!agent) throw fail(400, 'Choose an available platform agent assigned to this state and local government area.');

      assignment = await adminAgentService.assignListingAssistanceAgent(
        client,
        request.landlord_user_id,
        agent.id,
        actor.id,
        request.id
      );

      const updated = await client.query(
        `UPDATE landlord_listing_assistance_requests
         SET status = 'assigned', assigned_agent_user_id = $2,
             assigned_by_user_id = $3, landlord_agent_assignment_id = $4,
             assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'awaiting_assignment'
         RETURNING *`,
        [request.id, agent.id, actor.id, assignment.id]
      );
      if (!updated.rows[0]) throw fail(409, 'This request has already been assigned or closed.');
      request = updated.rows[0];
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Listing-assistance assignment rollback failed:', rollbackError);
      }
      if (error.code === '23505') {
        throw fail(409, 'The landlord or agent already has an active assignment.');
      }
      throw error;
    } finally {
      client.release();
    }

    await notifySafely(
      request.landlord_user_id,
      'listing_assistance_assigned',
      'Listing assistance assigned',
      'A platform agent has been assigned to help with your property listing. This service is free.',
      '/dashboard/properties',
      `listing-assistance-assigned-${request.id}`
    );
    return { request, assignment };
  };

  return {
    createRequest,
    getLandlordStatus,
    listStaffRequests,
    assignRequest,
    getEligibleAgents,
  };
};

module.exports = {
  createListingAssistanceService,
  isAgentEligibleForLocation,
  assertStaffScope,
};
