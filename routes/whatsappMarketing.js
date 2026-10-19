const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const waCtrl = require('../controllers/whatsappMarketingController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

const { requireSuperAdmin } = waCtrl;

router.get('/stats', authenticate, requireSuperAdmin, waCtrl.getDashboardStats);

router.get('/audience', authenticate, requireSuperAdmin, waCtrl.getAudienceEstimate);

router.get('/campaigns', authenticate, requireSuperAdmin, waCtrl.listCampaigns);
router.post(
  '/campaigns',
  [
    body('name').isString().trim().isLength({ min: 1, max: 200 }),
    body('kind').isIn(['template', 'text']),
    body('template_name').optional().isString().trim().isLength({ max: 128 }),
    body('template_language').optional().isString().trim().isLength({ max: 20 }),
    body('content').optional().isString().isLength({ max: 1000 }),
  ],
  validateRequest,
  authenticate,
  requireSuperAdmin,
  waCtrl.createCampaign
);
router.get('/campaigns/:id/stats', authenticate, requireSuperAdmin, waCtrl.getCampaignStats);
router.post('/campaigns/:id/send', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, waCtrl.sendCampaign);
router.post('/campaigns/:id/retry', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, waCtrl.retryCampaign);
router.delete('/campaigns/:id', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, waCtrl.deleteCampaign);

module.exports = router;
