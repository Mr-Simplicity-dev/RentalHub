const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const smsCtrl = require('../controllers/smsMarketingController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.user_type === 'super_admin' || req.user?.is_admin) return next();
  return res.status(403).json({ success: false, message: 'Super admin access required' });
};

router.get('/stats', authenticate, requireSuperAdmin, smsCtrl.getDashboardStats);

router.get('/subscribers', authenticate, requireSuperAdmin, smsCtrl.listSubscribers);
router.post('/subscribers/sync', authenticate, requireSuperAdmin, smsCtrl.syncSubscribers);
router.post('/subscribers', [body('phone').isString().trim().isLength({ min: 5, max: 20 }), body('full_name').optional().isString().trim().isLength({ max: 200 })], validateRequest, authenticate, requireSuperAdmin, smsCtrl.addSubscriber);
router.post('/subscribers/import', authenticate, requireSuperAdmin, smsCtrl.importSubscribers);
router.patch('/subscribers/:id', [param('id').isInt(), body('phone').optional().isString().trim().isLength({ max: 20 }), body('full_name').optional().isString().trim().isLength({ max: 200 })], validateRequest, authenticate, requireSuperAdmin, smsCtrl.updateSubscriber);
router.delete('/subscribers/:id', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, smsCtrl.deleteSubscriber);

router.get('/templates', authenticate, requireSuperAdmin, smsCtrl.listTemplates);
router.post('/templates', [body('name').isString().trim().isLength({ min: 1, max: 200 }), body('content').optional().isString().isLength({ max: 10000 })], validateRequest, authenticate, requireSuperAdmin, smsCtrl.createTemplate);
router.patch('/templates/:id', [param('id').isInt(), body('name').optional().isString().trim().isLength({ max: 200 }), body('content').optional().isString().isLength({ max: 10000 })], validateRequest, authenticate, requireSuperAdmin, smsCtrl.updateTemplate);
router.delete('/templates/:id', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, smsCtrl.deleteTemplate);

router.get('/campaigns', authenticate, requireSuperAdmin, smsCtrl.listCampaigns);
router.post('/campaigns', [body('name').isString().trim().isLength({ min: 1, max: 200 }), body('template_id').optional().isInt()], validateRequest, authenticate, requireSuperAdmin, smsCtrl.createCampaign);
router.patch('/campaigns/:id', [param('id').isInt(), body('name').optional().isString().trim().isLength({ max: 200 })], validateRequest, authenticate, requireSuperAdmin, smsCtrl.updateCampaign);
router.delete('/campaigns/:id', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, smsCtrl.deleteCampaign);
router.post('/campaigns/:id/send', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, smsCtrl.sendCampaign);
router.post('/campaigns/:id/retry', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, smsCtrl.retryCampaign);
router.get('/campaigns/:id/stats', authenticate, requireSuperAdmin, smsCtrl.getCampaignStats);

module.exports = router;
