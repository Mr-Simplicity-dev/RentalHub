const db = require('../config/middleware/database');
const { statesMatch } = require('../config/utils/stateScope');

const validateAgentStateCompatibility = async (landlordUserId, agentUserId) => {
  const agentResult = await db.query(
    `SELECT assigned_state
     FROM users
     WHERE id = $1
       AND user_type = 'agent'
     LIMIT 1`,
    [agentUserId]
  );

  const agentAssignedState = agentResult.rows[0]?.assigned_state || null;
  if (!agentAssignedState) {
    throw new Error('Agent assigned_state is not configured');
  }

  const landlordStatesResult = await db.query(
    `SELECT DISTINCT state
     FROM properties
     WHERE landlord_id = $1
       AND state IS NOT NULL`,
    [landlordUserId]
  );

  const landlordStates = landlordStatesResult.rows.map((row) => row.state).filter(Boolean);
  if (!landlordStates.length) {
    return;
  }

  const hasMatch = landlordStates.some((state) => statesMatch(state, agentAssignedState));
  if (!hasMatch) {
    throw new Error(`State lock violation: agent is assigned to ${agentAssignedState} but landlord properties are in ${landlordStates.join(', ')}`);
  }
};

class AdminAgentService {
  /**
   * Get all landlord-agent assignments
   */
  static async getAssignments(filters = {}) {
    const { landlordId, agentId, status = 'active', limit = 50, offset = 0 } = filters;

    try {
      let query = `
        SELECT la.*, 
               lu.full_name as landlord_name, lu.email as landlord_email,
               au.full_name as agent_name, au.email as agent_email
        FROM landlord_agents la
        JOIN users lu ON lu.id = la.landlord_user_id
        JOIN users au ON au.id = la.agent_user_id
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      if (landlordId) {
        query += ` AND la.landlord_user_id = $${paramIndex}`;
        params.push(landlordId);
        paramIndex++;
      }

      if (agentId) {
        query += ` AND la.agent_user_id = $${paramIndex}`;
        params.push(agentId);
        paramIndex++;
      }

      if (status) {
        query += ` AND la.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY la.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error(`Error fetching assignments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Assign an agent to a landlord
   */
  static async assignAgent(landlordUserId, agentUserId, permissions = {}, assignedByUserId) {
    const {
      canManageProperties = true,
      canManageDamageReports = true,
      canManageDisputes = true,
      canManageLegal = true,
      canManageFinances = false,
    } = permissions;

    try {
      await validateAgentStateCompatibility(landlordUserId, agentUserId);

      // Check if assignment already exists
      const existingResult = await db.query(
        `SELECT id FROM landlord_agents 
         WHERE landlord_user_id = $1 AND agent_user_id = $2`,
        [landlordUserId, agentUserId]
      );

      if (existingResult.rows.length > 0) {
        throw new Error('Agent is already assigned to this landlord');
      }

      // Create assignment
      const result = await db.query(
        `INSERT INTO landlord_agents 
         (landlord_user_id, agent_user_id, assigned_by_user_id, 
          can_manage_properties, can_manage_damage_reports, can_manage_disputes, 
          can_manage_legal, can_manage_finances)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          landlordUserId,
          agentUserId,
          assignedByUserId,
          canManageProperties,
          canManageDamageReports,
          canManageDisputes,
          canManageLegal,
          canManageFinances,
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error(`Error assigning agent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update agent permissions
   */
  static async updatePermissions(assignmentId, permissions = {}) {
    const {
      canManageProperties,
      canManageDamageReports,
      canManageDisputes,
      canManageLegal,
      canManageFinances,
    } = permissions;

    try {
      let query = 'UPDATE landlord_agents SET ';
      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (canManageProperties !== undefined) {
        updates.push(`can_manage_properties = $${paramIndex}`);
        params.push(canManageProperties);
        paramIndex++;
      }

      if (canManageDamageReports !== undefined) {
        updates.push(`can_manage_damage_reports = $${paramIndex}`);
        params.push(canManageDamageReports);
        paramIndex++;
      }

      if (canManageDisputes !== undefined) {
        updates.push(`can_manage_disputes = $${paramIndex}`);
        params.push(canManageDisputes);
        paramIndex++;
      }

      if (canManageLegal !== undefined) {
        updates.push(`can_manage_legal = $${paramIndex}`);
        params.push(canManageLegal);
        paramIndex++;
      }

      if (canManageFinances !== undefined) {
        updates.push(`can_manage_finances = $${paramIndex}`);
        params.push(canManageFinances);
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new Error('No permissions provided to update');
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      query += updates.join(', ');
      query += ` WHERE id = $${paramIndex} RETURNING *`;
      params.push(assignmentId);

      const result = await db.query(query, params);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      throw new Error('Assignment not found');
    } catch (error) {
      console.error(`Error updating permissions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Revoke agent assignment
   */
  static async revokeAssignment(assignmentId, revokedByUserId) {
    try {
      const result = await db.query(
        `UPDATE landlord_agents
         SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [assignmentId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      throw new Error('Assignment not found');
    } catch (error) {
      console.error(`Error revoking assignment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get assignment details
   */
  static async getAssignmentDetails(assignmentId) {
    try {
      const result = await db.query(
        `SELECT la.*, 
                lu.full_name as landlord_name, lu.email as landlord_email, lu.phone as landlord_phone,
                au.full_name as agent_name, au.email as agent_email, au.phone as agent_phone,
                abu.full_name as assigned_by_name
         FROM landlord_agents la
         LEFT JOIN users lu ON lu.id = la.landlord_user_id
         LEFT JOIN users au ON au.id = la.agent_user_id
         LEFT JOIN users abu ON abu.id = la.assigned_by_user_id
         WHERE la.id = $1`,
        [assignmentId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      throw new Error('Assignment not found');
    } catch (error) {
      console.error(`Error fetching assignment details: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deactivate assignment (without revoking, just marking as inactive)
   */
  static async deactivateAssignment(assignmentId) {
    try {
      const result = await db.query(
        `UPDATE landlord_agents
         SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [assignmentId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      throw new Error('Assignment not found');
    } catch (error) {
      console.error(`Error deactivating assignment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reactivate assignment
   */
  static async reactivateAssignment(assignmentId) {
    try {
      const result = await db.query(
        `UPDATE landlord_agents
         SET status = 'active', revoked_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [assignmentId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      throw new Error('Assignment not found');
    } catch (error) {
      console.error(`Error reactivating assignment: ${error.message}`);
      throw error;
    }
  }
}

module.exports = AdminAgentService;
