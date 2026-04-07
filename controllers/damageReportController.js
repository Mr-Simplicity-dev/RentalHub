const DamageReportVisibilityService = require('../services/damageReportVisibilityService');
const db = require('../config/middleware/database');

const canManageDamageReport = async (reportId, user) => {
  if (!user) return false;
  if (user.user_type === 'admin' || user.user_type === 'super_admin') return true;

  const reportResult = await db.query(
    `SELECT landlord_id
     FROM property_damage_reports
     WHERE id = $1
     LIMIT 1`,
    [reportId]
  );

  if (reportResult.rows.length === 0) return false;

  const landlordId = reportResult.rows[0].landlord_id;
  if (landlordId === user.id) return true;

  if (user.user_type === 'agent') {
    const assignment = await db.query(
      `SELECT 1
       FROM landlord_agents
       WHERE landlord_user_id = $1
         AND agent_user_id = $2
         AND status = 'active'
         AND can_manage_damage_reports = TRUE
       LIMIT 1`,
      [landlordId, user.id]
    );
    return assignment.rows.length > 0;
  }

  return false;
};

class DamageReportController {
  /**
   * Get latest published damage report for tenants
   */
  static async getLatestPublishedReport(req, res) {
    try {
      const { propertyId } = req.params;

      const report = await DamageReportVisibilityService.getLatestPublishedReport(propertyId);

      if (!report) {
        return res.json({
          success: true,
          data: null,
          message: 'No published damage reports for this property',
        });
      }

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      console.error(`Error fetching latest published report: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch damage report',
      });
    }
  }

  /**
   * Get all reports for a property (landlord/admin only)
   */
  static async getPropertyReports(req, res) {
    try {
      const { propertyId } = req.params;
      const { status, limit = 50, offset = 0 } = req.query;

      // Verify authorization: owner or admin
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        // Verify property ownership
        const propertyResult = await db.query(
          `SELECT landlord_id FROM properties WHERE id = $1`,
          [propertyId]
        );

        if (propertyResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Property not found',
          });
        }

        const landlordId = propertyResult.rows[0].landlord_id;
        let authorized = landlordId === req.user.id;

        if (!authorized && req.user.user_type === 'agent') {
          const assignment = await db.query(
            `SELECT 1
             FROM landlord_agents
             WHERE landlord_user_id = $1
               AND agent_user_id = $2
               AND status = 'active'
               AND can_manage_damage_reports = TRUE
             LIMIT 1`,
            [landlordId, req.user.id]
          );
          authorized = assignment.rows.length > 0;
        }

        if (!authorized) {
          return res.status(403).json({
            success: false,
            message: 'Unauthorized to access these reports',
          });
        }
      }

      const reports = await DamageReportVisibilityService.getPropertyReports(propertyId, {
        status,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      console.error(`Error fetching property reports: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch reports',
      });
    }
  }

  /**
   * Publish damage report (make visible to tenants)
   */
  static async publishReport(req, res) {
    try {
      const { reportId } = req.params;

      const allowed = await canManageDamageReport(reportId, req.user);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to publish reports',
        });
      }

      const report = await DamageReportVisibilityService.publishReport(reportId, req.user.id);

      res.json({
        success: true,
        message: 'Report published successfully',
        data: report,
      });
    } catch (error) {
      console.error(`Error publishing report: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to publish report',
      });
    }
  }

  /**
   * Unpublish damage report (hide from tenants)
   */
  static async unpublishReport(req, res) {
    try {
      const { reportId } = req.params;

      const allowed = await canManageDamageReport(reportId, req.user);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to unpublish reports',
        });
      }

      const report = await DamageReportVisibilityService.unpublishReport(reportId);

      res.json({
        success: true,
        message: 'Report unpublished successfully',
        data: report,
      });
    } catch (error) {
      console.error(`Error unpublishing report: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to unpublish report',
      });
    }
  }

  /**
   * Update damage report
   */
  static async updateReport(req, res) {
    try {
      const { reportId } = req.params;
      const updates = req.body;

      const allowed = await canManageDamageReport(reportId, req.user);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to update reports',
        });
      }

      const report = await DamageReportVisibilityService.updateReport(reportId, updates);

      res.json({
        success: true,
        message: 'Report updated successfully',
        data: report,
      });
    } catch (error) {
      console.error(`Error updating report: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update report',
      });
    }
  }

  /**
   * Delete damage report
   */
  static async deleteReport(req, res) {
    try {
      const { reportId } = req.params;

      const allowed = await canManageDamageReport(reportId, req.user);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to delete reports',
        });
      }

      await DamageReportVisibilityService.deleteReport(reportId);

      res.json({
        success: true,
        message: 'Report deleted successfully',
      });
    } catch (error) {
      console.error(`Error deleting report: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete report',
      });
    }
  }

  /**
   * Get report summary
   */
  static async getReportSummary(req, res) {
    try {
      const { propertyId } = req.params;

      const summary = await DamageReportVisibilityService.getReportSummary(propertyId);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error(`Error fetching report summary: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch summary',
      });
    }
  }
}

module.exports = DamageReportController;
