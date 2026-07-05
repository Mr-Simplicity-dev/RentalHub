const express = require('express');
const router = express.Router();
const axios = require('axios');
const { body, param, validationResult } = require('express-validator');
const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
const { getFrontendUrl } = require('../config/utils/frontendUrl');
const { resolveLocationSelection } = require('../config/utils/locationDirectory');
const { getLocationPricingQuote } = require('../config/utils/locationPricing');
const {
  ALERT_REQUEST_FEE_NGN,
  createTenantAlert,
  createTenantAlertFromPayment,
  createTenantAlertPayment,
  getTenantAlertById,
  getTenantAlertPaymentByReference,
  listAssignableAdminsForPropertyRequest,
  listTenantPropertyRequestsForAdmin,
  markTenantAlertPaymentCompleted,
  resendTenantPropertyRequestNotifications,
  reviewTenantPropertyRequest,
  updateTenantPropertyRequestStateAction,
} = require('../config/utils/propertyAlertService');

const allowedPropertyTypes = [
  'apartment',
  'house',
  'duplex',
  'studio',
  'bungalow',
  'flat',
  'room',
];

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const resolveFrontendUrl = (req) => getFrontendUrl(req.get('origin'));

const requestValidators = [
  body('full_name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phone').optional().isString(),
  body('property_type').isIn(allowedPropertyTypes),
  body('state_id').optional({ checkFalsy: true }).isInt(),
  body('lga_name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 120 }),
  body('city').optional().trim(),
  body('min_price').optional().isFloat({ min: 0 }),
  body('max_price').optional().isFloat({ min: 0 }),
  body('bedrooms').optional().isInt({ min: 0 }),
  body('bathrooms').optional().isInt({ min: 0 }),
];

router.get('/config', async (req, res) => {
  try {
    const flags = await getFeatureFlagsMap();

    res.json({
      success: true,
      data: {
        payment_required: flags.property_alert_payment === true,
        location_required: flags.property_alert_payment === true,
        ...(await getLocationPricingQuote({
          appliesTo: 'property_alert_request',
          stateId: req.query.state_id,
          lgaName: req.query.lga_name,
        })),
      },
    });
  } catch (error) {
    req.logger.error('Load property alert config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load notification request settings',
    });
  }
});

router.post(
  '/request',
  requestValidators,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const payload = {
        full_name: req.body.full_name.trim(),
        email: req.body.email.trim().toLowerCase(),
        phone: req.body.phone?.trim() || null,
        property_type: req.body.property_type,
        state_id: req.body.state_id ? Number(req.body.state_id) : null,
        lga_name: req.body.lga_name?.trim() || null,
        city: req.body.city?.trim() || null,
        min_price: req.body.min_price || null,
        max_price: req.body.max_price || null,
        bedrooms: req.body.bedrooms || null,
        bathrooms: req.body.bathrooms || null,
      };

      const flags = await getFeatureFlagsMap();
      const paymentRequired = flags.property_alert_payment === true;
      let pricing = {
        amount: ALERT_REQUEST_FEE_NGN,
        base_amount: ALERT_REQUEST_FEE_NGN,
        rule_scope: 'base',
      };

      if (payload.state_id || payload.lga_name) {
        const resolvedLocation = await resolveLocationSelection({
          stateId: payload.state_id,
          lgaName: payload.lga_name,
          requireLga: paymentRequired,
        });

        payload.state_id = resolvedLocation.state_id;
        payload.lga_name = resolvedLocation.lga_name;

        pricing = await getLocationPricingQuote({
          appliesTo: 'property_alert_request',
          stateId: resolvedLocation.state_id,
          lgaName: resolvedLocation.lga_name,
        });
      }

      if (!paymentRequired) {
        const alert = await createTenantAlert(payload);

        return res.status(201).json({
          success: true,
          payment_required: false,
          message:
            'Request submitted. Support admin will review it and assign it to the state team before sourcing starts.',
          data: alert,
        });
      }

      if (!payload.state_id) {
        return res.status(400).json({
          success: false,
          message: 'State is required to calculate the request fee',
        });
      }

      if (!payload.lga_name) {
        return res.status(400).json({
          success: false,
          message: 'Local government area is required to calculate the request fee',
        });
      }

      if (!PAYSTACK_SECRET_KEY) {
        return res.status(500).json({
          success: false,
          message: 'Payment service is not configured',
        });
      }

      const reference = `ALERT_${Date.now()}`;

      await createTenantAlertPayment({
        ...payload,
        amount: pricing.amount,
        transaction_reference: reference,
      });

      const callbackUrl =
        `${resolveFrontendUrl(req)}/properties?request=1&alert_ref=${encodeURIComponent(reference)}`;

      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: payload.email,
          amount: pricing.amount * 100,
          reference,
          callback_url: callbackUrl,
          metadata: {
            payment_type: 'tenant_property_alert',
            property_type: payload.property_type,
            state_id: payload.state_id,
            lga_name: payload.lga_name,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      res.status(200).json({
        success: true,
        payment_required: true,
        message:
          `Payment of N${pricing.amount.toLocaleString()} is required before we can process your notification request.`,
        data: {
          amount: pricing.amount,
          base_amount: pricing.base_amount,
          rule_scope: pricing.rule_scope,
          reference,
          authorization_url: paystackResponse.data.data.authorization_url,
          access_code: paystackResponse.data.data.access_code,
        },
      });
    } catch (error) {
      req.logger.error('Initialize property alert payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize notification payment',
      });
    }
  }
);

