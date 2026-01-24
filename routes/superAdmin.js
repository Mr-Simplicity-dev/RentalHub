import express from 'express';
import { auth } from '../middlewares/auth.js';
import { requireSuperAdmin } from '../middlewares/requireSuperAdmin.js';
import * as superCtrl from '../controllers/superAdmin.controller.js';

const router = express.Router();

router.get('/users', auth, requireSuperAdmin, superCtrl.getAllUsers);
router.patch('/users/:id/ban', auth, requireSuperAdmin, superCtrl.banUser);
router.patch('/users/:id/promote', auth, requireSuperAdmin, superCtrl.promoteToAdmin);

router.get('/properties', auth, requireSuperAdmin, superCtrl.getAllProperties);
router.patch('/properties/:id/unlist', auth, requireSuperAdmin, superCtrl.unlistProperty);

router.patch('/verify/:userId', auth, requireSuperAdmin, superCtrl.verifyUser);

router.get('/logs', auth, requireSuperAdmin, superCtrl.getAuditLogs);

router.get('/analytics', auth, requireSuperAdmin, superCtrl.getAnalytics);

router.get('/reports', auth, requireSuperAdmin, superCtrl.getReports);
router.patch('/reports/:id', auth, requireSuperAdmin, superCtrl.updateReportStatus);

router.get('/broadcasts', auth, requireSuperAdmin, superCtrl.getBroadcasts);
router.post('/broadcasts', auth, requireSuperAdmin, superCtrl.createBroadcast);

router.post('/users/bulk', auth, requireSuperAdmin, superCtrl.bulkUserAction);
router.post('/properties/bulk', auth, requireSuperAdmin, superCtrl.bulkPropertyAction);

router.get('/flags', auth, requireSuperAdmin, superCtrl.getFeatureFlags);
router.patch('/flags/:key', auth, requireSuperAdmin, superCtrl.updateFeatureFlag);

router.get('/fraud', auth, requireSuperAdmin, superCtrl.getFraudFlags);
router.patch('/fraud/:id/resolve', auth, requireSuperAdmin, superCtrl.resolveFraudFlag);



export default router;
