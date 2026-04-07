const AdminAgentService = require('../services/adminAgentService');

class AdminAgentController {
  /**
   * Get all assignments
   */
  static async getAssignments(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view assignments',
        });
      }

      const { landlordId, agentId, status, limit = 50, offset = 0 } = req.query;

      const assignments = await AdminAgentService.getAssignments({
        landlordId: landlordId ? parseInt(landlordId) : null,
        agentId: agentId ? parseInt(agentId) : null,
        status,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      res.json({
        success: true,
        data: assignments,
      });
    } catch (error) {
      console.error(`Error fetching assignments: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch assignments',
      });
    }
  }

  /**
   * Assign agent to landlord
   */
  static async assignAgent(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to assign agents',
        });
      }

      const { landlordId, agentId, permissions } = req.body;

      if (!landlordId || !agentId) {
        return res.status(400).json({
          success: false,
          message: 'landlordId and agentId are required',
        });
      }

      const assignment = await AdminAgentService.assignAgent(
        parseInt(landlordId),
        parseInt(agentId),
        permissions || {},
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: 'Agent assigned successfully',
        data: assignment,
      });
    } catch (error) {
      console.error(`Error assigning agent: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to assign agent',
      });
    }
  }

  /**
   * Update agent permissions
   */
  static async updatePermissions(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to update permissions',
        });
      }

      const { assignmentId } = req.params;
      const { permissions } = req.body;

      if (!permissions) {
        return res.status(400).json({
          success: false,
          message: 'permissions object is required',
        });
      }

      const assignment = await AdminAgentService.updatePermissions(parseInt(assignmentId), permissions);

      res.json({
        success: true,
        message: 'Permissions updated successfully',
        data: assignment,
      });
    } catch (error) {
      console.error(`Error updating permissions: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update permissions',
      });
    }
  }

  /**
   * Revoke assignment
   */
  static async revokeAssignment(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to revoke assignments',
        });
      }

      const { assignmentId } = req.params;

      const assignment = await AdminAgentService.revokeAssignment(parseInt(assignmentId), req.user.id);

      res.json({
        success: true,
        message: 'Assignment revoked successfully',
        data: assignment,
      });
    } catch (error) {
      console.error(`Error revoking assignment: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to revoke assignment',
      });
    }
  }

  /**
   * Get assignment details
   */
  static async getAssignmentDetails(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view assignment details',
        });
      }

      const { assignmentId } = req.params;

      const assignment = await AdminAgentService.getAssignmentDetails(parseInt(assignmentId));

      res.json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      console.error(`Error fetching assignment details: ${error.message}`);
      res.status(404).json({
        success: false,
        message: error.message || 'Assignment not found',
      });
    }
  }

  /**
   * Deactivate assignment
   */
  static async deactivateAssignment(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to deactivate assignments',
        });
      }

      const { assignmentId } = req.params;

      const assignment = await AdminAgentService.deactivateAssignment(parseInt(assignmentId));

      res.json({
        success: true,
        message: 'Assignment deactivated successfully',
        data: assignment,
      });
    } catch (error) {
      console.error(`Error deactivating assignment: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to deactivate assignment',
      });
    }
  }

  /**
   * Reactivate assignment
   */
  static async reactivateAssignment(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to reactivate assignments',
        });
      }

      const { assignmentId } = req.params;

      const assignment = await AdminAgentService.reactivateAssignment(parseInt(assignmentId));

      res.json({
        success: true,
        message: 'Assignment reactivated successfully',
        data: assignment,
      });
    } catch (error) {
      console.error(`Error reactivating assignment: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to reactivate assignment',
      });
    }
  }
}

module.exports = AdminAgentController;
