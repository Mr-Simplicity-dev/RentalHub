const express = require('express');
const { param } = require('express-validator');
const DamageReportController = require('../controllers/damageReportController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

const router = express.Router();

/**
 * Damage Report Visibility Routes
 * Public tenants can see latest published reports
 * Landlords/admins manage publication status
 */

// Get latest published damage report for a property (public/tenant view)
router.get(
	'/properties/:propertyId/damage-report/latest-published',
	[param('propertyId').isInt({ min: 1 }).withMessage('propertyId must be a positive integer')],
	validateRequest,
	DamageReportController.getLatestPublishedReport
);

// Get all damage reports for a property (requires auth - owner/admin)
router.get(
	'/properties/:propertyId/damage-reports',
	authenticate,
	[param('propertyId').isInt({ min: 1 }).withMessage('propertyId must be a positive integer')],
	validateRequest,
	DamageReportController.getPropertyReports
);

// Get damage report summary
router.get(
	'/properties/:propertyId/damage-reports/summary',
	authenticate,
	[param('propertyId').isInt({ min: 1 }).withMessage('propertyId must be a positive integer')],
	validateRequest,
	DamageReportController.getReportSummary
);

// Get current user's damage reports (landlord/tenant/admin)
router.get(
	'/my',
	authenticate,
	DamageReportController.getMyDamageReports
);

// Admin-only moderation queue: all damage reports with property + reporter.
router.get(
	'/admin',
	authenticate,
	async (req, res) => {
		try {
			if (req.user.user_type !== 'super_admin') {
				return res.status(403).json({ success: false, message: 'Super admin access only' });
			}
			const db = require('../config/middleware/database');
			const result = await db.query(
				`SELECT dr.*,
				        p.title AS property_title,
				        p.city, p.area,
				        COALESCE(u.full_name, l.full_name) AS reporter_name
				 FROM property_damage_reports dr
				 JOIN properties p ON p.id = dr.property_id
				 LEFT JOIN users u ON u.id = dr.created_by_user_id
				 LEFT JOIN users l ON l.id = dr.landlord_id
				 ORDER BY dr.created_at DESC
				 LIMIT 300`
			);
			res.json({ success: true, data: result.rows });
		} catch (error) {
			req.logger.error('Admin damage reports error:', error);
			res.status(500).json({ success: false, message: 'Failed to load damage reports' });
		}
	}
);

// Publish damage report (admin only)
router.post(
	'/:reportId/publish',
	authenticate,
	[param('reportId').isInt({ min: 1 }).withMessage('reportId must be a positive integer')],
	validateRequest,
	DamageReportController.publishReport
);

// Unpublish damage report (admin only)
router.post(
	'/:reportId/unpublish',
	authenticate,
	[param('reportId').isInt({ min: 1 }).withMessage('reportId must be a positive integer')],
	validateRequest,
	DamageReportController.unpublishReport
);

// Update damage report (admin only)
router.put(
	'/:reportId',
	authenticate,
	[param('reportId').isInt({ min: 1 }).withMessage('reportId must be a positive integer')],
	validateRequest,
	DamageReportController.updateReport
);

// Delete damage report (admin only)
router.delete(
	'/:reportId',
	authenticate,
	[param('reportId').isInt({ min: 1 }).withMessage('reportId must be a positive integer')],
	validateRequest,
	DamageReportController.deleteReport
);

module.exports = router;
