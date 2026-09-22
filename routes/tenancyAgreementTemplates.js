const express = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const templateService = require('../services/tenancyAgreementTemplateService');
const { listJurisdictions, resolveJurisdiction } = require('../config/utils/tenancyJurisdiction');

const router = express.Router();

const TEMPLATE_ADMIN_ROLES = new Set([
  'super_admin',
  'lawyer',
  'state_lawyer',
  'super_lawyer',
  'state_admin',
]);

const requireTemplateAdmin = (req, res, next) => {
  if (!req.user || !TEMPLATE_ADMIN_ROLES.has(req.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Legal administration access only' });
  }
  return next();
};

const handleError = (res, error, fallbackMessage) => {
  if (error && error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: fallbackMessage });
};

// Configured jurisdiction values (configuration, pending legal approval)
router.get('/jurisdictions', authenticate, requireTemplateAdmin, (req, res) => {
  const state = req.query.state;
  if (state) {
    return res.json({ success: true, data: resolveJurisdiction({ state, lga: req.query.lga }) });
  }
  return res.json({ success: true, data: listJurisdictions() });
});

router.get('/', authenticate, requireTemplateAdmin, async (req, res) => {
  try {
    const data = await templateService.listTemplates({
      jurisdictionCode: req.query.jurisdiction_code || null,
      status: req.query.status || null,
    });
    return res.json({ success: true, data });
  } catch (error) {
    req.logger.error('List tenancy templates error:', error);
    return handleError(res, error, 'Failed to load templates');
  }
});

router.post(
  '/',
  authenticate,
  requireTemplateAdmin,
  [
    body('jurisdiction_code').isString().trim().isLength({ min: 2, max: 40 }),
    body('name').isString().trim().isLength({ min: 3, max: 200 }),
    body('jurisdiction_name').optional().isString().trim().isLength({ max: 120 }),
    body('state').optional().isString().trim().isLength({ max: 80 }),
    body('body').optional().isObject(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const data = await templateService.createTemplate(req.user, req.body);
      return res.status(201).json({ success: true, data });
    } catch (error) {
      req.logger.error('Create tenancy template error:', error);
      return handleError(res, error, 'Failed to create template');
    }
  }
);

router.patch(
  '/:id/status',
  authenticate,
  requireTemplateAdmin,
  [param('id').isInt({ min: 1 }), body('status').isIn(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'RETIRED'])],
  validateRequest,
  async (req, res) => {
    try {
      const data = await templateService.updateTemplateStatus(req.user, Number(req.params.id), req.body.status);
      return res.json({ success: true, data });
    } catch (error) {
      req.logger.error('Update tenancy template status error:', error);
      return handleError(res, error, 'Failed to update template status');
    }
  }
);

module.exports = router;
