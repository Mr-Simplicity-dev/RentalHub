const express = require('express');
const router = express.Router();
const {
  getPopularLocations,
  getPriceStatsByState,
  getSimilarProperties,
  getRecommendations,
} = require('../config/utils/propertyUtils');
const { getLocationOptions } = require('../config/utils/locationDirectory');
const { authenticate, isTenant } = require('../config/middleware/auth');

router.get('/popular-locations', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const locations = await getPopularLocations(limit);

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular locations',
    });
  }
});

router.get('/price-stats/:stateId', async (req, res) => {
  try {
    const { stateId } = req.params;
    const stats = await getPriceStatsByState(stateId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch price statistics',
    });
  }
});

router.get('/similar/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { limit = 5 } = req.query;
    const properties = await getSimilarProperties(propertyId, limit);

    res.json({
      success: true,
      data: properties,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch similar properties',
    });
  }
});

router.get('/recommendations', authenticate, isTenant, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const recommendations = await getRecommendations(req.user.id, limit);

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendations',
    });
  }
});

router.get('/location-options', async (req, res) => {
  try {
    const locations = await getLocationOptions();

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    console.error('Load location options error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch location options',
    });
  }
});

module.exports = router;
