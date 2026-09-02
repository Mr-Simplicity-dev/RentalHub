const express = require('express');
const { query } = require('express-validator');
const { getRentStats } = require('../services/rentStatsService');
const validateRequest = require('../config/middleware/validateRequest');

const router = express.Router();

// Public rent index by state — blends survey-reported paid rents (T1.8/L1.6)
// with live listing medians. Every state reports its sample sizes so the
// figure can never be mistaken for a full-market average.
router.get(
  '/rent-stats',
  [
    query('state').optional().isString().trim().isLength({ min: 2, max: 60 }),
    query('state').optional().matches(/^[a-zA-Z\s.-]+$/),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const stateName = req.query.state ? String(req.query.state).trim() : null;
      const data = await getRentStats({ stateName });

      if (stateName && !data) {
        return res.status(404).json({
          success: false,
          message: 'No rent data available for that state yet',
        });
      }

      return res.json({
        success: true,
        data,
        meta: {
          method: 'blended_survey_listings',
          note: 'Estimates blend survey-reported paid rents with verified listing medians. Figures are indicative, not a full-market average.',
        },
      });
    } catch (error) {
      req.logger.error('Rent stats error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to load rent statistics',
      });
    }
  }
);

module.exports = router;
