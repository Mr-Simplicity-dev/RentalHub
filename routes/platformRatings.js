const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../config/middleware/auth');
const platformRatingCtrl = require('../controllers/platformRatingController');

const router = express.Router();

router.get('/public', platformRatingCtrl.getPublicRatings);

router.get('/opportunities', authenticate, platformRatingCtrl.getOpportunities);

router.post(
  '/',
  authenticate,
  [
    body('stars').isInt({ min: 1, max: 5 }),
    body('rating_context').isString().trim(),
    body('source_type').isString().trim(),
    body('source_ref').isString().trim(),
    body('comment').optional({ checkFalsy: true }).trim().customSanitizer(v => v ? v.replace(/<[^>]*>/g, '') : v).isLength({ max: 5000 }),
  ],
  platformRatingCtrl.submitRating
);

module.exports = router;
