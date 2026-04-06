const DamageReportVisibilityService = require('../services/damageReportVisibilityService');
const logger = require('../config/logging');

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
      logger.error(`Error fetching latest published report: ${error.message}`);
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
        const propertyResult = await global.db.query(
          `SELECT landlord_id FROM properties WHERE id = $1`,
          [propertyId]
        );

        if (propertyResult.rows.length === 0 || propertyResult.rows[0].landlord_id !== req.user.id) {
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
      logger.error(`Error fetching property reports: ${error.message}`);
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

      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
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
      logger.error(`Error publishing report: ${error.message}`);
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

      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
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
      logger.error(`Error unpublishing report: ${error.message}`);
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

      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
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
      logger.error(`Error updating report: ${error.message}`);
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

      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
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
      logger.error(`Error deleting report: ${error.message}`);
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
      logger.error(`Error fetching report summary: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch summary',
      });
    }
  }
}

module.exports = DamageReportController;
