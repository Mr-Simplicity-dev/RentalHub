import express from 'express';
import { authenticate, requireSuperAdmin } from '../config/middleware/auth.js';
import * as superCtrl from '../controllers/superAdmin.controller.js';

const router = express.Router();

router.get('/users', authenticate, requireSuperAdmin, superCtrl.getAllUsers);
router.patch('/users/:id/ban', authenticate, requireSuperAdmin, superCtrl.banUser);
router.patch('/users/:id/promote', authenticate, requireSuperAdmin, superCtrl.promoteToAdmin);

router.get('/properties', authenticate, requireSuperAdmin, superCtrl.getAllProperties);
router.patch('/properties/:id/unlist', authenticate, requireSuperAdmin, superCtrl.unlistProperty);

router.patch('/verify/:userId', authenticate, requireSuperAdmin, superCtrl.verifyUser);

router.get('/logs', authenticate, requireSuperAdmin, superCtrl.getAuditLogs);

router.get('/analytics', authenticate, requireSuperAdmin, superCtrl.getAnalytics);

router.get('/reports', authenticate, requireSuperAdmin, superCtrl.getReports);
router.patch('/reports/:id', authenticate, requireSuperAdmin, superCtrl.updateReportStatus);

router.get('/broadcasts', authenticate, requireSuperAdmin, superCtrl.getBroadcasts);
router.post('/broadcasts', authenticate, requireSuperAdmin, superCtrl.createBroadcast);

router.post('/users/bulk', authenticate, requireSuperAdmin, superCtrl.bulkUserAction);
router.post('/properties/bulk', authenticate, requireSuperAdmin, superCtrl.bulkPropertyAction);

router.get('/flags', authenticate, requireSuperAdmin, superCtrl.getFeatureFlags);
router.patch('/flags/:key', authenticate, requireSuperAdmin, superCtrl.updateFeatureFlag);

router.get('/fraud', authenticate, requireSuperAdmin, superCtrl.getFraudFlags);
router.patch('/fraud/:id/resolve', authenticate, requireSuperAdmin, superCtrl.resolveFraudFlag);

export default router;
