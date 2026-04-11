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

// Publish damage report (admin only)
router.post(
	'/damage-reports/:reportId/publish',
	authenticate,
	[param('reportId').isInt({ min: 1 }).withMessage('reportId must be a positive integer')],
	validateRequest,
	DamageReportController.publishReport
);

// Unpublish damage report (admin only)
router.post(
	'/damage-reports/:reportId/unpublish',
	authenticate,
	[param('reportId').isInt({ min: 1 }).withMessage('reportId must be a positive integer')],
	validateRequest,
	DamageReportController.unpublishReport
);

// Update damage report (admin only)
router.put(
	'/damage-reports/:reportId',
	authenticate,
	[param('reportId').isInt({ min: 1 }).withMessage('reportId must be a positive integer')],
	validateRequest,
	DamageReportController.updateReport
);

// Delete damage report (admin only)
router.delete(
	'/damage-reports/:reportId',
	authenticate,
	[param('reportId').isInt({ min: 1 }).withMessage('reportId must be a positive integer')],
	validateRequest,
	DamageReportController.deleteReport
);

module.exports = router;
