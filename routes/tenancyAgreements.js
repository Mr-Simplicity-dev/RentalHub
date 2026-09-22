const express = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const tenancyAgreementService = require('../services/tenancyAgreementService');
const { streamAgreementDocument } = require('../services/tenancyAgreementDocument');

const router = express.Router();

const requestMeta = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'] || null,
});

const handleError = (res, error, fallbackMessage) => {
  if (error && error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: fallbackMessage });
};

// List agreements visible to the authenticated user (landlord/tenant/agent/super admin)
router.get('/', authenticate, async (req, res) => {
  try {
    const data = await tenancyAgreementService.listAgreementsForUser(req.user, { status: req.query.status });
    return res.json({ success: true, data });
  } catch (error) {
    req.logger.error('List tenancy agreements error:', error);
    return handleError(res, error, 'Failed to load tenancy agreements');
  }
});

// Create a draft agreement for an approved application
router.post(
  '/',
  authenticate,
  [body('application_id').isInt({ min: 1 })],
  validateRequest,
  async (req, res) => {
    try {
      const result = await tenancyAgreementService.createDraftAgreementFromApplication({
        applicationId: Number(req.body.application_id),
        actorUserId: req.user.id,
        ip: req.ip,
      });
      return res.status(result.created ? 201 : 200).json({
        success: true,
        message: result.created ? 'Tenancy agreement created' : 'Tenancy agreement already exists',
        data: result,
      });
    } catch (error) {
      req.logger.error('Create tenancy agreement error:', error);
      return handleError(res, error, 'Failed to create tenancy agreement');
    }
  }
);

router.get(
  '/:id',
  authenticate,
  [param('id').isInt({ min: 1 })],
  validateRequest,
  async (req, res) => {
    try {
      const data = await tenancyAgreementService.getAgreementDetail(Number(req.params.id), req.user, req.ip);
      return res.json({ success: true, data });
    } catch (error) {
      req.logger.error('Get tenancy agreement error:', error);
      return handleError(res, error, 'Failed to load tenancy agreement');
    }
  }
);

// Record that a party has reviewed and accepted the terms (before signing)
router.post(
  '/:id/review',
  authenticate,
  [param('id').isInt({ min: 1 }), body('role').isIn(['landlord', 'tenant'])],
  validateRequest,
  async (req, res) => {
    try {
      const result = await tenancyAgreementService.reviewAgreement({
        agreementId: Number(req.params.id),
        user: req.user,
        role: req.body.role,
        ip: req.ip,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      req.logger.error('Review tenancy agreement error:', error);
      return handleError(res, error, 'Failed to review tenancy agreement');
    }
  }
);

// Electronically sign the agreement (server-authoritative; idempotent)
router.post(
  '/:id/sign',
  authenticate,
  [
    param('id').isInt({ min: 1 }),
    body('role').isIn(['landlord', 'tenant']),
    body('consent').isBoolean(),
    body('signatory_name').optional().isString().trim().isLength({ max: 200 }),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const meta = requestMeta(req);
      const result = await tenancyAgreementService.signAgreement({
        agreementId: Number(req.params.id),
        user: req.user,
        role: req.body.role,
        consent: req.body.consent === true,
        signatoryName: req.body.signatory_name,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      req.logger.error('Sign tenancy agreement error:', error);
      return handleError(res, error, 'Failed to sign tenancy agreement');
    }
  }
);

router.post(
  '/:id/decline',
  authenticate,
  [param('id').isInt({ min: 1 }), body('role').optional().isIn(['landlord', 'tenant']), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  async (req, res) => {
    try {
      const result = await tenancyAgreementService.declineAgreement({
        agreementId: Number(req.params.id),
        user: req.user,
        role: req.body.role,
        reason: req.body.reason || null,
        ip: req.ip,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      req.logger.error('Decline tenancy agreement error:', error);
      return handleError(res, error, 'Failed to decline tenancy agreement');
    }
  }
);

router.post(
  '/:id/amend',
  authenticate,
  [param('id').isInt({ min: 1 }), body('changes').isObject(), body('note').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  async (req, res) => {
    try {
      const result = await tenancyAgreementService.requestAmendment({
        agreementId: Number(req.params.id),
        user: req.user,
        role: req.body.role,
        changes: req.body.changes,
        note: req.body.note || null,
        ip: req.ip,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      req.logger.error('Amend tenancy agreement error:', error);
      return handleError(res, error, 'Failed to amend tenancy agreement');
    }
  }
);

// Structured document payload for rendering (PDF rendering is a later phase)
router.get(
  '/:id/document',
  authenticate,
  [param('id').isInt({ min: 1 })],
  validateRequest,
  async (req, res) => {
    try {
      const data = await tenancyAgreementService.getAgreementDetail(Number(req.params.id), req.user, req.ip);
      return res.json({
        success: true,
        data: {
          agreement_id: data.id,
          version: data.current_version,
          status: data.status,
          document_hash: data.document_hash,
          terms: data.terms,
          jurisdiction: data.jurisdiction,
          signatures: data.signatures,
        },
      });
    } catch (error) {
      req.logger.error('Get tenancy agreement document error:', error);
      return handleError(res, error, 'Failed to load agreement document');
    }
  }
);

// Rendered PDF document (server-generated, immutable source data)
router.get(
  '/:id/document.pdf',
  authenticate,
  [param('id').isInt({ min: 1 })],
  validateRequest,
  async (req, res) => {
    try {
      const agreement = await tenancyAgreementService.getAgreementForDocument(Number(req.params.id), req.user);
      await streamAgreementDocument(res, agreement);
    } catch (error) {
      req.logger.error('Stream tenancy agreement document error:', error);
      if (!res.headersSent) {
        return handleError(res, error, 'Failed to render agreement document');
      }
    }
  }
);

router.get(
  '/:id/audit',
  authenticate,
  [param('id').isInt({ min: 1 })],
  validateRequest,
  async (req, res) => {
    try {
      const data = await tenancyAgreementService.getAgreementAudit(Number(req.params.id), req.user);
      return res.json({ success: true, data });
    } catch (error) {
      req.logger.error('Get tenancy agreement audit error:', error);
      return handleError(res, error, 'Failed to load agreement audit trail');
    }
  }
);

module.exports = router;
