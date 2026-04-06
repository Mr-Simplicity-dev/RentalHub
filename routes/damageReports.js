const express = require('express');
const DamageReportController = require('../controllers/damageReportController');
const auth = require('../config/middleware/auth');

const router = express.Router();

/**
 * Damage Report Visibility Routes
 * Public tenants can see latest published reports
 * Landlords/admins manage publication status
 */

// Get latest published damage report for a property (public/tenant view)
router.get('/properties/:propertyId/damage-report/latest-published', DamageReportController.getLatestPublishedReport);

// Get all damage reports for a property (requires auth - owner/admin)
router.get('/properties/:propertyId/damage-reports', auth, DamageReportController.getPropertyReports);

// Get damage report summary
router.get('/properties/:propertyId/damage-reports/summary', DamageReportController.getReportSummary);

// Publish damage report (admin only)
router.post('/damage-reports/:reportId/publish', auth, DamageReportController.publishReport);

// Unpublish damage report (admin only)
router.post('/damage-reports/:reportId/unpublish', auth, DamageReportController.unpublishReport);

// Update damage report (admin only)
router.put('/damage-reports/:reportId', auth, DamageReportController.updateReport);

// Delete damage report (admin only)
router.delete('/damage-reports/:reportId', auth, DamageReportController.deleteReport);

module.exports = router;
