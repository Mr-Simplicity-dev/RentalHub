const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const emailCtrl = require('../controllers/emailMarketingController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

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
router.post('/subscribers', [body('email').isEmail().normalizeEmail(), body('full_name').optional().isString().trim().isLength({ max: 200 })], validateRequest, authenticate, requireSuperAdmin, emailCtrl.addSubscriber);
router.patch('/subscribers/:id', [param('id').isInt(), body('email').optional().isEmail().normalizeEmail(), body('full_name').optional().isString().trim().isLength({ max: 200 })], validateRequest, authenticate, requireSuperAdmin, emailCtrl.updateSubscriber);
router.delete('/subscribers/:id', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, emailCtrl.deleteSubscriber);

router.get('/templates', authenticate, requireSuperAdmin, emailCtrl.listTemplates);
router.post('/templates', [body('name').isString().trim().isLength({ min: 1, max: 200 }), body('subject').optional().isString().trim().isLength({ max: 500 }), body('htmlContent').optional().isString().isLength({ max: 100000 })], validateRequest, authenticate, requireSuperAdmin, emailCtrl.createTemplate);
router.patch('/templates/:id', [param('id').isInt(), body('name').optional().isString().trim().isLength({ max: 200 }), body('subject').optional().isString().trim().isLength({ max: 500 }), body('htmlContent').optional().isString().isLength({ max: 100000 })], validateRequest, authenticate, requireSuperAdmin, emailCtrl.updateTemplate);
router.delete('/templates/:id', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, emailCtrl.deleteTemplate);

router.get('/campaigns', authenticate, requireSuperAdmin, emailCtrl.listCampaigns);
router.post('/campaigns', [body('name').isString().trim().isLength({ min: 1, max: 200 }), body('template_id').optional().isInt()], validateRequest, authenticate, requireSuperAdmin, emailCtrl.createCampaign);
router.patch('/campaigns/:id', [param('id').isInt(), body('name').optional().isString().trim().isLength({ max: 200 })], validateRequest, authenticate, requireSuperAdmin, emailCtrl.updateCampaign);
router.delete('/campaigns/:id', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, emailCtrl.deleteCampaign);
router.post('/campaigns/:id/send', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, emailCtrl.sendCampaign);
router.get('/campaigns/:id/stats', authenticate, requireSuperAdmin, emailCtrl.getCampaignStats);

module.exports = router;
