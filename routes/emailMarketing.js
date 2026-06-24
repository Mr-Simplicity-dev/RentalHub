const express = require('express');
const router = express.Router();
const emailCtrl = require('../controllers/emailMarketingController');
const { authenticate } = require('../config/middleware/auth');

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.user_type === 'super_admin' || req.user?.is_admin) return next();
  return res.status(403).json({ success: false, message: 'Super admin access required' });
};

// Public unsubscribe page
router.get('/unsubscribe', emailCtrl.unsubscribe);

// Admin routes
router.get('/stats', authenticate, requireSuperAdmin, emailCtrl.getDashboardStats);

router.get('/subscribers', authenticate, requireSuperAdmin, emailCtrl.listSubscribers);
router.post('/subscribers/sync', authenticate, requireSuperAdmin, emailCtrl.syncSubscribers);
router.post('/subscribers', authenticate, requireSuperAdmin, emailCtrl.addSubscriber);
router.patch('/subscribers/:id', authenticate, requireSuperAdmin, emailCtrl.updateSubscriber);
router.delete('/subscribers/:id', authenticate, requireSuperAdmin, emailCtrl.deleteSubscriber);

router.get('/templates', authenticate, requireSuperAdmin, emailCtrl.listTemplates);
router.post('/templates', authenticate, requireSuperAdmin, emailCtrl.createTemplate);
router.patch('/templates/:id', authenticate, requireSuperAdmin, emailCtrl.updateTemplate);
router.delete('/templates/:id', authenticate, requireSuperAdmin, emailCtrl.deleteTemplate);

router.get('/campaigns', authenticate, requireSuperAdmin, emailCtrl.listCampaigns);
router.post('/campaigns', authenticate, requireSuperAdmin, emailCtrl.createCampaign);
router.patch('/campaigns/:id', authenticate, requireSuperAdmin, emailCtrl.updateCampaign);
router.delete('/campaigns/:id', authenticate, requireSuperAdmin, emailCtrl.deleteCampaign);
router.post('/campaigns/:id/send', authenticate, requireSuperAdmin, emailCtrl.sendCampaign);
router.get('/campaigns/:id/stats', authenticate, requireSuperAdmin, emailCtrl.getCampaignStats);

module.exports = router;