router.post(
  '/request/complete/:reference',
  [param('reference').trim().notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      if (!PAYSTACK_SECRET_KEY) {
        return res.status(500).json({
          success: false,
          message: 'Payment service is not configured',
        });
      }

      const { reference } = req.params;
      let payment = await getTenantAlertPaymentByReference(reference);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Notification payment record not found',
        });
      }

      if (payment.created_alert_id) {
        const existingAlert = await getTenantAlertById(payment.created_alert_id);

        return res.json({
          success: true,
          message:
            'Request submitted. Support admin will review it and assign it to the state team before sourcing starts.',
          data: existingAlert,
        });
      }

      if (payment.payment_status !== 'completed') {
        const paystackResponse = await axios.get(
          `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
          }
        );

        const transaction = paystackResponse.data.data;

        if (transaction.status !== 'success') {
          return res.status(402).json({
            success: false,
            payment_required: true,
            message: 'Notification payment is not completed yet',
          });
        }

        const amountPaid = Number(transaction.amount || 0) / 100;

        if (amountPaid < Number(payment.amount)) {
          return res.status(402).json({
            success: false,
            payment_required: true,
            message: 'Notification payment amount is insufficient',
          });
        }

        payment = await markTenantAlertPaymentCompleted(reference, transaction);
      }

      const alert = await createTenantAlertFromPayment(payment);

      res.json({
        success: true,
        message:
          'Request submitted. Support admin will review it and assign it to the state team before sourcing starts.',
        data: alert,
      });
    } catch (error) {
      req.logger.error('Complete property alert payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete notification request',
      });
    }
  }
);

router.get(
  '/admin/requests',
  authenticate,
  allowRoles(
    'super_admin',
    'super_support_admin',
    'state_support_admin',
    'lga_support_admin',
    'state_admin',
    'state_financial_admin',
    'admin',
    'lga_admin'
  ),
  async (req, res) => {
    try {
      const requests = await listTenantPropertyRequestsForAdmin({
        viewer: req.user,
        status: req.query.status || 'all',
        limit: req.query.limit || 50,
      });

      res.json({
        success: true,
        data: requests,
      });
    } catch (error) {
      req.logger.error('List property requests error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to load property requests',
      });
    }
  }
);

router.get(
  '/admin/assignable-admins',
  authenticate,
  allowRoles('super_admin', 'super_support_admin', 'state_support_admin', 'lga_support_admin'),
  async (req, res) => {
    try {
      const admins = await listAssignableAdminsForPropertyRequest({
        viewer: req.user,
        stateName: req.query.state_name || null,
      });

      res.json({
        success: true,
        data: admins,
      });
    } catch (error) {
      req.logger.error('List assignable property request admins error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to load assignable admins',
      });
    }
  }
);

router.patch(
  '/admin/requests/:requestId/support-review',
  authenticate,
  allowRoles('super_admin', 'super_support_admin', 'state_support_admin', 'lga_support_admin'),
  [
    param('requestId').isInt(),
    body('decision').isIn(['approved', 'rejected']),
    body('review_note').optional({ checkFalsy: true }).trim(),
    body('assigned_admin_id').optional({ checkFalsy: true }).isInt(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const request = await reviewTenantPropertyRequest({
        alertId: Number(req.params.requestId),
        reviewer: req.user,
        decision: req.body.decision,
        note: req.body.review_note || '',
        assignedAdminId: req.body.assigned_admin_id || null,
      });

      res.json({
        success: true,
        message:
          req.body.decision === 'approved'
            ? 'Property request approved and sent to the state team'
            : 'Property request rejected',
        data: request,
      });
    } catch (error) {
      req.logger.error('Review property request error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to review property request',
      });
    }
  }
);

router.patch(
  '/admin/requests/:requestId/state-action',
  authenticate,
  allowRoles('state_admin', 'state_financial_admin', 'admin', 'lga_admin'),
  [
    param('requestId').isInt(),
    body('action').isIn(['sourcing', 'lga_missing', 'fulfilled']),
    body('note').optional({ checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const request = await updateTenantPropertyRequestStateAction({
        alertId: Number(req.params.requestId),
        actor: req.user,
        action: req.body.action,
        note: req.body.note || '',
      });

      res.json({
        success: true,
        message: 'Property request updated',
        data: request,
      });
    } catch (error) {
      req.logger.error('State property request action error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to update property request',
      });
    }
  }
);

router.post(
  '/admin/requests/:requestId/resend-notifications',
  authenticate,
  allowRoles(
    'super_admin',
    'super_support_admin',
    'state_support_admin',
    'lga_support_admin',
    'state_admin',
    'state_financial_admin',
    'admin',
    'lga_admin'
  ),
  [
    param('requestId').isInt(),
    body('target').isIn(['landlords', 'lga_admins']),
    body('admin_scope').optional({ checkFalsy: true }).isIn(['request_lga', 'specific_lga', 'all_state_lgas']),
    body('state_names').optional().isArray(),
    body('lga_names').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const result = await resendTenantPropertyRequestNotifications({
        alertId: Number(req.params.requestId),
        actor: req.user,
        target: req.body.target,
        adminScope: req.body.admin_scope || 'request_lga',
        stateNames: req.body.state_names || [],
        lgaNames: req.body.lga_names || [],
        force: true,
      });

      res.json({
        success: true,
        message: `Notification sent to ${result.sent} recipient${result.sent === 1 ? '' : 's'}`,
        data: result,
      });
    } catch (error) {
      req.logger.error('Resend property request notifications error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to send request notifications',
      });
    }
  }
);

module.exports = router;
