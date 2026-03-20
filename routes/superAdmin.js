const express = require('express');
const { authenticate, requireSuperAdmin } = require('../config/middleware/auth');
const superCtrl = require('../controllers/superAdmin.controller');
const audit = require('../config/middleware/auditMiddleware');

const router = express.Router();

router.get('/users', authenticate, requireSuperAdmin, superCtrl.getAllUsers);
router.patch('/users/:id/ban', authenticate, requireSuperAdmin, superCtrl.banUser);
router.patch('/users/:id/unban', authenticate, requireSuperAdmin, superCtrl.unbanUser);
router.delete('/users/:id', authenticate, requireSuperAdmin, superCtrl.deleteUser);
router.patch('/users/:id/promote', authenticate, requireSuperAdmin, superCtrl.promoteToAdmin);

router.get('/properties', authenticate, requireSuperAdmin, superCtrl.getAllProperties);
router.patch('/properties/:id/unlist', authenticate, requireSuperAdmin, audit('unlist_property', 'property'), superCtrl.unlistProperty);
router.patch('/properties/:id/feature', authenticate, requireSuperAdmin, superCtrl.featureProperty);
router.patch('/properties/:id/unfeature', authenticate, requireSuperAdmin, superCtrl.unfeatureProperty);

router.patch('/verify/:userId', authenticate, requireSuperAdmin, superCtrl.verifyUser);
router.get('/verifications', authenticate, requireSuperAdmin, superCtrl.getIdentityVerifications);
router.patch('/verifications/:userId/approve', authenticate, requireSuperAdmin, superCtrl.approveIdentityVerification);
router.patch('/verifications/:userId/reject', authenticate, requireSuperAdmin, superCtrl.rejectIdentityVerification);
router.delete('/verifications/:userId', authenticate, requireSuperAdmin, superCtrl.deleteRejectedVerification);
router.get('/admins/performance', authenticate, requireSuperAdmin, superCtrl.getAdminPerformance);

router.get('/logs', authenticate, requireSuperAdmin, superCtrl.getAuditLogs);

router.get('/analytics', authenticate, requireSuperAdmin, superCtrl.getAnalytics);

router.get('/reports', authenticate, requireSuperAdmin, superCtrl.getReports);
router.patch('/reports/:id', authenticate, requireSuperAdmin, superCtrl.updateReportStatus);
router.patch('/reports/:reportId/resolve', authenticate, requireSuperAdmin, audit('resolve_report', 'report'), superCtrl.resolveReport);

router.get('/broadcasts', authenticate, requireSuperAdmin, superCtrl.getBroadcasts);
router.post('/broadcasts', authenticate, requireSuperAdmin, superCtrl.createBroadcast);

router.post('/users/bulk', authenticate, requireSuperAdmin, superCtrl.bulkUserAction);
router.post('/properties/bulk', authenticate, requireSuperAdmin, superCtrl.bulkPropertyAction);

router.get('/flags', authenticate, requireSuperAdmin, superCtrl.getFeatureFlags);
router.patch('/flags/:key', authenticate, requireSuperAdmin, superCtrl.updateFeatureFlag);

router.get('/pricing-rules', authenticate, requireSuperAdmin, superCtrl.getPricingRules);
router.post('/pricing-rules', authenticate, requireSuperAdmin, superCtrl.createPricingRule);
router.patch('/pricing-rules/:ruleId', authenticate, requireSuperAdmin, superCtrl.updatePricingRule);
router.delete('/pricing-rules/:ruleId', authenticate, requireSuperAdmin, superCtrl.removePricingRule);

router.get('/fraud', authenticate, requireSuperAdmin, superCtrl.getFraudFlags);
router.patch('/fraud/:id/resolve', authenticate, requireSuperAdmin, superCtrl.resolveFraudFlag);

module.exports = router;
