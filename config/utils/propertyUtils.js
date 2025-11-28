const pool = require('../middleware/database');

// Get popular locations (most properties)
exports.getPopularLocations = async (limit = 10) => {
  try {
    const result = await pool.query(
      `SELECT 
         s.state_name, s.state_code, s.id as state_id,
         COUNT(p.id) as property_count
       FROM states s
       LEFT JOIN properties p ON s.id = p.state_id 
         AND p.is_available = TRUE 
         AND p.is_verified = TRUE
       GROUP BY s.id, s.state_name, s.state_code
       HAVING COUNT(p.id) > 0
       ORDER BY property_count DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting popular locations:', error);
    return [];
  }
};

// Get price statistics by state
exports.getPriceStatsByState = async (stateId) => {
  try {
    const result = await pool.query(
      `SELECT 
         MIN(rent_amount) as min_price,
         MAX(rent_amount) as max_price,
         AVG(rent_amount) as avg_price,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rent_amount) as median_price
       FROM properties
       WHERE state_id = $1 
         AND is_available = TRUE 
         AND is_verified = TRUE`,
      [stateId]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error getting price stats:', error);
    return null;
  }
};

// Get similar properties
exports.getSimilarProperties = async (propertyId, limit = 5) => {
  try {
    // Get the reference property
    const refProperty = await pool.query(
      'SELECT state_id, property_type, rent_amount, bedrooms FROM properties WHERE id = $1',
      [propertyId]
    );

    if (refProperty.rows.length === 0) {
      return [];
    }

    const ref = refProperty.rows[0];
    const priceRange = ref.rent_amount * 0.2; // 20% price range

    const result = await pool.query(
      `SELECT 
         p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
         p.rent_amount, p.payment_frequency, p.city, p.area,
         s.state_name,
         (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as primary_photo
       FROM properties p
       JOIN states s ON p.state_id = s.id
       WHERE p.id != $1
         AND p.state_id = $2
         AND p.property_type = $3
         AND p.rent_amount BETWEEN $4 AND $5
         AND p.is_available = TRUE
         AND p.is_verified = TRUE
       ORDER BY 
         ABS(p.bedrooms - $6) ASC,
         ABS(p.rent_amount - $7) ASC
       LIMIT $8`,
      [
        propertyId,
        ref.state_id,
        ref.property_type,
        ref.rent_amount - priceRange,
        ref.rent_amount + priceRange,
        ref.bedrooms,
        ref.rent_amount,
        limit
      ]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting similar properties:', error);
    return [];
  }
};

// Auto-expire properties (run as cron job)
exports.expireProperties = async () => {
  try {
    const result = await pool.query(
      `UPDATE properties 
       SET is_available = FALSE
       WHERE is_available = TRUE 
         AND expires_at IS NOT NULL
         AND expires_at < CURRENT_TIMESTAMP
       RETURNING id, title, landlord_id`
    );

    console.log(`Expired ${result.rows.length} properties`);
    return result.rows;
  } catch (error) {
    console.error('Error expiring properties:', error);
    return [];
  }
};

// Get property recommendations for tenant
exports.getRecommendations = async (userId, limit = 10) => {
  try {
    // Get user's saved properties to understand preferences
    const savedProperties = await pool.query(
      `SELECT p.state_id, p.property_type, p.rent_amount, p.bedrooms
       FROM saved_properties sp
       JOIN properties p ON sp.property_id = p.id
       WHERE sp.tenant_id = $1
       LIMIT 10`,
      [userId]
    );

    if (savedProperties.rows.length === 0) {
      // Return popular properties if no preferences
      const result = await pool.query(
        `SELECT 
           p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
           p.rent_amount, p.payment_frequency, p.city, p.area,
           s.state_name,
           (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as primary_photo,
           (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating
         FROM properties p
         JOIN states s ON p.state_id = s.id
         WHERE p.is_available = TRUE AND p.is_verified = TRUE
         ORDER BY p.featured DESC, p.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    }

    // Calculate average preferences
    const avgPrice = savedProperties.rows.reduce((sum, p) => sum + parseFloat(p.rent_amount), 0) / savedProperties.rows.length;
    const priceRange = avgPrice * 0.3;

    // Get most common state and property type
    const stateIds = savedProperties.rows.map(p => p.state_id);
    const propertyTypes = savedProperties.rows.map(p => p.property_type);

    const result = await pool.query(
      `SELECT 
         p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
         p.rent_amount, p.payment_frequency, p.city, p.area,
         s.state_name,
         (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as primary_photo,
         (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating
       FROM properties p
       JOIN states s ON p.state_id = s.id
       WHERE p.is_available = TRUE 
         AND p.is_verified = TRUE
         AND p.id NOT IN (SELECT property_id FROM saved_properties WHERE tenant_id = $1)
         AND (p.state_id = ANY($2) OR p.property_type = ANY($3))
         AND p.rent_amount BETWEEN $4 AND $5
       ORDER BY 
         CASE WHEN p.state_id = ANY($2) THEN 1 ELSE 2 END,
         CASE WHEN p.property_type = ANY($3) THEN 1 ELSE 2 END,
         p.featured DESC,
         p.created_at DESC
       LIMIT $6`,
      [userId, stateIds, propertyTypes, avgPrice - priceRange, avgPrice + priceRange, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return [];
  }
};

module.exports = exports;

const express = require('express');
const router = express.Router();
const { 
  getPopularLocations, 
  getPriceStatsByState, 
  getSimilarProperties,
  getRecommendations 
} = require('../utils/propertyUtils');
const { authenticate, isTenant } = require('../middleware/auth');

// Get popular locations
router.get('/popular-locations', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const locations = await getPopularLocations(limit);

    res.json({
      success: true,
      data: locations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular locations'
    });
  }
});

// Get price statistics by state
router.get('/price-stats/:stateId', async (req, res) => {
  try {
    const { stateId } = req.params;
    const stats = await getPriceStatsByState(stateId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch price statistics'
    });
  }
});

// Get similar properties
router.get('/similar/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { limit = 5 } = req.query;
    const properties = await getSimilarProperties(propertyId, limit);

    res.json({
      success: true,
      data: properties
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch similar properties'
    });
  }
});

// Get recommendations for tenant
router.get('/recommendations', authenticate, isTenant, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;
    const recommendations = await getRecommendations(userId, limit);

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendations'
    });
  }
});

module.exports = router;