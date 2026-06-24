const db = require('../config/middleware/database');

class DamageReportVisibilityService {
  /**
   * Get latest published damage report for a property (tenant view)
   */
  static async getLatestPublishedReport(propertyId) {
    try {
      const result = await db.query(
        `SELECT dr.*, u.full_name as landlord_name, u.email as landlord_email
         FROM property_damage_reports dr
         LEFT JOIN users u ON dr.landlord_id = u.id
         WHERE dr.property_id = $1 AND dr.status = 'published'
         ORDER BY dr.published_at DESC
         LIMIT 1`,
        [propertyId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      return null;
    } catch (error) {
      console.error(`Error fetching latest published report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all reports for a property (landlord/admin view)
   */
  static async getPropertyReports(propertyId, filters = {}) {
    const { status = null, limit = 50, offset = 0 } = filters;

    try {
      let query = `
        SELECT dr.*, u.full_name as landlord_name, u.email as landlord_email
        FROM property_damage_reports dr
        LEFT JOIN users u ON dr.landlord_id = u.id
        WHERE dr.property_id = $1
      `;

      const params = [propertyId];
      let paramIndex = 2;

      if (status) {
        query += ` AND dr.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY dr.published_at DESC, dr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error(`Error fetching property reports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Publish a damage report (make visible to tenants)
   */
  static async publishReport(reportId, publishedByUserId) {
    try {
      const result = await db.query(
        `UPDATE property_damage_reports
         SET status = 'published', 
             is_visible_to_tenant = TRUE,
             published_at = CURRENT_TIMESTAMP,
             published_by_user_id = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [publishedByUserId, reportId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      throw new Error('Report not found');
    } catch (error) {
      console.error(`Error publishing report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unpublish a damage report (hide from tenants)
   */
  static async unpublishReport(reportId) {
    try {
      const result = await db.query(
        `UPDATE property_damage_reports
         SET status = 'draft', 
             is_visible_to_tenant = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [reportId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      throw new Error('Report not found');
    } catch (error) {
      console.error(`Error unpublishing report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update report details
   */
  static async updateReport(reportId, updates = {}) {
    const {
      roomLocation,
      damageType,
      description,
      widthCm,
      heightCm,
      depthLevel,
      severity,
      urgency,
      reportTitle,
      recommendation,
    } = updates;

    try {
      const query = `
        UPDATE property_damage_reports
        SET ${
          roomLocation ? 'room_location = $1,' : ''
        }
        ${damageType ? `damage_type = ${roomLocation ? '$2' : '$1'},` : ''}
        ${description ? `description = ${roomLocation ? '$' : '$'}${[roomLocation, damageType].filter(Boolean).length + 1},` : ''}
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $${[roomLocation, damageType, description, widthCm, heightCm, depthLevel, severity, urgency, reportTitle, recommendation].filter(
          (v) => v !== undefined
        ).length + 1}
        RETURNING *
      `;

      // Simplified approach - create query based on non-null values
      let updateFields = [];
      let params = [];
      let paramIndex = 1;

      if (roomLocation !== undefined) {
        updateFields.push(`room_location = $${paramIndex++}`);
        params.push(roomLocation);
      }
      if (damageType !== undefined) {
        updateFields.push(`damage_type = $${paramIndex++}`);
        params.push(damageType);
      }
      if (description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(description);
      }
      if (widthCm !== undefined) {
        updateFields.push(`width_cm = $${paramIndex++}`);
        params.push(widthCm);
      }
      if (heightCm !== undefined) {
        updateFields.push(`height_cm = $${paramIndex++}`);
        params.push(heightCm);
      }
      if (depthLevel !== undefined) {
        updateFields.push(`depth_level = $${paramIndex++}`);
        params.push(depthLevel);
      }
      if (severity !== undefined) {
        updateFields.push(`severity = $${paramIndex++}`);
        params.push(severity);
      }
      if (urgency !== undefined) {
        updateFields.push(`urgency = $${paramIndex++}`);
        params.push(urgency);
      }
      if (reportTitle !== undefined) {
        updateFields.push(`report_title = $${paramIndex++}`);
        params.push(reportTitle);
      }
      if (recommendation !== undefined) {
        updateFields.push(`recommendation = $${paramIndex++}`);
        params.push(recommendation);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields provided to update');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      const finalQuery = `
        UPDATE property_damage_reports
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++}
        RETURNING *
      `;

      params.push(reportId);

      const result = await db.query(finalQuery, params);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      throw new Error('Report not found');
    } catch (error) {
      console.error(`Error updating report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a damage report
   */
  static async deleteReport(reportId) {
    try {
      const result = await db.query(
        `DELETE FROM property_damage_reports WHERE id = $1 RETURNING id`,
        [reportId]
      );

      if (result.rows.length > 0) {
        return true;
      }

      throw new Error('Report not found');
    } catch (error) {
      console.error(`Error deleting report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get report summary for property
   */
  static async getReportSummary(propertyId) {
    try {
      const result = await db.query(
        `SELECT 
          COUNT(*) as total_reports,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_count,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
          MAX(published_at) as latest_published_date
         FROM property_damage_reports
         WHERE property_id = $1`,
        [propertyId]
      );

      return result.rows[0] || {};
    } catch (error) {
      console.error(`Error fetching report summary: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DamageReportVisibilityService;
