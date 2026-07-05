const express = require('express');
const { authenticate } = require('../config/middleware/auth');
const {
  getReferralProgramForUser,
} = require('../services/referralService');

const router = express.Router();

router.get('/me', authenticate, async (req, res) => {
  try {
    const data = await getReferralProgramForUser({
      user: req.user,
      origin: req.get('origin'),
    });

    res.json({ success: true, data });
  } catch (error) {
    req.logger.error('Get referral program error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to load referral invite',
    });
  }
});

module.exports = router;
