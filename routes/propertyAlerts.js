const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { createTenantAlert } = require('../config/utils/propertyAlertService');

const allowedPropertyTypes = [
  'apartment',
  'house',
  'duplex',
  'studio',
  'bungalow',
  'flat',
  'room',
];

router.post(
  '/request',
  [
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

      const alert = await createTenantAlert(req.body);

      res.status(201).json({
        success: true,
        message:
          'Request submitted. We will notify you by email and WhatsApp when a matching property is available.',
        data: alert,
      });
    } catch (error) {
      console.error('Create property alert error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit request',
      });
    }
  }
);

module.exports = router;
