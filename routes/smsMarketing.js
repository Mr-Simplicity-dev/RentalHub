const express = require('express');
const router = express.Router();
const smsCtrl = require('../controllers/smsMarketingController');
const { authenticate } = require('../config/middleware/auth');

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.user_type === 'super_admin' || req.user?.is_admin) return next();
  return res.status(403).json({ success: false, message: 'Super admin access required' });
};

router.get('/stats', authenticate, requireSuperAdmin, smsCtrl.getDashboardStats);

router.get('/subscribers', authenticate, requireSuperAdmin, smsCtrl.listSubscribers);
router.post('/subscribers/sync', authenticate, requireSuperAdmin, smsCtrl.syncSubscribers);
router.post('/subscribers', authenticate, requireSuperAdmin, smsCtrl.addSubscriber);
router.post('/subscribers/import', authenticate, requireSuperAdmin, smsCtrl.importSubscribers);
router.patch('/subscribers/:id', authenticate, requireSuperAdmin, smsCtrl.updateSubscriber);
router.delete('/subscribers/:id', authenticate, requireSuperAdmin, smsCtrl.deleteSubscriber);

router.get('/templates', authenticate, requireSuperAdmin, smsCtrl.listTemplates);
router.post('/templates', authenticate, requireSuperAdmin, smsCtrl.createTemplate);
router.patch('/templates/:id', authenticate, requireSuperAdmin, smsCtrl.updateTemplate);
router.delete('/templates/:id', authenticate, requireSuperAdmin, smsCtrl.deleteTemplate);

router.get('/campaigns', authenticate, requireSuperAdmin, smsCtrl.listCampaigns);
router.post('/campaigns', authenticate, requireSuperAdmin, smsCtrl.createCampaign);
router.patch('/campaigns/:id', authenticate, requireSuperAdmin, smsCtrl.updateCampaign);
router.delete('/campaigns/:id', authenticate, requireSuperAdmin, smsCtrl.deleteCampaign);
router.post('/campaigns/:id/send', authenticate, requireSuperAdmin, smsCtrl.sendCampaign);
router.post('/campaigns/:id/retry', authenticate, requireSuperAdmin, smsCtrl.retryCampaign);
router.get('/campaigns/:id/stats', authenticate, requireSuperAdmin, smsCtrl.getCampaignStats);

module.exports = router;
