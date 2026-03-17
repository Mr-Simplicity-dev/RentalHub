const express = require('express');
const router = express.Router();
const axios = require('axios');
const { body, param, validationResult } = require('express-validator');
const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
const {
  ALERT_REQUEST_FEE_NGN,
  createTenantAlert,
  createTenantAlertFromPayment,
  createTenantAlertPayment,
  getTenantAlertById,
  getTenantAlertPaymentByReference,
  markTenantAlertPaymentCompleted,
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
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';'http://rentalhub.com.ng/';

const resolveFrontendUrl = (req) => {
  const configuredFrontendUrl = process.env.FRONTEND_URL;

  if (configuredFrontendUrl && configuredFrontendUrl !== '...') {
    return configuredFrontendUrl.replace(/\/$/, '');
  }

  const origin = req.get('origin');

  if (origin) {
    return origin.replace(/\/$/, '');
  }

  return DEFAULT_FRONTEND_URL;
};

const requestValidators = [
  body('full_name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phone').optional().isString(),
  body('property_type').isIn(allowedPropertyTypes),
  body('state_id').optional().isInt(),
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
        amount: ALERT_REQUEST_FEE_NGN,
      },
    });
  } catch (error) {
    console.error('Load property alert config error:', error);
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
        city: req.body.city?.trim() || null,
        min_price: req.body.min_price || null,
        max_price: req.body.max_price || null,
        bedrooms: req.body.bedrooms || null,
        bathrooms: req.body.bathrooms || null,
      };

      const flags = await getFeatureFlagsMap();
      const paymentRequired = flags.property_alert_payment === true;

      if (!paymentRequired) {
        const alert = await createTenantAlert(payload);

        return res.status(201).json({
          success: true,
          payment_required: false,
          message:
            'Request submitted. We will notify you by email and WhatsApp when a matching property is available.',
          data: alert,
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
        transaction_reference: reference,
      });

      const callbackUrl =
        `${resolveFrontendUrl(req)}/properties?request=1&alert_ref=${encodeURIComponent(reference)}`;

      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: payload.email,
          amount: ALERT_REQUEST_FEE_NGN * 100,
          reference,
          callback_url: callbackUrl,
          metadata: {
            payment_type: 'tenant_property_alert',
            property_type: payload.property_type,
            state_id: payload.state_id,
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
          'Payment of N5,000 is required before we can process your notification request.',
        data: {
          amount: ALERT_REQUEST_FEE_NGN,
          reference,
          authorization_url: paystackResponse.data.data.authorization_url,
          access_code: paystackResponse.data.data.access_code,
        },
      });
    } catch (error) {
      console.error('Initialize property alert payment error:', error);
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
            'Request submitted. We will notify you by email and WhatsApp when a matching property is available.',
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

        if (amountPaid < ALERT_REQUEST_FEE_NGN) {
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
          'Request submitted. We will notify you by email and WhatsApp when a matching property is available.',
        data: alert,
      });
    } catch (error) {
      console.error('Complete property alert payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete notification request',
      });
    }
  }
);

module.exports = router;
